// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import fs from 'fs'
import BigNumber from 'bignumber.js'

import { JsonRpcProvider } from 'ethers/providers'
import { D, etherToD, toEthersBn } from '@oax/common/BigNumberUtils'

import { GETH_RPC_URL } from '../config/environment'
const API_URL = 'http://127.0.0.1:8899'
const MAX_NUMBER_OF_CLIENTS = 40

import {
  AssetRegistry,
  ExchangeClient,
  getContract,
  L2Client,
  PrivateKeyIdentity
} from '@oax/client'

interface Client {
  l2Client: L2Client
  exClient: ExchangeClient
}

BigNumber.config({ DECIMAL_PLACES: 8 })

const provider = new JsonRpcProvider(GETH_RPC_URL)
provider.pollingInterval = 20

let clients: Client[] = []

const E = etherToD

// @ts-ignore
const BLOCK_TIME_MS = 5000
const FUND_AMOUNT_ETHER = D('1000')
const TOKEN_AMOUNT_ETHER = D('10')

const ODDS: { [event: string]: number } = {
  NEW_CLIENT: 0.75,
  WITHDRAW: 0.5,
  DISPUTE: 0.25,
  CONFIRM_WITHDRAWAL: 0.25,
  CANCEL_ORDER: 0.25,
  SLEEP: 0.25,
  BUY: 0.5
}

function eventShouldOccur(eventName: string): boolean {
  if (ODDS[eventName] === undefined) throw Error('Unknown chance')
  return Math.random() <= ODDS[eventName]
}

async function main() {
  const deployerSigner = provider.getSigner(1)

  const deployConfig = JSON.parse(fs.readFileSync('deploy.json').toString())

  async function createClient(): Promise<Client> {
    const id = new PrivateKeyIdentity(undefined, provider)
    const l2Client = new L2Client(id, API_URL, {
      operatorAddress: deployConfig.operator,
      mediator: deployConfig.mediator
    })

    await l2Client.init()

    const assetsRegistry = new AssetRegistry()
    assetsRegistry.add('OAX', deployConfig.assets.OAX)
    assetsRegistry.add('WETH', deployConfig.assets.WETH)

    const exClient = new ExchangeClient(id, l2Client, assetsRegistry, {
      fee: {
        asset: deployConfig.assets.OAX,
        amount: E('0.00001')
      }
    })

    // fund client with ethers
    {
      const tx = await deployerSigner.sendTransaction({
        to: id.address,
        value: toEthersBn(E(FUND_AMOUNT_ETHER.toString(10)))
      })
      await tx.wait()
    }

    // buy WETH
    {
      const tx = await id.sendTransaction({
        to: deployConfig.assets.WETH,
        value: toEthersBn(E(TOKEN_AMOUNT_ETHER.toString(10)))
        // value: `0x${E(TOKEN_AMOUNT_ETHER.toString(10)).toString(16)}`
      })
      await tx.wait()
    }

    // buy OAX
    {
      const tx = await id.sendTransaction({
        to: deployConfig.assets.OAX,
        value: toEthersBn(E(TOKEN_AMOUNT_ETHER.toString(10)))
      })
      await tx.wait()
    }

    return { l2Client, exClient }
  }

  const mediator = getContract(
    deployConfig.mediator,
    'Mediator',
    deployerSigner
  )

  // @ts-ignore
  const BLOCKS_PER_ROUND = (await mediator.roundSize()).toNumber()

  let round = (await mediator.getCurrentRound()).toNumber()
  let quarter = (await mediator.getCurrentQuarter()).toNumber()

  let numberOfClients: number = 0

  provider.on('block', async () => {
    let r = (await mediator.getCurrentRound()).toNumber()
    let q = (await mediator.getCurrentQuarter()).toNumber()

    if (r !== round) {
      round = r
    }

    if (q !== quarter) {
      console.log(`Entering round ${r} quarter ${q}`)
      quarter = q

      for (const client of clients) {
        const { exClient, l2Client } = client

        const orderSym = 'OAX/WETH'
        const orderType = 'limit'
        const orderSide = eventShouldOccur('BUY') ? 'buy' : 'sell'
        const orderAmt = D(new BigNumber(Math.random()).toString(10))
        const orderPrice = D('1')

        console.info(`Client ${l2Client.address} placing order.
         symbol: ${orderSym}
         type: ${orderType}
         side: ${orderSide}
         amount: ${orderAmt}
         price: ${orderPrice}`)

        const orderId = await exClient.createOrder(
          orderSym,
          orderType,
          orderSide,
          orderAmt,
          orderPrice
        )

        console.info(`Order created successfully with order ID ${orderId}`)

        // if (eventShouldOccur('SLEEP')) {
        //
        //   await exClient.leave()
        //
        //   setTimeout(() => exClient.join(), BLOCKS_PER_ROUND * BLOCK_TIME_MS)
        // }
      }

      if (
        (true || eventShouldOccur('NEW_CLIENT')) &&
        numberOfClients < MAX_NUMBER_OF_CLIENTS
      ) {
        console.info('Creating a new client')
        const client = await createClient()

        numberOfClients++

        const { exClient, l2Client } = client

        await exClient.join()

        await exClient.deposit(
          deployConfig.assets.OAX,
          TOKEN_AMOUNT_ETHER,
          true
        )
        await exClient.deposit(
          deployConfig.assets.WETH,
          TOKEN_AMOUNT_ETHER,
          true
        )

        clients.push(client)
        console.info(`Created a new client ${l2Client.address}`)
      }
    }
  })

  console.log('Chaos testing started')

  console.log('CHANCE OF EVENTS')
  console.log('================')
  console.log(ODDS)
}

main().catch(console.error)
