// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import { providers, Wallet } from 'ethers'
import { BigNumber } from 'bignumber.js'
import { Operator } from '../src/server/operator/Operator'
import { MediatorAsync } from '../src/common/mediator/Contracts'
import {
  PrivateKeyIdentity,
  randomPrivateKey
} from '../src/common/identity/PrivateKeyIdentity'
import { getContractFactory } from '../src/common/ContractUtils'
import { Mediator } from '../src/contracts/wrappers/Mediator'
import { Exchange } from '../src/server/exchange/Exchange'
import { OAXToken } from '../src/contracts/wrappers/OAXToken'
import { ETHToken } from '../src/contracts/wrappers/ETHToken'
import {
  Address,
  Amount,
  ApprovalId,
  AssetAddress
} from '../src/common/types/BasicTypes'

import { BidAsk, IL2Order, IOrderBook } from '../src/common/types/ExchangeTypes'

import { computeFeeApproval, IApproval } from '../src/common/types/Approvals'

import { bufferToHex } from 'ethereumjs-util'
import { D, etherToWei, weiToEther } from '../src/common/BigNumberUtils'
import { FEE_AMOUNT_WEI, GETH_RPC_URL } from '../config/environment'
import R from 'ramda'
import { Identity } from '../src/common/identity/Identity'
import { MetaLedger } from '../src/common/accounting/MetaLedger'

//========================================
// SETTINGS
//========================================

// @ts-ignore
const NANO_SECS_PER_SEC = 1000000000n
const ROUND = 0
const BLOCKS_PER_DAY = (60 / 15) * 60 * 24
const roundBlocks = BLOCKS_PER_DAY

const NUM_USERS = 1000
const TX_FEE = FEE_AMOUNT_WEI
const OAX_AMOUNT = etherToWei(new BigNumber(NUM_USERS))

//========================================
// JSON-RPC and IDENTITIES
//========================================

const provider = new providers.JsonRpcProvider(GETH_RPC_URL)
const exchangePrivateKey = bufferToHex(randomPrivateKey())
const exchangeIdentity = new PrivateKeyIdentity(exchangePrivateKey)
const signer = provider.getSigner(0)

let approvalCounter = Math.floor(Math.random() * 1e10)

async function main(): Promise<void> {
  //========================================
  // CONTRACT DEPLOYMENTS
  //========================================
  const oax = (await deployContract('OAXToken')) as OAXToken
  const weth = (await deployContract('ETHToken')) as ETHToken

  const contract = (await deployContract(
    'Mediator',
    roundBlocks,
    exchangeIdentity.address
  )) as Mediator

  //========================================
  // EXCHANGE SETUP
  //========================================

  const assets = [oax.address, weth.address]

  const operatorSigner = new Wallet(exchangePrivateKey, provider)

  const mediator = new MediatorAsync(operatorSigner, contract)

  const metaLedger = new MetaLedger({
    assets,
    operatorAddress: exchangeIdentity.address,
    mediatorAddress: mediator.contractAddress
  })

  const operator = new Operator(
    exchangeIdentity,
    mediator,
    provider,
    metaLedger
  )

  const exchange = new Exchange(operator, metaLedger, {
    fee: { asset: oax.address, amount: FEE_AMOUNT_WEI }
  })

  exchange.addAsset('OAX', oax.address)
  exchange.addAsset('WETH', weth.address)

  console.log(`OAX Exchange created:

Assets supported
----------------
  1. WETH:\t${weth.address}
  2. OAX:\t${oax.address}

Transaction fees
----------------
  1. Order placement: ${weiToEther(TX_FEE).toString(10)} OAX`)

  await metaLedger.start()

  console.log('Exchange accepting trades.')

  console.log()

  //========================================
  // TRADES SETUP: Maker
  //========================================

  const users = []
  const orders: IL2Order[] = []

  {
    const maker = new PrivateKeyIdentity()
    await metaLedger.register(maker.address, 0)

    await deposit(oax.address, maker.address, OAX_AMOUNT.plus(TX_FEE))

    const orderParams: IApproval = {
      approvalId: '874983749837',
      round: ROUND,
      buy: {
        asset: weth.address,
        amount: OAX_AMOUNT
      },
      sell: {
        asset: oax.address,
        amount: OAX_AMOUNT
      },
      intent: 'sellAll',
      owner: maker.address,
      instanceId: mediator.contractAddress
    }

    const l2order = await mkL2Order(orderParams, maker, oax.address)
    await exchange.createOrder(l2order)
    logOrder(l2order)
  }

  console.log()

  console.log('IOrder book at start of performance test:')
  console.log(await getOrderBook())

  console.log()

  //========================================
  // TRADES SETUP: Takers init
  //========================================

  console.log(`Registering ${NUM_USERS} users into the Exchange....`)

  for (let i = 0; i < NUM_USERS; i++) {
    const user = new PrivateKeyIdentity()
    users.push(user)

    await metaLedger.register(user.address, 0)
  }

  console.log()

  //========================================
  // TRADES SETUP: Funding takers
  //========================================

  console.log(`Funding user accounts for testing...`)

  for (let i = 0; i < NUM_USERS; i++) {
    const user = users[i]
    await deposit(oax.address, user.address, TX_FEE)
    await deposit(weth.address, user.address, OAX_AMOUNT.div(NUM_USERS))
  }

  //========================================
  // TRADES SETUP: Make taker orders
  //========================================

  console.log(
    'Creating and signing bid order for 1 OAX @ 1 WETH for each user...'
  )
  for (let i = 0; i < NUM_USERS; i++) {
    const user = users[i]
    const orderParams: IApproval = {
      approvalId: (++approvalCounter).toString(),
      round: ROUND,
      buy: {
        asset: oax.address,
        amount: etherToWei(D('1'))
      },
      sell: {
        asset: weth.address,
        amount: etherToWei(D('1'))
      },
      intent: 'buyAll',
      owner: user.address,
      instanceId: mediator.contractAddress
    }

    const l2order = await mkL2Order(orderParams, user, oax.address)
    orders.push(l2order)
  }

  console.log()

  //========================================
  // Orders Execution
  //========================================

  console.log(`Submitting orders to Exchange for execution...`)

  const results = new Array<Promise<ApprovalId>>(orders.length)

  // @ts-ignore
  const startTime = process.hrtime.bigint()
  for (let i = 0; i < NUM_USERS; i++) {
    results[i] = exchange.createOrder(orders[i])
    results[i].then(() => {
      logOrder(orders[i])
    })
  }
  await Promise.all(results)

  // @ts-ignore
  const endTime = process.hrtime.bigint()

  const timeTakenInNanoSecs = endTime - startTime

  console.log()

  //========================================
  // Report
  //========================================

  console.log(
    // @ts-ignore
    `Swap performance: ${(BigInt(NUM_USERS) * NANO_SECS_PER_SEC) /
      timeTakenInNanoSecs} swaps/sec`
  )

  console.log()

  console.log('Final order book:')
  console.log(await getOrderBook())

  process.exit(0)

  //========================================
  // Helpers
  //========================================

  async function deposit(token: Address, address: Address, amount: Amount) {
    await metaLedger.creditDeposit(token, address, amount.plus(TX_FEE), 0)
  }

  async function getOrderBook() {
    const market = { base: oax.address, quote: weth.address }
    const orderBook = orderBookInEther(await exchange.orderBook(market))
    return JSON.parse(JSON.stringify(orderBook))
  }
}

//========================================
// Entry point
//========================================

main()
  .then(text => {
    console.log(text)
  })
  .catch(err => {
    console.error(err)
    process.exitCode = 1
  })

//========================================
// Utilities
//========================================

async function deployContract(name: string, ...params: any[]): Promise<any> {
  const factory = getContractFactory(name, signer)
  const contract = await factory.deploy(...params)
  await contract.deployed()

  return contract
}

function logOrder(l2order: IL2Order) {
  const approval = l2order.orderApproval

  if (approval.params.intent === 'buyAll') {
    console.error(
      `Placed bid order. From=${approval.params.owner} Buy ${weiToEther(
        approval.params.buy.amount
      )} OAX for ${weiToEther(
        approval.params.sell.amount
      )} WETH. Fee=${weiToEther(TX_FEE).toString(10)} OAX`
    )
  } else {
    console.error(
      `Placed ask order. From=${approval.params.owner} Sell ${weiToEther(
        approval.params.sell.amount
      )} OAX for ${weiToEther(
        approval.params.buy.amount
      )} WETH. Fee=${weiToEther(TX_FEE).toString(10)} OAX`
    )
  }
}

function orderBookInEther(orderBookInWei: IOrderBook) {
  const bidAskInEther = (bidAsk: BidAsk) => ({
    price: bidAsk.price,
    amount: weiToEther(bidAsk.amount)
  })

  return R.mergeDeepLeft(
    {
      asks: orderBookInWei.asks.map(bidAskInEther),
      bids: orderBookInWei.bids.map(bidAskInEther)
    },
    orderBookInWei
  )
}

async function mkL2Order(
  orderParams: IApproval,
  account: Identity,
  asset: AssetAddress
): Promise<IL2Order> {
  const approval: IApproval = { approvalId: ++approvalCounter, ...orderParams }
  const signedApproval = await account.makeSignedApproval(approval)
  const feeApproval = computeFeeApproval(signedApproval.params, asset, TX_FEE)

  const signedFeeApproval = await account.makeSignedApproval(feeApproval)

  const l2order: IL2Order = {
    orderApproval: signedApproval,
    feeApproval: signedFeeApproval
  }

  return l2order
}
