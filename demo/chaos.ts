// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import fs from 'fs'
import BigNumber from 'bignumber.js'

import { JsonRpcProvider, JsonRpcSigner } from 'ethers/providers'
import { D, etherToD, toEthersBn } from '@oax/common/BigNumberUtils'

import { GETH_RPC_URL, OPERATOR_URL } from '../config/environment'

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

////////////////////////////////////////////////
// Chaos testing configuration
////////////////////////////////////////////////

const MOCK_MEDIATOR = process.env.MOCK_MEDIATOR == 'true'

// Use empty wallet filepath to sign with geth node.
const DEPLOYER_WALLET_FILEPATH = ''
const DEPLOYER_WALLET_PASSWORD = 'testtest'

const MAX_NUMBER_OF_CLIENTS = 10
const FUND_AMOUNT_ETHER = D('0.3')
const TOKEN_AMOUNT_ETHER = D('0.1')
// After this round the mediator halts
const ROUND_HALT = 4
const PROB_NEW_CLIENT = 0.75
const PROB_WITHDRAW = 0.5
const PROB_DISPUTE = 0.25
const PROB_CANCEL_ORDER = 0.25
const PROB_BUY = 0.5
const PROB_FAILURE = 0.05
const MAX_WITHDRAWAL_WEI = 5e15
const MAX_ORDER_AMOUNT_ETH = D('0.05')

////////////////////////////////////////////////

const USE_GETH_SIGNER = !DEPLOYER_WALLET_FILEPATH

const ODDS: { [event: string]: number } = {
  NEW_CLIENT: PROB_NEW_CLIENT,
  WITHDRAW: PROB_WITHDRAW,
  DISPUTE: PROB_DISPUTE,
  CANCEL_ORDER: PROB_CANCEL_ORDER,
  BUY: PROB_BUY,
  FAILURE: PROB_FAILURE
}

interface Client {
  l2Client: L2ClientChaos
  exClient: ExchangeClient
}

BigNumber.config({ DECIMAL_PLACES: 8 })

const provider = new JsonRpcProvider(GETH_RPC_URL)
provider.pollingInterval = 20

let clients: Client[] = []

const E = etherToD

function eventShouldOccur(eventName: string): boolean {
  if (ODDS[eventName] === undefined) throw Error('Unknown chance')
  return Math.random() <= ODDS[eventName]
}

/**
 * Obtains the signer object of the deployer depending on the ethereum network (local or testnet)
 */

async function getDeployerSigner(): Promise<JsonRpcSigner> {
  console.log(`GETH_RPC_URL: ${GETH_RPC_URL}`)

  let deployerSigner: JsonRpcSigner

  // Fetch local signer
  if (USE_GETH_SIGNER) {
    deployerSigner = await provider.getSigner(1)
  } else {
    // Fetch testnet signer

    let deployerWallet = await loadWalletFromFile(
      DEPLOYER_WALLET_FILEPATH,
      DEPLOYER_WALLET_PASSWORD
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
    const l2Client = new L2ClientChaos(id, OPERATOR_URL, {
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

  /**
   * Check that a client cannot deposit once the mediator enters in halted mode
   * @param l2client: client to be tested
   * @param tokenAddress: tokenAddress used for the deposit attempt
   */
  async function checkDepositBlocked(
    l2client: L2ClientChaos,
    tokenAddress: Address
  ) {
    let currentRound = await l2client.mediator.getCurrentRound()
    const amountBefore = await l2client.getBalanceTokenOffChain(
      tokenAddress,
      currentRound
    )

    try {
      await l2client.deposit(tokenAddress, D('10'), true)
    } catch (e) {
      console.info('This exception is expected. Deposit has been blocked')
    }

    currentRound = await l2client.mediator.getCurrentRound()

    const amountAfter = await l2client.getBalanceTokenOffChain(
      tokenAddress,
      currentRound
    )

    if (!amountAfter.minus(amountBefore).eq(D('0'))) {
      console.log(`Amount before: ${amountBefore}`)
      console.log(`Amount after: ${amountAfter}`)
      const msg = 'The deposit was accepted despite the mediator is HALTED!'
      console.error(msg)
    }
  }

  async function checkInitiateWithdrawalBlocked(
    l2client: L2ClientChaos,
    tokenAddress: Address
  ) {
    let currentRound = await l2client.mediator.getCurrentRound()
    const amountBefore = await l2client.getBalanceTokenOffChain(
      tokenAddress,
      currentRound
    )

    try {
      await l2client.withdraw(tokenAddress, D('10'))
    } catch (e) {
      console.info('This exception is expected. Withdrawal has been blocked.')
    }

    currentRound = await l2client.mediator.getCurrentRound()

    const amountAfter = await l2client.getBalanceTokenOffChain(
      tokenAddress,
      currentRound
    )

    if (!amountAfter.minus(amountBefore).eq(D('0'))) {
      console.log(`Amount before: ${amountBefore}`)
      console.log(`Amount after: ${amountAfter}`)
      const msg = 'The withdrawal was executed despite the mediator is HALTED!'
      console.error(msg)
    }
  }

  /**
   * Check that a client can recover their funds once the mediator is halted
   * @param l2Client
   * @param tokenAddress
   */
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

          try {
            await checkDepositBlocked(l2Client, deployConfig.assets.OAX)
            await checkDepositBlocked(l2Client, deployConfig.assets.WETH)
          } catch (e) {
            console.error(
              'Something went wrong when trying to deposit in HALTED mode: ' + e
            )
          }

          try {
            await checkInitiateWithdrawalBlocked(
              l2Client,
              deployConfig.assets.OAX
            )
            await checkInitiateWithdrawalBlocked(
              l2Client,
              deployConfig.assets.WETH
            )
          } catch (e) {
            console.error(
              'Something went wrong when trying to withdraw in HALTED mode: ' +
                e
            )
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
          .multipliedBy(MAX_ORDER_AMOUNT_ETH)
          .decimalPlaces(8)
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
          Math.floor(Math.random() * MAX_WITHDRAWAL_WEI).toString(10)
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
