// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import path from 'path'
import knex from 'knex'
import { providers, Wallet, utils as EthersUtils } from 'ethers'
import { HTTPServer } from './HTTPServer'
import {
  GETH_RPC_URL,
  OPERATOR_WALLET_FILEPATH,
  OPERATOR_WALLET_PASSWORD,
  WALLET_ADDRESS,
  CONTRACTS,
  STORAGE_DIR,
  FEE_AMOUNT_WEI,
  DEPLOYMENT_GAS_LIMIT,
  DEPLOYMENT_GAS_PRICE
} from '../../config/environment'
import { loggers } from '../common/Logging'
import fs from 'fs'
import { getContract } from '../common/ContractUtils'
import { PrivateKeyIdentity } from '../common/identity/PrivateKeyIdentity'
import { Operator } from './operator/Operator'
import { Exchange, ExchangeConfig } from './exchange/Exchange'
import { Mediator } from '../contracts/wrappers/Mediator'
import { MetaLedger } from '../common/accounting/MetaLedger'
import { MediatorAsync } from '../common/mediator/Contracts'
import { JsonRPCIdentity } from '../common/identity/jsonRPCIdentity'

// Globals
const logger = loggers.get('backend')
const options = { port: 8899 }

let server: HTTPServer | null = null
let persistence: knex | null = null

async function main(): Promise<void> {
  logger.info('****************************************')
  logger.info('Starting...')
  logger.info(`Ethereum network: ${GETH_RPC_URL}.`)
  logger.info('****************************************')

  process.on('SIGINT', () => {
    gracefulShutdown().catch(e => {
      logger.error(e)
      process.exit(1)
    })
  })

  // Setting up Ethereum node provider
  const provider = new providers.JsonRpcProvider(GETH_RPC_URL)

  // Check that we can talk to the blockchain node
  try {
    await provider.getBlockNumber()
  } catch (err) {
    logger.error(`Unable to connect to the blockchain node at ${GETH_RPC_URL}.`)
    throw err
  }

  // Load encrypted wallet from disk
  let signer = null
  let identity = null
  if (
    OPERATOR_WALLET_FILEPATH !== undefined &&
    OPERATOR_WALLET_PASSWORD !== undefined
  ) {
    logger.info(
      `Loading operator wallet from disk at ${OPERATOR_WALLET_FILEPATH}...`
    )
    const wallet = await loadEncryptedWallet(
      OPERATOR_WALLET_FILEPATH,
      OPERATOR_WALLET_PASSWORD
    )
    signer = wallet.connect(provider)
    identity = new PrivateKeyIdentity(wallet.privateKey, provider)
  } else if (WALLET_ADDRESS !== undefined) {
    logger.info(`Loading operator wallet from running node...`)
    signer = provider.getSigner(WALLET_ADDRESS)
    identity = new JsonRPCIdentity(provider, WALLET_ADDRESS)
  } else {
    throw Error(
      'OPERATOR_WALLET_FILEPATH and OPERATOR_WALLET_PASSWORD both need to be defined in environment.'
    )
  }

  const operatorAddress = await signer.getAddress()
  logger.info(`Loaded operator wallet with address ${operatorAddress}`)

  if (process.env.E2E_TEST) {
    logger.warn('Setting low polling interval for E2E test')
    provider.pollingInterval = 10
  }

  // Check that the operator wallet has enough ETH
  const walletBalance = await signer!.getBalance()

  if (walletBalance.eq(0)) {
    // Can't operate at all with no ETH
    throw Error('Operator wallet has empty balance.')
  } else if (walletBalance.lt(EthersUtils.parseEther('1.0'))) {
    // Low balance warning
    logger.warn('Operator wallet has less than 1 ETH balance.')
  }

  if (CONTRACTS.OAXToken == undefined) {
    throw Error('OAX token address not provided.')
  }
  if (CONTRACTS.ETHToken == undefined) {
    throw Error('WETH token address not provided.')
  }
  // Load supported token contracts
  const assets = [
    { symbol: 'OAX', address: CONTRACTS.OAXToken },
    { symbol: 'WETH', address: CONTRACTS.ETHToken }
  ]

  const feeAsset = assets.find(a => a.symbol === 'OAX')

  if (feeAsset === undefined) {
    throw Error('Fee asset is not in the list of supported tokens.')
  }

  if (CONTRACTS.Mediator == undefined) {
    throw Error('Mediator address not provided.')
  }

  if (!fs.existsSync(STORAGE_DIR)) {
    logger.info(`Storage folder ${STORAGE_DIR} not found. Creating...`)
    fs.mkdirSync(STORAGE_DIR)
  }

  let dbFileName: string

  if (process.env.IN_MEMORY_DB) {
    dbFileName = ':memory:'
    logger.info('Using in-memory database')
  } else {
    dbFileName = path.join(STORAGE_DIR, `ledger-${CONTRACTS.Mediator}.sqlite`)
    logger.info(`Using database file ${dbFileName}`)
  }

  persistence = knex({
    client: 'sqlite3',
    connection: dbFileName,
    useNullAsDefault: true,
    debug: process.env.NODE_ENV !== 'production',
    asyncStackTraces: process.env.NODE_ENV !== 'production',
    log: {
      warn(message: string) {
        logger.warn('knex: ' + message)
      },
      error(message: string) {
        logger.error('knex: ' + message)
      },
      debug(message: string) {
        logger.debug('knex: ' + message)
      },
      deprecate(method: string, alternative: string) {
        logger.warn('knex: ' + method + ' was superseded by ' + alternative)
      }
    }
  })

  const mediator = getContract(
    CONTRACTS.Mediator,
    'Mediator',
    signer
  ) as Mediator

  const metaLedger = new MetaLedger({
    assets: assets.map(a => a.address),
    operatorAddress: operatorAddress,
    mediatorAddress: CONTRACTS.Mediator,
    persistence
  })

  // Setting up operator
  logger.info('Creating operator.')
  const mediatorAsync: MediatorAsync = new MediatorAsync(
    signer,
    mediator,
    logger,
    { gasLimit: DEPLOYMENT_GAS_LIMIT, gasPrice: DEPLOYMENT_GAS_PRICE}
  )
  

  const operator = new Operator(identity!, mediatorAsync, provider, metaLedger)

  // Setting up exchange
  const exchangeConfig: ExchangeConfig = {
    fee: { asset: feeAsset.address, amount: FEE_AMOUNT_WEI },
    pairs: ['OAX/WETH']
  }
  logger.info(`Exchange config: ${JSON.stringify(exchangeConfig)}`)
  logger.info('Creating exchange.')
  const exchange = new Exchange(operator, metaLedger, exchangeConfig)

  // Adding supported assets to exchange
  for (const { symbol, address } of assets) {
    logger.info(`Adding ${symbol} token asset - address: ${address}`)
    exchange.addAsset(symbol, address)
  }

  // Starting components
  await metaLedger.start()
  server = new HTTPServer(operator, exchange, options)
  await server.start()

  // Returns the http.Server instance as a promise
  return await server.listen()
}

async function loadEncryptedWallet(
  filePath: string,
  password: string
): Promise<Wallet> {
  if (!fs.existsSync(filePath)) {
    throw Error('Could not find wallet file ' + filePath)
  }

  const fileContent = fs.readFileSync(filePath).toString()

  return await Wallet.fromEncryptedJson(fileContent, password)
}

async function gracefulShutdown() {
  console.log('Shutting down...')

  if (server !== null) {
    try {
      await server.close()
    } catch (e) {
      console.error(e)
    }

    server = null
  }

  if (persistence !== null) {
    try {
      await persistence.destroy()
    } catch (e) {
      console.error(e)
    }

    persistence = null
  }

  process.exit(0)
}

main().catch(err => {
  if (err.stack) {
    logger.error(err.stack)
  } else {
    logger.error(err.toString())
  }

  process.exit(1)
})
