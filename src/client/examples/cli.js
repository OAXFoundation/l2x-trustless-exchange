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
const Moment = require('moment')
const Prompt = require('promptly')
const ShellParse = require('shell-quote').parse
const knex = require('knex')
const blessed = require('blessed')
const Sleep = require('sleep')

const Client = require('@oax/client')

let dbConn = null
var config = null
var wallet = null
var client = null

var screen = null
var debugBox = null
var balancesBox = null
var ordersBox = null
var orderBookBox = null
var tradesBox = null
var outputBox = null
var inputBox = null

var shouldRun = true

async function run() {
  process.on('SIGINT', async () => {
    await gracefulShutdown()
  })

  // Load config
  config = loadConfig()

  dbConn = knex({
    client: 'sqlite3',
    connection: {
      filename: ':memory:' //`./oax-client-${config.mediatorAddress}.sqlite`
    },
    useNullAsDefault: true
  })

  //if (firstCommand === 'createWallet') {
  //  await createWallet(config)
  //  return
  //}

  // Load Wallet
  wallet = await loadWallet(config)

  client = await loadClient(config, wallet)

  const commands = new Set([
    'getWalletAddress',
    'buy',
    'fetchBalances',
    'fetchWalletBalance',
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
    '?',
    'quit'
  ])

  // Join Hub
  log('Connecting...')
  await client.join()

  buildUI()

  while (shouldRun) {
    await updateBalances()
    await updateOrders()
    await updateOrderBook()
    await updateTrades()

    // TODO: Replace with async sleep
    Sleep.msleep(500)
  }
  /*
  if (client !== null) {
    try {
      await client.leave()
      await quit()
    } catch (e) {
      console.error(e)
    }
  }
  */
}

async function updateBalances() {
  // Exchange Tokens
  balances = await client.fetchBalances()
  var keys = Object.keys(balances)
  var text = ''

  text += '--- Exchange Tokens ---\n'
  for (var i = 0; i < keys.length; i++) {
    const key = keys[i]
    const balance = balances[key]

    text +=
      key +
      '\n  free: ' +
      balance.free.toString() +
      '\n  locked: ' +
      balance.locked.toString() +
      '\n'
  }
  text += '\n'

  // Wallet Tokens
  text += '--- Wallet Tokens ---\n'
  const assets = ['OAX', 'WETH']

  for (var i = 0; i < assets.length; i++) {
    const asset = assets[i]

    const tokenAddress = config.assets[asset]
    const provider = client.identity.provider
    const contract = Client.getContract(tokenAddress, 'ERC20', provider)
    const balanceInWei = await contract.balanceOf(wallet.address)
    const balance = Ethers.utils.formatEther(balanceInWei)

    text += asset + '\n  ' + balance.toString() + '\n'
  }
  text += '\n'

  // Wallet ETH
  text += '--- Wallet ETH ---\n'
  const provider = client.identity.provider
  const balanceInWei = await provider.getBalance(wallet.address)
  const balance = Ethers.utils.formatEther(balanceInWei)

  text += balance.toString() + '\n'

  balancesBox.setContent(text)
  screen.render()
}

/*
[                                                                                                                                                                                                                                                                                                                                                                         │
    {                                                                                                                                                                                                                                                                                                                                                                     │
        "datetime": "2019-06-21T05:09:51.718Z",                                                                                                                                                                                                                                                                                                                           │
        "timestamp": 1561093791718,                                                                                                                                                                                                                                                                                                                                       │
        "status": "open",                                                                                                                                                                                                                                                                                                                                                 │
        "symbol": "OAX/WETH",                                                                                                                                                                                                                                                                                                                                             │
        "type": "limit",                                                                                                                                                                                                                                                                                                                                                  │
        "side": "sell",                                                                                                                                                                                                                                                                                                                                                   │
        "price": "0.1",                                                                                                                                                                                                                                                                                                                                                   │
        "amount": "5",                                                                                                                                                                                                                                                                                                                                                    │
        "filled": "0",                                                                                                                                                                                                                                                                                                                                                    │
        "remaining": "5",                                                                                                                                                                                                                                                                                                                                                 │
        "trades": [],                                                                                                                                                                                                                                                                                                                                                     │
        "id": "0x18afce443422d515d5f7134708769c113be6d8a1dcab2fbca288612adb9a270b"                                                                                                                                                                                                                                                                                        │
    }                                                                                                                                                                                                                                                                                                                                                                     │
]
*/
async function updateOrders() {
  const orders = await client.fetchOrders()

  var text = ''
  if (orders && orders.length > 0) {
    for (var i = 0; i < orders.length; i++) {
      const order = orders[i]

      text +=
        order.datetime.toString() +
        ' ' +
        order.status.toUpperCase() +
        ' ' +
        order.side.toUpperCase() +
        ' ' +
        order.amount.toString() +
        ' ' +
        order.symbol +
        ' @ ' +
        order.price.toString() +
        ' (' +
        order.filled.toString() +
        ')\n'
    }
  }

  ordersBox.setContent(text)
  screen.render()
}

async function updateOrderBook() {
  const symbol = 'OAX/WETH'

  orderBookBox.setLabel('Order Book [' + symbol + ']')

  const orderBook = await client.fetchOrderBook(symbol)

  var text = ''
  if (orderBook) {
    if (orderBook.asks.length > 0) {
      text += '{red-fg}'
      for (var i = 0; i < orderBook.asks.length; i++) {
        const entry = orderBook.asks[i]

        text +=
          entry.amount.toString() +
          ' @ ' +
          entry.price.toString() +
          ' = ' +
          entry.amount.times(entry.price).toString() +
          '\n'
      }
      text += '{/red-fg}'
    }

    if (orderBook.asks.length > 0 && orderBook.bids.length > 0) {
      text += '---\n'
    }

    if (orderBook.bids.length > 0) {
      text += '{green-fg}'
      for (var i = 0; i < orderBook.bids.length; i++) {
        const entry = orderBook.bids[i]

        text +=
          entry.amount.toString() +
          ' @ ' +
          entry.price.toString() +
          ' = ' +
          entry.amount.times(entry.price).toString() +
          '\n'
      }
      text += '{/green-fg}'
    }
  }

  orderBookBox.setContent(text)
  screen.render()
}

async function updateTrades() {
  const symbol = 'OAX/WETH'

  tradesBox.setLabel('Trades [' + symbol + ']')

  const trades = await client.fetchTrades(symbol)

  var text = ''
  if (trades && trades.length > 0) {
    for (var i = 0; i < trades.length; i++) {
      const trade = trades[i]
      const time = new Moment(trade.datetime)
      const price = new BigNumber(trade.price).pow(-1) ///AAAAA Temp

      text += trade.side === 'buy' ? '{green-fg}' : '{red-fg}'
      text +=
        time.format('HH:mm:ss') +
        ' ' +
        trade.amount.toString() +
        ' @ ' +
        price.toString() +
        '\n'
      text += trade.side === 'buy' ? '{/green-fg}' : '{/red-fg}'
    }
  }

  tradesBox.setContent(text)
  screen.render()
}

function log(message) {
  if (outputBox) {
    outputBox.pushLine(message)
    screen.render()
  } else {
    console.log(message)
  }
}

async function executeConsoleCommand(command, args) {
  if (command === 'exit' || command === 'quit') {
    await gracefulShutdown()
    process.exit(0)
  }

  var argv = [command]
  argv = argv.concat(args)

  try {
    const cmd = parseCommand({ _: argv })

    await executeCommand(config, wallet, client, cmd, false /* isBatch */)
  } catch (err) {
    if (err instanceof ApplicationError) {
      log(err.message)
    } else {
      log(err.toString())
    }
  }
}

function parseCommand(argv) {
  var name = argv._[0]

  if (!name) {
    printHelp()
    return
  }

  var cmd = {}
  var pair = null
  var amount = null
  var symbol = null

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
      let side = argv._[1]
      if (!side) {
        throw new ApplicationError('No side specified.')
      }
      side = side.toLowerCase()
      if (side !== 'buy' && side !== 'sell') {
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
    case 'quit':
      name = 'quit'
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
  var args = [
    {
      config: config,
      wallet: wallet,
      client: client
    }
  ]

  args = args.concat(cmd.args)

  if (isBatch) {
    log('> ' + cmd.display)
  }

  await cmd.handler(...args)
}

function loadConfig() {
  if (!fs.existsSync('config.json')) {
    throw new ApplicationError('Expected a config.json file with hub URL.')
  }

  var config = JSON.parse(fs.readFileSync('config.json'))

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
  for (var i = 0; i < assetNames.length; i++) {
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
    log('Passwords do not match')
    return
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

  log('Wallet ' + wallet.address + ' created successfully.')
}

async function loadWallet(config) {
  var wallet = null

  if (!config.walletFile || !fs.existsSync(config.walletFile)) {
    throw new ApplicationError(
      'Could not find wallet file. Use createWallet to create a new encrypted wallet.'
    )
  }

  const fileContent = fs.readFileSync(config.walletFile).toString()

  const password = 'testtest' //await Prompt.prompt('Enter wallet password: ', {
  //    silent: true
  //  })

  wallet = await Ethers.Wallet.fromEncryptedJson(fileContent, password)

  log('Wallet ' + wallet.address + ' loaded successfully.')
  log('')

  return wallet
}

async function loadClient(config, wallet) {
  const provider = new Ethers.providers.JsonRpcProvider(config.providerUrl)
  const identity = new Client.PrivateKeyIdentity(wallet.privateKey, provider)
  const hubClient = new Client.L2Client(identity, config.hubUrl, {
    operatorAddress: config.operatorAddress,
    mediator: config.mediatorAddress,
    persistence: dbConn
  })

  await hubClient.init()

  const assetRegistry = new Client.AssetRegistry()
  const assetNames = Object.keys(config.assets)
  for (var i = 0; i < assetNames.length; i++) {
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
    log(`A 'config.json' file is already defined at: '${configPath}'`)
    return
  }

  const exampleConfig = fs.readFileSync(exampleConfigPath)
  fs.writeFileSync(configPath, exampleConfig)

  log('Successfully created a config.json file.')
}

async function getWalletAddress(ctx) {
  log(ctx.wallet.address)
}

async function buy(ctx, symbol, amount) {
  const assetAddr = ctx.config.assets[symbol]

  log(`Buying ${amount} ${symbol}...`)

  const tx = await ctx.client.identity.sendTransaction({
    to: assetAddr,
    value: Ethers.utils.parseEther(amount)
  })
  await tx.wait()

  log(`Bought ${amount} ${symbol}.`)
}

async function fetchWalletBalance(ctx, symbol) {
  const tokenAddress = ctx.config.assets[symbol]
  const provider = ctx.client.identity.provider

  const contract = Client.getContract(tokenAddress, 'ERC20', provider)

  const balanceInWei = await contract.balanceOf(ctx.wallet.address)
  const balance = Ethers.utils.formatEther(balanceInWei)

  log(`Balance: ${balance}`)
}

async function fetchEtherBalance(ctx) {
  const balanceInWei = await ctx.client.identity.getBalance()
  const balance = Ethers.utils.formatEther(balanceInWei)
  log(`Balance: ${balance}`)
}

async function fetchBalances(ctx) {
  const balances = await ctx.client.fetchBalances()

  log(JSON.stringify(balances, null, 4))
}

async function fetchOrderBook(ctx, pair) {
  const orderBook = await ctx.client.fetchOrderBook(pair)

  log(JSON.stringify(orderBook, null, 4))
}

async function fetchTrades(ctx, pair) {
  const trades = await ctx.client.fetchTrades(pair)

  log(JSON.stringify(trades, null, 4))
}

async function fetchOrder(ctx, id) {
  const order = await ctx.client.fetchOrder(id)

  log(JSON.stringify(order, null, 4))
}

async function fetchOrders(ctx) {
  const orders = await ctx.client.fetchOrders()

  log(JSON.stringify(orders, null, 4))
}

async function createOrder(ctx, side, pair, amount, price) {
  log(
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

  log('Order placed successfully.')
  log(JSON.stringify(result, null, 4))
}

async function cancelOrder(ctx, orderId) {
  log(`Canceling order ${orderId}...`)

  await ctx.client.cancelOrder(orderId)

  log('Order canceled successfully.')
}

async function deposit(ctx, symbol, amount) {
  const assetAddress = ctx.config.assets[symbol]

  if (!assetAddress) {
    throw new ApplicationError('Invalid symbol ' + symbol)
  }

  log('Depositing ' + amount.toString() + ' ' + symbol + '...')
  await ctx.client.deposit(assetAddress, amount, true)

  log('Deposit completed successfully.')
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

  log(JSON.stringify(result, null, 4))
}

async function confirmWithdrawal(ctx, symbol) {
  const assetAddress = ctx.config.assets[symbol]

  if (!assetAddress) {
    throw new ApplicationError('Invalid symbol ' + symbol)
  }

  const result = await ctx.client.confirmWithdrawal(assetAddress)

  log(JSON.stringify(result, null, 4))
}

async function quit() {
  if (dbConn != null) {
    await dbConn.destroy()
  }
}

function printHelp() {
  log('OFFLINE COMMANDS')
  log('init')
  log('createWallet')
  log('getWalletAddress')
  log('toggleLog')
  log('clear')
  log('')
  log('ONLINE COMMANDS')
  log('buy <symbol> <amount>')
  log('fetchBalances')
  log('fetchWalletBalance <symbol>')
  log('fetchEtherBalance <symbol>')
  log('fetchOrderBook <pair>')
  log('fetchTrades <pair>')
  log('fetchOrder <id>')
  log('fetchOrders')
  log('createOrder <side> <pair> <amount> <price>')
  log('cancelOrder <id>')
  log('deposit <symbol> <amount>')
  log('requestWithdrawal <symbol> <amount>')
  log('confirmWithdrawal <symbol>')
  log('')
  log('* Note that all amounts are specified in ether units (eg. 1.25).')
  log('')
}

class ApplicationError extends Error {
  constructor(message) {
    super(message)
  }
}

function buildUI() {
  // Create a screen object.
  screen = blessed.screen({
    smartCSR: true,
    cursor: {
      artificial: true,
      shape: {
        //bg: 'red',
        fg: 'white',
        bold: true,
        ch: '█'
      },
      blink: true
    }
  })

  screen.title = 'OAX Console'

  debugBox = blessed.log({
    top: 'top',
    left: 'left',
    width: '100%',
    height: '60%',
    //content: '',
    label: 'DEBUG',
    tags: true,
    border: {
      type: 'line'
    },
    visible: false,
    style: {
      fg: 'white',
      //bg: 'magenta',
      border: {
        fg: '#f0f0f0'
      }
    }
  })

  balancesBox = blessed.box({
    top: 'top',
    left: 'left',
    width: '25%',
    height: '60%',
    content: '',
    tags: true,
    label: 'Balances',
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      //bg: 'magenta',
      border: {
        fg: '#f0f0f0'
      }
    }
  })

  ordersBox = blessed.box({
    top: 'top',
    left: '25%',
    width: '25%',
    height: '60%',
    content: '',
    tags: true,
    label: 'Orders',
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      //bg: 'magenta',
      border: {
        fg: '#f0f0f0'
      }
    }
  })

  orderBookBox = blessed.box({
    top: 'top',
    left: '50%',
    width: '25%',
    height: '60%',
    content: '',
    tags: true,
    label: 'Order Book',
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      //bg: 'magenta',
      border: {
        fg: '#f0f0f0'
      }
    }
  })

  tradesBox = blessed.log({
    top: 'top',
    left: '75%',
    width: '25%',
    height: '60%',
    content: '',
    tags: true,
    label: 'Trades',
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      //bg: 'magenta',
      border: {
        fg: '#f0f0f0'
      }
    }
  })

  outputBox = blessed.log({
    top: '60%',
    left: 'left',
    width: '100%',
    height: '40%-2',
    content: '',
    tags: true,
    label: 'Output',
    border: {
      type: 'line'
    },
    style: {
      fg: 'white',
      //bg: 'magenta',
      border: {
        fg: '#f0f0f0'
      }
    },
    alwaysScroll: true,
    scrollable: true,
    scrollbar: {
      fg: 'white',
      ch: '▓'
    },
    mouse: false
  })

  inputBox = blessed.textbox({
    bottom: 0,
    left: 0,
    height: 2,
    width: '100%',
    keys: true,
    mouse: false,
    inputOnFocus: true,
    style: {
      fg: 'white',
      bg: 'blue' // Blue background so you see this is different from body
    }
  })

  // Append our box to the screen.
  screen.append(balancesBox)
  screen.append(ordersBox)
  screen.append(orderBookBox)
  screen.append(tradesBox)
  screen.append(debugBox)
  screen.append(outputBox)
  screen.append(inputBox)

  // If our box is clicked, change the content.
  //box1.on('click', function(data) {
  //});

  // If box is focused, handle `enter`/`return` and give us some more content.
  //box4.key('enter', function(ch, key) {
  //});

  // Quit on Escape, q, or Control-C.
  //screen.key(['escape', 'q', 'C-c'], function(ch, key) {
  //  return process.exit(0)
  //})

  inputBox.on('submit', text => {
    if (!text || text.length === 0) {
      return
    }

    var rawCommand = text.trim()

    if (rawCommand.length === 0) {
      return
    }

    if (rawCommand[0] === '>') {
      rawCommand = rawCommand.substring(1).trim()
    }

    const tokens = rawCommand.split(' ')

    if (!tokens || tokens.length === 0) {
      return
    }

    const command = tokens[0]
    const args = tokens.length > 1 ? tokens.slice(1) : []

    inputBox.setValue('> ')
    inputBox.focus()

    if (command === 'clear') {
      outputBox.setContent('')
      screen.render()
      return
    }

    outputBox.pushLine(text)
    screen.render()

    executeConsoleCommand(tokens[0], args)
    outputBox.pushLine('')

    //if (text == 'exit' || text == 'quit') {
    //   process.exit(0)
    //}

    /*
      if (text == '__debug') {
         debugBox.show()
         box1.hide()
         box2.hide()
         box3.hide()
      }
   */
  })

  debugBox.hide()
  inputBox.setValue('> ')
  inputBox.focus()
  screen.render()
}

async function gracefulShutdown() {
  console.log('Shutting down...')

  shouldRun = false

  Sleep.msleep(5000)

  if (client !== null) {
    try {
      await client.leave()
    } catch (e) {
      console.error(e)
    }
  }

  if (dbConn != null) {
    try {
      await dbConn.destroy()
    } catch (e) {
      console.error(e)
    }
  }

  process.exit(0)
}

run()
