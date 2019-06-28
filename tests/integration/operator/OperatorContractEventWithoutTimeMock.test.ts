// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

import { JsonRpcProvider } from 'ethers/providers'
import { Operator } from '../../../src/server/operator/Operator'
import { GETH_RPC_URL } from '../../../config/environment'
import { D, etherToD } from '../../../src/common/BigNumberUtils'
import * as SystemFixtures from '../../libs/SystemFixture'

import { Mediator } from '../../../src/contracts/wrappers/Mediator'
import { MediatorMock } from '../../../src/contracts/wrappers/MediatorMock'
import { OAX_CONTRACT_NAME } from '../../libs/SystemFixture'

import { WETH_CONTRACT_NAME } from '../../libs/SystemFixture'
import { mkRandomHash } from '../../libs/CryptoUtils'

describe('how the operator processes mediator events', () => {
  const provider = new JsonRpcProvider(GETH_RPC_URL)
  const waitForQuarter = () =>
    new Promise(resolve => operator.once(`newQuarterEventReceived`, resolve))

  let fixtures: SystemFixtures.SystemFixture
  let operator: Operator
  let mediator: Mediator | MediatorMock

  describe('When a new quarter starts', () => {
    // Because of the long test time, we don't do full isolation here
    beforeAll(async () => {
      fixtures = await SystemFixtures.createSystemFixture({
        // Round size has to be long enough for fixtures initialization to
        // complete. Need 1 block to register the asset contract, and another
        // block to control movement to the next quarter
        roundSize: 32,
        assets: [WETH_CONTRACT_NAME, OAX_CONTRACT_NAME],
        operator: {
          initialETH: etherToD('1000')
        },
        runServer: false,
        mockMediator: false,
        provider
      })

      operator = await fixtures.getOperator()
      mediator = fixtures.getMediator(operator.identity)

      // starts at round 0 quarter 0
    })

    beforeEach(async () => {
      // Bogus dispute and withdrawal request to trigger moderation logic
      const ledger = fixtures.getMetaLedger()
      await ledger.insertWithdrawalAsync({
        txHash: mkRandomHash(),
        round: 0,
        amount: D('1'),
        asset: OAX_CONTRACT_NAME,
        wallet: operator.address,
        status: 'pending'
      })
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it.each`
      round | quarter | actions
      ${0}  | ${1}    | ${['processWithdrawalRequests', 'processOpenDisputes']}
      ${0}  | ${2}    | ${['processWithdrawalRequests', 'processOpenDisputes']}
      ${0}  | ${3}    | ${['processWithdrawalRequests', 'processOpenDisputes']}
      ${1}  | ${0}    | ${['processWithdrawalRequests', 'processOpenDisputes', 'commit']}
    `(
      'Operate performs $actions when entering round $round quarter $quarter',
      async ({ round, quarter, actions }) => {
        const methods: { [name: string]: jest.SpyInstance } = {}

        for (const action of actions) {
          methods[action] = jest.spyOn(operator, action)

          // We are not interested in the behaviors of audit or confirmWithdrawal
          // here. They are to be tested in separate integration tests
          methods[action].mockImplementation(() => {})
        }

        const onNewQuarterCompleted = waitForQuarter()

        await fixtures.skipToNextQuarterNoMock()

        expect((await mediator.getCurrentRound()).toNumber()).toEqual(round)
        expect((await mediator.getCurrentQuarter()).toNumber()).toEqual(quarter)

        await onNewQuarterCompleted

        if (actions.includes('moderateWithdrawalRequest')) {
          expect(methods['moderateWithdrawalRequest']).toHaveBeenCalled()
        }

        if (actions.includes('processOpenDisputes')) {
          expect(methods['processOpenDisputes']).toHaveBeenCalled()
        }

        if (actions.includes('commit')) {
          expect(methods['commit']).toHaveBeenCalled()
        }
      }
    )
  })
})
