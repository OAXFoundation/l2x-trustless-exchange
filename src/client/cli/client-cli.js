#!/usr/bin/env node
// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
const fs = require('fs')
const Path = require('path')
const Minimist = require('minimist')
const BigNumber = require('bignumber.js')
const Colors = require('colors/safe')
const Ethers = require('ethers')
const Providers = require('ethers/providers')
const Moment = require('moment')
const Prompt = require('promptly')
const ShellParse = require('shell-quote').parse
const knex = require('knex')

const Client = require('../index.js')
const ConsoleLib = require('./consolelib.js')

let dbConn = null
let config = null
let wallet = null
let client = null
let state = null

async function run() {
  process.on('SIGINT', async () => {
    await gracefulShutdown()
  })

  const stdInText = await require('get-stdin')()

  let argvList = []
  let isBatch = false
  if (stdInText !== '') {
    const cmdLines = stdInText.split('\n')

    for (let i = 0; i < cmdLines.length; i++) {
      const cmdLine = cmdLines[i].trim()

      if (cmdLine === '') {
        continue
      }

      const argv = ShellParse(cmdLine)
      argvList.push(Minimist(argv, { string: ['_'] }))
    }

    isBatch = true
  } else {
    argvList.push(Minimist(process.argv.slice(2), { string: ['_'] }))
  }

  const firstCommand = argvList[0]._[0]

  if (firstCommand === 'help' || firstCommand == '?') {
    printHelp()
    return
  }

  if (firstCommand === 'init') {
    createConfigFile()
    return
  }

  // Load config
  config = loadConfig()

  if (firstCommand === 'version') {
    await version()
    return
  }

  dbConn = knex({
    client: 'sqlite3',
    connection: {
      filename: `./oax-client-${config.mediatorAddress}.sqlite`
    },
    useNullAsDefault: true
  })

  if (firstCommand === 'createWallet') {
    await createWallet(config)
    return
  }

  // Load state
  state = {} //loadState()

  // Load Wallet
  wallet = await loadWallet(config)

  if (firstCommand === 'console') {
    await runConsole(config, wallet, state)
  } else {
    await runStandalone(argvList, config, wallet, state, isBatch)
  }
}

async function version() {
  console.log('Client', Client.version)
  try {
    const httpClient = new Client.HTTPClient(new URL(config.hubUrl))
    console.log('Server', await httpClient.version())
  } catch (err) {
    console.log('Server', err.message)
  }
}

async function runConsole(config, wallet, state) {
  client = await loadClient(config, state, wallet)

  const commands = new Set([
    'getWalletAddress',
    'buy',
    'fetchBalances',
    'fetchWalletBalance',
    'fetchEtherBalance',
    'fetchOrderBook',
    'fetchTrades',
    'fetchOrder',
    'fetchOrders',
    'createOrder',
    'cancelOrder',
    'deposit',
    'requestWithdrawal',
    'confirmWithdrawal',
    'help',
    'version',
    '?',
    'quit'
  ])

  // Join Hub
  console.log('Connecting...')
  await client.join()

  console.log('')
  console.log("OAX console. Type 'help' for more info or 'quit' to exit.")

  await ConsoleLib.run(commands, executeConsoleCommand)
}

async function runStandalone(argvList, config, wallet, state, isBatch) {
  let client = null
  try {
    for (let i = 0; i < argvList.length; i++) {
      const argv = argvList[i]

      // Parse command
      const cmd = parseCommand(argv)

      if (cmd.offline) {
        await executeCommand(config, wallet, null, cmd, isBatch)
        continue
      }

      if (client === null) {
        // Load client
        client = await loadClient(config, state, wallet)

        // Join Hub
        console.log('Connecting...')

        await client.join()
        //saveState(client)
      }

      // Execute Command
      await executeCommand(config, wallet, client, cmd, isBatch)
    }
  } finally {
    await gracefulShutdown()
  }
}

async function gracefulShutdown() {
  console.log('Shutting down...')

  if (client !== null) {
    try {
      await client.leave()
    } catch (e) {
      console.error(e)
    }

    client = null
  }

  if (dbConn != null) {
    try {
      await dbConn.destroy()
    } catch (e) {
      console.error(e)
    }

    dbConn = null
  }

  process.exit(0)
}

async function executeConsoleCommand(command, args) {
  let argv = [command]
  argv = argv.concat(args)

  try {
    const cmd = parseCommand({ _: argv })

    await executeCommand(config, wallet, client, cmd, false /* isBatch */)
  } catch (err) {
    if (err instanceof ApplicationError) {
      console.log(err.message)
    } else {
      console.log(err)
    }
  }
}

function parseCommand(argv) {
  let name = argv._[0]

  if (!name) {
    printHelp()
    process.exit(1)
  }

  let cmd = {}
  let pair = null
  let amount = null
  let symbol = null

  switch (name) {
    case 'getWalletAddress':
      cmd.offline = true
      break
    case 'buy':
      symbol = argv._[1]
      if (!symbol) {
        throw new ApplicationError('No symbol specified.')
      }
      amount = argv._[2]
      if (!amount) {
        throw new ApplicationError('No amount specified.')
      }
      cmd.args = [symbol, amount]
      break
    case 'fetchBalances':
    case 'fetchOrders':
      break
    case 'fetchOrder':
      const id = argv._[1]
      if (!id) {
        throw new ApplicationError('No order id specified.')
      }
      cmd.args = [id]
      break
    case 'fetchOrderBook':
    case 'fetchTrades':
      pair = argv._[1]
      if (!pair) {
        throw new ApplicationError('No trading pair specified.')
      }
      cmd.args = [pair]
      break
    case 'createOrder':
      const side = argv._[1]
      if (!side) {
        throw new ApplicationError('No side specified.')
      }
      if (side !== 'BUY' && side !== 'SELL') {
        throw new ApplicationError('Invalid side specified')
      }
      pair = argv._[2]
      if (!pair) {
        throw new ApplicationError('No pair specified.')
      }
      amount = new BigNumber(argv._[3])
      const price = new BigNumber(argv._[4])
      cmd.args = [side, pair, amount, price]
      break
    case 'cancelOrder':
      const orderId = argv._[1]
      if (!orderId) {
        throw new ApplicationError('No order ID specified.')
      }
      cmd.args = [orderId]
      break

    case 'deposit':
    case 'requestWithdrawal':
      symbol = argv._[1]
      if (!symbol) {
        throw new ApplicationError('No symbol specified.')
      }
      amount = new BigNumber(argv._[2])
      cmd.args = [symbol, amount]
      break
    case 'confirmWithdrawal':
      symbol = argv._[1]
      if (!symbol) {
        throw new ApplicationError('No symbol specified.')
      }
      cmd.args = [symbol]
      break
    case 'fetchWalletBalance':
      symbol = argv._[1]
      if (!symbol) {
        throw new ApplicationError('No symbol specified.')
      }
      cmd.args = [symbol]
      break
    case 'fetchEtherBalance':
      break
    case 'help':
    case '?':
      name = 'printHelp'
      cmd.offline = true
      break
    case 'version':
    case 'quit':
      break
    default:
      throw new ApplicationError("Invalid command '" + name + "'")
  }

  cmd.name = name
  cmd.display = argv._.join(' ')
  cmd.handler = eval(name)

  return cmd
}

async function executeCommand(config, wallet, client, cmd, isBatch) {
  let args = [
    {
      config: config,
      wallet: wallet,
      client: client
    }
  ]

  args = args.concat(cmd.args)

  if (isBatch) {
    console.log('> ' + cmd.display)
  }

  await cmd.handler(...args)
  console.log('')
}

function loadConfig() {
  if (!fs.existsSync('config.json')) {
    throw new ApplicationError('Expected a config.json file with hub URL.')
  }

  let config = JSON.parse(fs.readFileSync('config.json'))

  if (!config.hubUrl) {
    throw new ApplicationError(
      'config.json does not contain a hubUrl declaration.'
    )
  }

  if (!config.providerUrl) {
    throw new ApplicationError(
      'config.json does not contain a providerUrl declaration.'
    )
  }

  if (!config.operatorAddress) {
    throw new ApplicationError(
      'config.json does not contain a operatorAddress declaration.'
    )
  }

  config.operatorAddress = Ethers.utils.getAddress(config.operatorAddress)

  if (!config.mediatorAddress) {
    throw new ApplicationError(
      'config.json does not contain a mediatorAddress declaration.'
    )
  }

  config.mediatorAddress = Ethers.utils.getAddress(config.mediatorAddress)

  if (!config.assets) {
    throw new ApplicationError(
      'config.json does not contain an assets declaration.'
    )
  }

  const assetNames = Object.keys(config.assets)
  for (let i = 0; i < assetNames.length; i++) {
    const assetName = assetNames[i]
    config.assets[assetName] = Ethers.utils.getAddress(config.assets[assetName])
  }

  if (!config.fee) {
    throw new ApplicationError(
      'config.json does not contain a fee declaration.'
    )
  }

  if (!config.assets.hasOwnProperty(config.fee.asset)) {
    throw new ApplicationError(
      'config.json does not contain a known fee.asset declaration.'
    )
  }

  config.fee.amount = new BigNumber(config.fee.amount)

  if (config.fee.amount.isNaN()) {
    throw new ApplicationError(
      'config.json does not contain a valid fee.amount declaration.'
    )
  }

  return config
}

async function createWallet(config) {
  const password = await Prompt.prompt('Enter wallet password: ', {
    silent: true
  })
  const password2 = await Prompt.prompt('Verify wallet password: ', {
    silent: true
  })

  if (password !== password2) {
    console.log('Passwords do not match')
    process.exit(1)
  }

  const wallet = Ethers.Wallet.createRandom()
  const encrypted = await wallet.encrypt(password)

  const m = Moment().utc()
  const timePart = m.format('YYYY-MM-DDTHH-mm-ss.SSS') + 'Z'
  const address = wallet.address.replace('0x', '')
  const fileName = 'UTC--' + timePart + '--' + address

  fs.writeFileSync(fileName, encrypted)

  config.walletFile = fileName
  fs.writeFileSync('config.json', JSON.stringify(config, null, 4))

  console.log('Wallet ' + wallet.address + ' created successfully.')
}

async function loadWallet(config) {
  let wallet = null

  if (!config.walletFile || !fs.existsSync(config.walletFile)) {
    throw new ApplicationError(
      'Could not find wallet file. Use createWallet to create a new encrypted wallet.'
    )
  }

  const fileContent = fs.readFileSync(config.walletFile).toString()

  const password = await Prompt.prompt('Enter wallet password: ', {
    silent: true
  })

  wallet = await Ethers.Wallet.fromEncryptedJson(fileContent, password)

  console.log('Wallet ' + wallet.address + ' loaded successfully.')
  console.log('')

  return wallet
}

function loadState() {
  try {
    state = JSON.parse(fs.readFileSync('state.json'))
  } catch (err) {
    state = {}
  }

  return state
}

function saveState(client) {
  state = {
    roundJoined: client.roundJoined
  }

  fs.writeFileSync('state.json', JSON.stringify(state, null, 4))

  console.log('State saved')
}

async function loadClient(config, state, wallet) {
  const provider = new Providers.JsonRpcProvider(config.providerUrl)
  const identity = new Client.PrivateKeyIdentity(wallet.privateKey, provider)
  const hubClient = new Client.L2Client(identity, config.hubUrl, {
    operatorAddress: config.operatorAddress,
    mediator: config.mediatorAddress,
    persistence: dbConn
  })

  await hubClient.init()

  const assetRegistry = new Client.AssetRegistry()
  const assetNames = Object.keys(config.assets)
  for (let i = 0; i < assetNames.length; i++) {
    const name = assetNames[i]
    const address = config.assets[name]

    assetRegistry.add(name, address)
  }
  const fee = {
    asset: config.assets[config.fee.asset],
    amount: config.fee.amount.times('1e18')
  }

  return new Client.ExchangeClient(identity, hubClient, assetRegistry, { fee })
}

function createConfigFile() {
  const exampleConfigPath = Path.join(__dirname, 'config.example.json')
  const configPath = Path.resolve('config.json')

  if (fs.existsSync(configPath)) {
    console.log(`A 'config.json' file is already defined at: '${configPath}'`)
    process.exit(1)
  }

  const exampleConfig = fs.readFileSync(exampleConfigPath)
  fs.writeFileSync(configPath, exampleConfig)

  console.log('Successfully created a config.json file.')
}

async function getWalletAddress(ctx) {
  console.log(ctx.wallet.address)
}

async function buy(ctx, symbol, amount) {
  const assetAddr = ctx.config.assets[symbol]

  console.log(`Buying ${amount} ${symbol}...`)

  const tx = await ctx.client.identity.sendTransaction({
    to: assetAddr,
    value: Ethers.utils.parseEther(amount)
  })
  await tx.wait()

  console.log(`Bought ${amount} ${symbol}.`)
}

async function fetchWalletBalance(ctx, symbol) {
  const tokenAddress = ctx.config.assets[symbol]
  const provider = ctx.client.identity.provider

  const contract = Client.getContract(tokenAddress, 'ERC20', provider)

  const balanceInWei = await contract.balanceOf(ctx.wallet.address)
  const balance = Ethers.utils.formatEther(balanceInWei)

  console.log(`Balance: ${balance}`)
}

async function fetchEtherBalance(ctx) {
  const balanceInWei = await ctx.client.identity.getBalance()
  const balance = Ethers.utils.formatEther(balanceInWei)
  console.log(`Balance: ${balance}`)
}

async function fetchBalances(ctx) {
  const balances = await ctx.client.fetchBalances()

  console.log(JSON.stringify(balances, null, 4))
}

async function fetchOrderBook(ctx, pair) {
  const orderBook = await ctx.client.fetchOrderBook(pair)

  console.log(JSON.stringify(orderBook, null, 4))
}

async function fetchTrades(ctx, pair) {
  const trades = await ctx.client.fetchTrades(pair)

  console.log(JSON.stringify(trades, null, 4))
}

async function fetchOrder(ctx, id) {
  const order = await ctx.client.fetchOrder(id)

  console.log(JSON.stringify(order, null, 4))
}

async function fetchOrders(ctx) {
  const orders = await ctx.client.fetchOrders()

  console.log(JSON.stringify(orders, null, 4))
}

async function createOrder(ctx, side, pair, amount, price) {
  console.log(
    'Placing order to ' +
      side +
      ' ' +
      amount.toString() +
      ' ' +
      pair +
      ' @ ' +
      price.toString() +
      '...'
  )
  const result = await ctx.client.createOrder(
    pair,
    'limit',
    side.toLowerCase(),
    amount,
    price
  )

  console.log('Order placed successfully.')
  console.log(JSON.stringify(result, null, 4))
}

async function cancelOrder(ctx, orderId) {
  console.log(`Canceling order ${orderId}...`)

  await ctx.client.cancelOrder(orderId)

  console.log('Order canceled successfully.')
}

async function deposit(ctx, symbol, amount) {
  const assetAddress = ctx.config.assets[symbol]

  if (!assetAddress) {
    throw new ApplicationError('Invalid symbol ' + symbol)
  }

  console.log('Depositing ' + amount.toString() + ' ' + symbol + '...')
  await ctx.client.deposit(assetAddress, amount, true)

  console.log('Deposit completed successfully.')
}

async function requestWithdrawal(ctx, symbol, amount) {
  const assetAddress = ctx.config.assets[symbol]

  if (!assetAddress) {
    throw new ApplicationError('Invalid symbol ' + symbol)
  }

  const result = await ctx.client.requestWithdrawalWithWeiConversion(
    assetAddress,
    amount
  )

  console.log(JSON.stringify(result, null, 4))
}

async function confirmWithdrawal(ctx, symbol) {
  const assetAddress = ctx.config.assets[symbol]

  if (!assetAddress) {
    throw new ApplicationError('Invalid symbol ' + symbol)
  }

  const result = await ctx.client.confirmWithdrawal(assetAddress)

  console.log(JSON.stringify(result, null, 4))
}

async function quit() {
  await gracefulShutdown()
}

function printHelp() {
  console.log('USAGE')
  console.log('node cli.js [options] <command> [arguments]')
  console.log('')
  console.log('COMMANDS')
  console.log('init')
  console.log('version')
  console.log('createWallet')
  console.log('console')
  console.log('getWalletAddress')
  console.log('buy <symbol> <amount>')
  console.log('fetchBalances')
  console.log('fetchWalletBalance <symbol>')
  console.log('fetchEtherBalance')
  console.log('fetchOrderBook <pair>')
  console.log('fetchTrades <pair>')
  console.log('fetchOrder <id>')
  console.log('fetchOrders')
  console.log('createOrder <side> <pair> <amount> <price>')
  console.log('cancelOrder <id>')
  console.log('deposit <symbol> <amount>')
  console.log('requestWithdrawal <symbol> <amount>')
  console.log('confirmWithdrawal <symbol>')
  console.log('')
  console.log(
    '* Note that all amounts are specified in ether units (eg. 1.25).'
  )
  console.log('')
}

class ApplicationError extends Error {
  constructor(message) {
    super(message)
  }
}

run().catch(err => {
  if (err instanceof ApplicationError) {
    console.log(err.message)
  } else {
    console.log(err)
    process.exit(1)
  }
})
