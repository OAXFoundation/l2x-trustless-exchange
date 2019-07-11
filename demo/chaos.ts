// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import fs from 'fs'
import BigNumber from 'bignumber.js'

import { JsonRpcProvider, JsonRpcSigner } from 'ethers/providers'
import { D, etherToD, toEthersBn } from '@oax/common/BigNumberUtils'

import {
  DEPLOYER_PASSWORD,
  DEPLOYER_WALLET_FILEPATH,
  GETH_RPC_URL,
  MOCK_MEDIATOR
} from '../config/environment'
const API_URL = 'http://127.0.0.1:8899'
const MAX_NUMBER_OF_CLIENTS = 40

import {
  AssetRegistry,
  ExchangeClient,
  getContract,
  PrivateKeyIdentity
} from '@oax/client'

import { L2ClientChaos } from '../tests/libs/L2ClientForTest'
import { loadWalletFromFile, sleep } from '../bin/utils'
import { waitForMining } from '../src/common/ContractUtils'
import { Address } from '../src/common/types/BasicTypes'

interface Client {
  l2Client: L2ClientChaos
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

// After this round the mediator halts
const ROUND_HALT: number = 3

const ODDS: { [event: string]: number } = {
  NEW_CLIENT: 0.75,
  WITHDRAW: 0.5,
  DISPUTE: 0.25,
  CONFIRM_WITHDRAWAL: 0.25,
  CANCEL_ORDER: 0.25,
  SLEEP: 0.25,
  BUY: 0.5,
  FAILURE: 0.05
}

function eventShouldOccur(eventName: string): boolean {
  if (ODDS[eventName] === undefined) throw Error('Unknown chance')
  return Math.random() <= ODDS[eventName]
}

/**
 * Obtains the signer object of the deployer depending on the ethereum network (local or testnet)
 */

async function getDeployerSigner(): Promise<JsonRpcSigner> {
  const providerUrl = GETH_RPC_URL
  console.log(`GETH_RPC_URL: ${GETH_RPC_URL}`)

  let deployerSigner: JsonRpcSigner

  const runsOnLocalhost: boolean =
    providerUrl.indexOf('127.0.0.1') >= 0 ||
    providerUrl.indexOf('localhost') >= 0

  // Fetch local signer

  if (runsOnLocalhost) {
    deployerSigner = await provider.getSigner(1)
  } else {
    // Fetch testnet signer

    let deployerWallet = await loadWalletFromFile(
      DEPLOYER_WALLET_FILEPATH!,
      DEPLOYER_PASSWORD
    )
    deployerSigner = await deployerWallet.connect(provider)
  }

  return deployerSigner
}

async function main() {
  const deployerSigner = await getDeployerSigner()

  const deployConfig = JSON.parse(fs.readFileSync('deploy.json').toString())

  const mediatorContractName = MOCK_MEDIATOR ? 'MediatorMockChaos' : 'Mediator'

  const mediator = getContract(
    deployConfig.mediator,
    mediatorContractName,
    deployerSigner
  )

  async function createClient(): Promise<Client> {
    const id = new PrivateKeyIdentity(undefined, provider)
    const l2Client = new L2ClientChaos(id, API_URL, {
      operatorAddress: deployConfig.operator,
      mediator: deployConfig.mediator
    })

    // Set the probability to miss the fills
    l2Client.setRandomFailureProbability(ODDS['FAILURE'])

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

  async function checkFundsRecovery(
    l2Client: L2ClientChaos,
    tokenAddress: Address
  ) {
    let successfullRecovery: boolean
    const clientAddress = l2Client.address

    successfullRecovery = await mediator.functions.recovered(
      tokenAddress,
      clientAddress
    )

    const RETRY = 5
    const WAIT_BETWEEN_RETRY = 5
    let retry = 0

    while (!successfullRecovery && retry < RETRY) {
      console.info(
        `Waiting for client ${clientAddress} to recover ${tokenAddress}...`
      )
      await sleep(WAIT_BETWEEN_RETRY * 1000)
      successfullRecovery = await mediator.functions.recovered(
        tokenAddress,
        clientAddress
      )
    }

    if (successfullRecovery) {
      console.info(
        `Client ${clientAddress} successfully recovered his ${tokenAddress} tokens.`
      )
    } else {
      console.error(
        `Client ${clientAddress} failed to recover his ${tokenAddress} tokens.`
      )
    }

    // Checking again
    successfullRecovery = await mediator.functions.recovered(
      tokenAddress,
      clientAddress
    )
    if (successfullRecovery)
      console.info(
        `Client ${clientAddress} successfully recovered his ${tokenAddress}tokens.`
      )
    else {
      console.error(
        `Client ${clientAddress} could not recover his ${tokenAddress} tokens.`
      )
    }
  }

  // @ts-ignore
  const BLOCKS_PER_ROUND = (await mediator.roundSize()).toNumber()

  let round: number = (await mediator.getCurrentRound()).toNumber()
  let quarter: number = (await mediator.getCurrentQuarter()).toNumber()

  let numberOfClients: number = 0

  provider.on('block', async () => {
    let r = (await mediator.getCurrentRound()).toNumber()
    let q = (await mediator.getCurrentQuarter()).toNumber()

    if (r !== round) {
      round = r

      console.log(
        `\n\n\n******************** New round ${round} ***************************`
      )

      if (round === ROUND_HALT) {
        console.log(`Halting the mediator...`)
        await waitForMining(mediator.functions.halt())

        const seconds = 5
        console.log(`Sleeping ${seconds} seconds...`)
        await sleep(seconds * 1000)

        for (const client of clients) {
          const l2Client = client.l2Client
          try {
            await checkFundsRecovery(l2Client, deployConfig.assets.OAX)
            await checkFundsRecovery(l2Client, deployConfig.assets.WETH)
          } catch (e) {
            console.error('Error when trying to recover funds... ' + e)
          }
        }
      }
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

        try {
          const orderId = await exClient.createOrder(
            orderSym,
            orderType,
            orderSide,
            orderAmt,
            orderPrice
          )
          console.info(`Order created successfully with order ID ${orderId}`)
        } catch (e) {
          console.error('Error when placing order... ' + e)
        }

        const randomWithdrawAmount = D(
          Math.floor(Math.random() * 5000000000000000000).toString(10)
        )
        console.log(
          `Client ${
            l2Client.address
          } trying to withdraw ${randomWithdrawAmount} wei...`
        )

        if (eventShouldOccur('WITHDRAW'))
          try {
            await exClient.requestWithdrawal(
              deployConfig.assets.WETH,
              randomWithdrawAmount
            )
          } catch (e) {
            console.info('Problem withdrawing: ' + e)
          }

        // if (eventShouldOccur('SLEEP')) {
        //
        //   await exClient.leave()
        //
        //   setTimeout(() => exClient.join(), BLOCKS_PER_ROUND * BLOCK_TIME_MS)
        // }
      }

      if (
        eventShouldOccur('NEW_CLIENT') &&
        numberOfClients < MAX_NUMBER_OF_CLIENTS
      ) {
        console.info('Creating a new client')
        try {
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
        } catch (e) {
          console.error('Problem when trying to create client... ' + e)
        }
      }
    }
  })

  console.log('Chaos testing started')

  console.log('CHANCE OF EVENTS')
  console.log('================')
  console.log(ODDS)

  console.log(`ROUND_HALT: ${ROUND_HALT}`)
}

main().catch(console.error)
