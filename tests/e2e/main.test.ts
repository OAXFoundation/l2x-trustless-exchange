// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import 'jest'
import { spawnSync } from 'child_process'
import { Signer } from 'ethers'
import { AddressZero } from 'ethers/constants'
import { JsonRpcProvider } from 'ethers/providers'
import BigNumber from 'bignumber.js'

import {
  GETH_RPC_URL,
  CONTRACTS,
  FEE_AMOUNT_WEI,
  OPERATOR_URL
} from '../../config/environment'
import {
  Address,
  Amount,
  ApprovalId,
  Round
} from '../../src/common/types/BasicTypes'
import * as SystemFixtures from '../libs/SystemFixture'
import { PrivateKeyIdentity } from '../../src/common/identity/PrivateKeyIdentity'

import { D, etherToD, weiToEther } from '../../src/common/BigNumberUtils'

import { WETH_CONTRACT_NAME } from '../libs/SystemFixture'
import { OAX_CONTRACT_NAME } from '../libs/SystemFixture'
import { MediatorAsync } from '../../src/common/mediator/Contracts'

import { ExchangeClient } from '@oax/client'
import { AssetRegistry } from '../../src/common/AssetRegistry'
import { fundWETH, fundEther } from '../../src/common/ContractUtils'

import { getContract } from '../../src/common/ContractUtils'
import { Mediator } from '../../src/contracts/wrappers/Mediator'
import { BidAsk } from '@oax/common/types/ExchangeTypes'
import { L2ClientForTest } from '../libs/L2ClientForTest'

function doServerSetupInTest() {
  return process.env.DOCKER_E2E == undefined
}

async function skipToNextRound(
  mediator: MediatorAsync,
  clients: L2ClientForTest[],
  signer: Signer
) {
  const round = await mediator.getCurrentRound()
  await skipToNextQuarter(mediator, clients, signer)

  while (round === (await mediator.getCurrentRound())) {
    await skipToNextQuarter(mediator, clients, signer)
  }
}

async function skipToNextQuarter(
  mediator: MediatorAsync,
  clients: L2ClientForTest[],
  signer: Signer
): Promise<void> {
  const quarter = await mediator.getCurrentQuarter()

  while (quarter == (await mediator.getCurrentQuarter())) {
    // can't wait for operator events because we don't have the operator
    const events = clients.map(c => c.waitForEvent('onNewBlockProcessed'))

    const tx = await signer.sendTransaction({
      to: AddressZero,
      value: 0
    })
    await tx.wait()

    for (const event of events) {
      await event
    }
  }
}

describe('End-to-end', () => {
  const OPERATOR_ADDRESS = process.env.OPERATOR_ADDRESS
  const provider = new JsonRpcProvider(GETH_RPC_URL)
  const deployer = provider.getSigner(0)
  provider.pollingInterval = 20

  let OAXAddress: Address
  let WETHAddress: Address

  let fixtures: SystemFixtures.SystemFixture

  let aliceL2: L2ClientForTest
  let bobL2: L2ClientForTest

  let aliceEx: ExchangeClient
  let bobEx: ExchangeClient

  let currentRound: Round

  let mediatorAsync: MediatorAsync

  const E = etherToD
  const fee = FEE_AMOUNT_WEI

  const aliceOAXDeposit: Amount = E('1000')
  const aliceWETHDeposit: Amount = E('50')

  const bobOAXDeposit: Amount = E('1000')
  const bobWETHDeposit: Amount = E('50')

  const aliceOAXPostTrade = E('1000')
    .minus(E('7'))
    .minus(fee)

  const aliceWETHPostTrade = E('50').plus(E('7'))

  const bobOAXPostTrade = E('1000')
    .plus(E('7'))
    .minus(fee)
  const bobWETHPostTrade = E('50').minus(E('7'))

  const aliceOAXPostFullCancellation = aliceOAXPostTrade.minus(fee)
  const aliceOAXPostPartialCancellation = aliceOAXPostFullCancellation
    .minus(E('15'))
    .minus(fee)

  const bobOAXPostPartialCancellation = bobOAXPostTrade.plus(E('15')).minus(fee)
  const bobWETHPostPartialCancellation = bobWETHPostTrade.minus(E('15'))

  afterAll(() => {
    jest.restoreAllMocks()
  })

  beforeAll(async () => {
    const configAlice = {
      initialETH: etherToD('10000'),
      initialTokens: {
        [WETH_CONTRACT_NAME]: aliceWETHDeposit,
        [OAX_CONTRACT_NAME]: aliceOAXDeposit
      },
      approveMediatorForTransfer: {
        [WETH_CONTRACT_NAME]: aliceWETHDeposit,
        [OAX_CONTRACT_NAME]: aliceOAXDeposit
      }
    }

    const configBob = {
      initialETH: etherToD('10000'),
      initialTokens: {
        [WETH_CONTRACT_NAME]: bobWETHDeposit,
        [OAX_CONTRACT_NAME]: bobOAXDeposit
      },
      approveMediatorForTransfer: {
        [WETH_CONTRACT_NAME]: bobWETHDeposit,
        [OAX_CONTRACT_NAME]: bobOAXDeposit
      }
    }

    const fixtureConfig = {
      // Round size has to be long enough for fixtures initialization to
      // complete. Need 1 block to register the asset contract, and another
      // block to control movement to the next quarter
      roundSize: 32,
      assets: [WETH_CONTRACT_NAME, OAX_CONTRACT_NAME],
      operator: {
        initialETH: etherToD('1000')
      },
      runServer: true,
      mockMediator: false,
      provider: provider
    }

    if (doServerSetupInTest()) {
      fixtures = await SystemFixtures.createSystemFixture(fixtureConfig)

      OAXAddress = fixtures.getAssetContractAddress(OAX_CONTRACT_NAME)
      WETHAddress = fixtures.getAssetContractAddress(WETH_CONTRACT_NAME)

      aliceL2 = await fixtures.getClientAsync(configAlice)
      aliceEx = fixtures.getExchangeClient(aliceL2)

      bobL2 = await fixtures.getClientAsync(configBob)
      bobEx = fixtures.getExchangeClient(bobL2)

      mediatorAsync = new MediatorAsync(
        aliceL2.identity,
        fixtures.getMediator(aliceL2.identity)
      )
    } else {
      if (
        CONTRACTS.Mediator == undefined ||
        CONTRACTS.OAXToken == undefined ||
        CONTRACTS.ETHToken == undefined ||
        OPERATOR_ADDRESS == undefined
      ) {
        throw Error('Not all contract addresses defined.')
      }

      OAXAddress = CONTRACTS.OAXToken
      WETHAddress = CONTRACTS.ETHToken

      // fund clients and operator
      // fixtures = new SystemFixtures.SystemFixture(fixtureConfig)
      const alice = new PrivateKeyIdentity(undefined, provider)
      const bob = new PrivateKeyIdentity(undefined, provider)

      // fund clients
      await fundEther(alice.address, configAlice.initialETH, deployer)
      await fundEther(bob.address, configBob.initialETH, deployer)

      await fundWETH(
        CONTRACTS.ETHToken,
        configAlice.initialTokens[WETH_CONTRACT_NAME],
        alice
      )

      await fundWETH(
        CONTRACTS.ETHToken,
        configBob.initialTokens[WETH_CONTRACT_NAME],
        bob
      )

      await fundWETH(
        CONTRACTS.OAXToken,
        configAlice.initialTokens[OAX_CONTRACT_NAME],
        alice
      )
      await fundWETH(
        CONTRACTS.OAXToken,
        configBob.initialTokens[OAX_CONTRACT_NAME],
        bob
      )

      const clientOptions = {
        operatorAddress: OPERATOR_ADDRESS,
        mediator: CONTRACTS.Mediator
      }

      aliceL2 = new L2ClientForTest(alice, OPERATOR_URL, clientOptions)
      await aliceL2.init()

      bobL2 = new L2ClientForTest(bob, OPERATOR_URL, clientOptions)
      await bobL2.init()

      const assetRegistry = new AssetRegistry()
      assetRegistry.add('OAX', CONTRACTS.OAXToken)
      assetRegistry.add('WETH', CONTRACTS.ETHToken)

      const exchangeClientConfig = {
        fee: {
          asset: CONTRACTS.OAXToken,
          amount: fee
        }
      }

      aliceEx = new ExchangeClient(
        alice,
        aliceL2,
        assetRegistry,
        exchangeClientConfig
      )
      bobEx = new ExchangeClient(
        bob,
        bobL2,
        assetRegistry,
        exchangeClientConfig
      )

      mediatorAsync = new MediatorAsync(aliceL2.identity, getContract(
        CONTRACTS.Mediator,
        'Mediator',
        aliceL2.identity
      ) as Mediator)
    }
  })

  const skipRound = async () => {
    if (doServerSetupInTest()) {
      return fixtures.skipToNextRoundAndTriggerEvents()
    } else {
      return skipToNextRound(mediatorAsync, [aliceL2, bobL2], deployer)
    }
  }
  const skipQuarter = async () => {
    if (doServerSetupInTest()) {
      return fixtures.skipToNextQuarterAndTriggerEvents()
    } else {
      return skipToNextQuarter(mediatorAsync, [aliceL2, bobL2], deployer)
    }
  }

  afterAll(async () => {
    await aliceL2.leave()
    await bobL2.leave()

    if (doServerSetupInTest()) {
      await fixtures.stopServer()
    }
  })

  describe('join', () => {
    it('alice joins', async () => {
      await aliceEx.join()
    })

    it('bob joins', async () => {
      await bobEx.join()
    })
  })

  describe('deposit', () => {
    it('alice deposits OAX', async () => {
      await aliceEx.deposit(OAXAddress, weiToEther(aliceOAXDeposit), true)
    })

    it('alice deposits WETH', async () => {
      await aliceEx.deposit(WETHAddress, weiToEther(aliceWETHDeposit), true)
    })

    it('bob deposits OAX', async () => {
      await bobEx.deposit(OAXAddress, weiToEther(bobOAXDeposit), true)
    })

    it('bob deposits WETH', async () => {
      await bobEx.deposit(WETHAddress, weiToEther(bobWETHDeposit), true)
    })
  })

  describe('over withdrawal', () => {
    it('-> round 1', async () => {
      await skipRound()
    })

    it('-> round 2', async () => {
      await skipRound()
    })

    it('alice cannot create an order with wrong symbol', async () => {
      currentRound = await mediatorAsync.getCurrentRound()
      await expect(
        aliceEx.createOrder('WETH/OAX', 'limit', 'buy', D('7'), D('1'))
      ).rejects.toThrow("No market for symbol 'WETH/OAX'")
    })

    it('alice creates an order', async () => {
      currentRound = await mediatorAsync.getCurrentRound()
      await aliceEx.createOrder('OAX/WETH', 'limit', 'sell', D('7'), D('1'))
    })

    it('alice tries to over withdraw', async () => {
      // Done manually to avoid balance checks and accounting.
      const proof = await aliceL2.getProofAsync(OAXAddress, currentRound - 1)
      if (proof == undefined) {
        throw Error('Proof not found')
      }

      const maxLegitWithdrawal = aliceOAXDeposit.minus(etherToD('7')).minus(fee)

      await mediatorAsync.initiateWithdrawal(
        proof,
        maxLegitWithdrawal.plus(D('1'))
      )

      const roundWithdrawalRequest = await mediatorAsync.getActiveWithdrawalRound(
        OAXAddress,
        aliceL2.address
      )
      expect(roundWithdrawalRequest).toEqual(currentRound)
    })

    it('->       2.2', async () => {
      await skipQuarter()
      // When running against the docker container there is a race condition.
      // Skipping two quarters allows for enough time for closing of the dispute
      // to be reflected on chain.
      await skipQuarter()
    })

    it('operator cancelled withdrawal', async () => {
      const roundWithdrawalRequest = await mediatorAsync.getActiveWithdrawalRound(
        OAXAddress,
        aliceL2.address
      )

      // The withdrawal request has been cancelled, the round of request is 0
      expect(roundWithdrawalRequest).toEqual(0)
    })
  })

  describe('trading', () => {
    it('bob creates an order', async () => {
      await bobEx.createOrder(`OAX/WETH`, 'limit', 'buy', D('7'), D('1'))
    })

    it('-> round 3', async () => {
      await skipRound()
    })

    it('->       3.1', async () => {
      // In order to do an audit and fetch the proofs
      await skipQuarter()
    })

    it('verify exchange balances', async () => {
      const expectedBalances = (oax: BigNumber, weth: BigNumber) => ({
        OAX: {
          free: weiToEther(oax),
          locked: D('0')
        },
        WETH: {
          free: weiToEther(weth),
          locked: D('0')
        }
      })

      await expect(aliceEx.fetchBalances()).resolves.toEqual(
        expectedBalances(aliceOAXPostTrade, aliceWETHPostTrade)
      )

      await expect(bobEx.fetchBalances()).resolves.toEqual(
        expectedBalances(bobOAXPostTrade, bobWETHPostTrade)
      )
    })
  })

  describe('trustful order cancellation - full cancellation', () => {
    let approvalId: ApprovalId

    it('alice creates an order', async () => {
      approvalId = await aliceEx.createOrder(
        'OAX/WETH',
        'limit',
        'sell',
        D('10'),
        D('1')
      )
    })

    it('order sell amount locked', async () => {
      const balances = await aliceEx.fetchBalances()
      expect(balances.OAX.locked).toEqual(D('10'))
    })

    it('order is available for matching', async () => {
      const orderBook = await aliceEx.fetchOrderBook('OAX/WETH')

      const ask: BidAsk = {
        amount: D('10'),
        price: D('1')
      }

      expect(orderBook.asks).toEqual([ask])
    })

    it('alice cancels the order', async () => {
      await aliceEx.cancelOrder(approvalId)
    })

    it('order is no longer available for matching', async () => {
      const orderBook = await aliceEx.fetchOrderBook('OAX/WETH')

      expect(orderBook.asks).toEqual([])
    })

    it('order sell amount unlocked', async () => {
      const balances = await aliceEx.fetchBalances()
      expect(balances.OAX.locked).toEqual(D('0'))
    })

    it('Sell asset balance is unaffected', async () => {
      const sellAssetBalance = await aliceL2.getBalanceTokenOffChain(
        WETHAddress,
        aliceL2.round
      )

      expect(sellAssetBalance).toEqual(aliceWETHPostTrade)
    })

    it('attempt to cancel the order again fails', async () => {
      await expect(aliceEx.cancelOrder(approvalId)).rejects.toThrow(
        `${approvalId} already closed`
      )
    })
  })

  describe('trustful order cancellation - partial cancellation', () => {
    let aliceApprovalId: ApprovalId

    it('alice creates an order', async () => {
      aliceApprovalId = await aliceEx.createOrder(
        'OAX/WETH',
        'limit',
        'sell',
        D('30'),
        D('1')
      )
    })

    it('bob takes half the order', async () => {
      await bobEx.createOrder(`OAX/WETH`, 'limit', 'buy', D('15'), D('1'))
    })

    it('alice cancels the order', async () => {
      await aliceEx.cancelOrder(aliceApprovalId)
    })

    it('order is no longer available for matching', async () => {
      const orderBook = await aliceEx.fetchOrderBook('OAX/WETH')

      expect(orderBook.bids).toEqual([])
    })

    it(`alice's sell order amount unlocked`, async () => {
      const balances = await aliceEx.fetchBalances()

      expect(balances.OAX.locked).toEqual(D('0'))
    })

    it('attempt to cancel the order again fails', async () => {
      await expect(aliceEx.cancelOrder(aliceApprovalId)).rejects.toThrow(
        `${aliceApprovalId} already closed`
      )
    })
  })

  describe('dispute', () => {
    it('alice opens dispute', async () => {
      await aliceL2.openBalanceDispute(3)
    })

    it('dispute exists on chain', async () => {
      await expect(mediatorAsync.openDisputeCounters(3)).resolves.toEqual(1)
    })

    it('->       3.2', async () => {
      await skipQuarter()
    })

    it('->       3.3', async () => {
      await skipQuarter()
    })

    it('->  round 4', async () => {
      await skipQuarter()
    })

    it('dispute was closed on chain', async () => {
      await expect(mediatorAsync.openDisputeCounters(3)).resolves.toEqual(0)
    })
  })

  describe('withdrawal', () => {
    it('->       4.1', async () => {
      await skipQuarter()
    })

    it('alice withdraws OAX', async () => {
      await aliceEx.requestWithdrawal(
        OAXAddress,
        aliceOAXPostPartialCancellation
      )
    })

    it('-> round 5', async () => {
      await skipRound()
    })

    it('->       5.1', async () => {
      await skipQuarter()
    })

    it('-> round 6', async () => {
      await skipRound()
    })

    it('-> round 7', async () => {
      await skipRound()
    })

    it('verify withdrawal completed', async () => {
      await expect(aliceL2.getBalanceTokenOnChain(OAXAddress)).resolves.toEqual(
        aliceOAXPostPartialCancellation
      )
    })
  })

  describe('halting and recovery', () => {
    it("disable operator's commit", async () => {
      if (doServerSetupInTest()) {
        jest.spyOn(fixtures.getOperator(), 'commit').mockResolvedValue([])
      } else {
        // stop the operator docker container
        const res = spawnSync('docker', ['stop', 'oax-e2e'])
        expect(res.status).toEqual(0)
      }
    })

    it('-> round 8', async () => {
      await skipRound()
    })

    it('->       8.1', async () => {
      await skipQuarter()
    })

    it('re-enable operator (if using docker)', async () => {
      if (!doServerSetupInTest()) {
        const res = spawnSync('docker', ['start', 'oax-e2e'])
        expect(res.status).toEqual(0)
      }
    })
    let recovery: Promise<{}>

    it('halt the mediator', async () => {
      recovery = bobL2.waitForEvent('recoveryCompleted')
      await mediatorAsync.updateHaltedState()
    })

    it('verify mediator is halted', async () => {
      await expect(mediatorAsync.isHalted()).resolves.toEqual(true)
    })

    it('wait for recovery', async () => {
      await recovery
    })

    it('verify all funds recovered', async () => {
      await expect(bobL2.getBalanceTokenOnChain(OAXAddress)).resolves.toEqual(
        bobOAXPostPartialCancellation
      )
      await expect(bobL2.getBalanceTokenOnChain(WETHAddress)).resolves.toEqual(
        bobWETHPostPartialCancellation
      )
    })
  })
})
