// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import 'jest'
import { Signer } from 'ethers'
import { AddressZero } from 'ethers/constants'
import { JsonRpcProvider } from 'ethers/providers'

import { GETH_RPC_URL } from '../../config/environment'
import { Address, Amount } from '../../src/common/types/BasicTypes'
import * as SystemFixtures from '../libs/SystemFixture'

import { etherToD, weiToEther } from '../../src/common/BigNumberUtils'

import { WETH_CONTRACT_NAME } from '../libs/SystemFixture'
import { OAX_CONTRACT_NAME } from '../libs/SystemFixture'
import { MediatorAsync } from '../../src/common/mediator/Contracts'

import { ExchangeClient } from '@oax/client'

import { MetaLedger } from '../../src/common/accounting/MetaLedger'
import { Operator } from '@oax/server/operator/Operator'
import { mkRandomHash } from '../libs/CryptoUtils'
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

describe('End-to-end Dispute Scenarios', () => {
  const provider = new JsonRpcProvider(GETH_RPC_URL)
  const deployer = provider.getSigner(0)
  provider.pollingInterval = 20

  let OAXAddress: Address
  let WETHAddress: Address

  let fixtures: SystemFixtures.SystemFixture

  let aliceL2: L2ClientForTest

  let aliceEx: ExchangeClient

  let mediatorAsync: MediatorAsync

  let ledger: MetaLedger
  let operator: Operator

  const E = etherToD

  const aliceOAXDeposit: Amount = E('1000')
  const aliceWETHDeposit: Amount = E('50')

  afterAll(() => {
    jest.restoreAllMocks()
  })

  beforeAll(async () => {
    const configAlice = {
      initialETH: etherToD('100'),
      initialTokens: {
        [WETH_CONTRACT_NAME]: aliceWETHDeposit,
        [OAX_CONTRACT_NAME]: aliceOAXDeposit
      },
      approveMediatorForTransfer: {
        [WETH_CONTRACT_NAME]: aliceWETHDeposit,
        [OAX_CONTRACT_NAME]: aliceOAXDeposit
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

    fixtures = await SystemFixtures.createSystemFixture(fixtureConfig)

    OAXAddress = fixtures.getAssetContractAddress(OAX_CONTRACT_NAME)
    WETHAddress = fixtures.getAssetContractAddress(WETH_CONTRACT_NAME)

    aliceL2 = await fixtures.getClientAsync(configAlice)
    aliceEx = fixtures.getExchangeClient(aliceL2)

    mediatorAsync = new MediatorAsync(
      aliceL2.identity,
      fixtures.getMediator(aliceL2.identity)
    )

    ledger = fixtures.getMetaLedger()
    operator = fixtures.getOperator()
  })

  const skipRound = async () => {
    if (doServerSetupInTest()) {
      return fixtures.skipToNextRoundAndTriggerEvents()
    } else {
      return skipToNextRound(mediatorAsync, [aliceL2], deployer)
    }
  }
  const skipQuarter = async () => {
    if (doServerSetupInTest()) {
      return fixtures.skipToNextQuarterAndTriggerEvents()
    } else {
      return skipToNextQuarter(mediatorAsync, [aliceL2], deployer)
    }
  }

  afterAll(async () => {
    await aliceL2.leave()

    if (doServerSetupInTest()) {
      await fixtures.stopServer()
    }
  })

  describe('join', () => {
    it('alice joins', async () => {
      await aliceEx.join()
    })
  })

  describe('deposit', () => {
    it('alice deposits OAX', async () => {
      await aliceEx.deposit(OAXAddress, weiToEther(aliceOAXDeposit), true)
    })

    it('alice deposits WETH', async () => {
      await aliceEx.deposit(WETHAddress, weiToEther(aliceWETHDeposit), true)
    })
  })

  describe(`Operator steals from Alice`, () => {
    it('-> round 1', async () => {
      await skipRound()
    })

    it(`Operator takes Alice's OAX balance and credits it to his own`, async () => {
      const round = await mediatorAsync.getCurrentRound()

      const aliceOAXBalance = await ledger.balance(
        OAXAddress,
        aliceL2.address,
        round
      )

      await ledger.withdraw({
        txHash: mkRandomHash(),
        round,
        amount: aliceOAXBalance,
        asset: OAXAddress,
        wallet: aliceL2.address
      })

      await ledger.creditDeposit(
        OAXAddress,
        operator.address,
        aliceOAXBalance,
        round
      )
    })

    it('-> round 2', async () => {
      await skipRound()
    })

    it('->       2.1', async () => {
      await skipQuarter()
    })

    it(`alice opens a dispute`, async () => {
      const round = await mediatorAsync.getCurrentRound()
      await expect(mediatorAsync.openDisputeCounters(round)).resolves.toEqual(1)
    })

    it('-> round 3', async () => {
      await skipRound()
    })

    it('->       3.1', async () => {
      const aliceRecovered = aliceL2.waitForEvent('recoveryCompleted')

      // at this stage, we don't care to wait for the operator
      await skipToNextQuarter(mediatorAsync, [aliceL2], deployer)

      // wait for the recovery events to finish
      await aliceRecovered
    })

    it('Operator is halted', async () => {
      await expect(mediatorAsync.isHalted()).resolves.toBe(true)
    })

    it(`Alice recovered all funds`, async () => {
      await expect(aliceL2.getBalanceTokenOnChain(OAXAddress)).resolves.toEqual(
        aliceOAXDeposit
      )
      await expect(
        aliceL2.getBalanceTokenOnChain(WETHAddress)
      ).resolves.toEqual(aliceWETHDeposit)
    })
  })
})
