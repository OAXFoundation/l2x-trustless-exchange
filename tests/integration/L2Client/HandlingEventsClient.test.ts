// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'

import { L2Client } from '../../../src/client/operator/L2Client'

import { etherToD } from '../../../src/common/BigNumberUtils'

import { JsonRpcProvider } from 'ethers/providers'
import { GETH_RPC_URL } from '../../../config/environment'
import { Identity } from '../../../src/common/identity/Identity'
import * as SystemFixtures from '../../libs/SystemFixture'

import { MediatorMock } from '../../../src/contracts/wrappers/MediatorMock'
import { OAX_CONTRACT_NAME, WETH_CONTRACT_NAME } from '../../libs/SystemFixture'
import { Mediator } from '../../../src/contracts/wrappers/Mediator'

describe('How the client handles events', () => {
  const provider = new JsonRpcProvider(GETH_RPC_URL)

  let fixtures: SystemFixtures.SystemFixture
  let clientIdentity: Identity
  let client: L2Client
  let mediator: Mediator | MediatorMock

  describe('When a new quarter starts', () => {
    // Because of the long test time, we don't do full isolation here
    beforeAll(async () => {
      fixtures = await SystemFixtures.createSystemFixture({
        // Round size has to be long enough for fixtures initialization to
        // complete. Need 1 block to register the asset contract, and another
        // block to control movement to the next quarter
        roundSize: 16,
        assets: [WETH_CONTRACT_NAME, OAX_CONTRACT_NAME],
        operator: {
          initialETH: etherToD('1000')
        },
        runServer: false,
        mockMediator: false,
        provider
      })

      client = await fixtures.getClientAsync({})

      clientIdentity = client.identity

      // starts at round 0 quarter 0

      mediator = fixtures.getMediator(clientIdentity)
    })

    beforeEach(async () => {
      await client.join()
    })

    afterEach(() => {
      jest.restoreAllMocks()
    })

    it.each`
      round | quarter | actions
      ${0}  | ${1}    | ${[]}
      ${0}  | ${2}    | ${[]}
      ${0}  | ${3}    | ${[]}
      ${1}  | ${0}    | ${['fetchFills']}
      ${1}  | ${1}    | ${['audit']}
      ${1}  | ${2}    | ${[]}
      ${1}  | ${3}    | ${[]}
      ${2}  | ${0}    | ${['fetchFills']}
      ${2}  | ${1}    | ${['audit']}
      ${2}  | ${2}    | ${[]}
      ${2}  | ${3}    | ${[]}
      ${3}  | ${0}    | ${['fetchFills']}
      ${3}  | ${1}    | ${['audit']}
      ${3}  | ${2}    | ${[]}
      ${3}  | ${3}    | ${[]}
      ${4}  | ${0}    | ${['fetchFills']}
      ${4}  | ${1}    | ${['audit', 'confirmWithdrawal']}
      ${4}  | ${2}    | ${[]}
      ${4}  | ${3}    | ${[]}
      ${5}  | ${0}    | ${['fetchFills']}
      ${5}  | ${1}    | ${['audit', 'confirmWithdrawal']}
      ${5}  | ${2}    | ${[]}
      ${5}  | ${3}    | ${[]}
      ${6}  | ${0}    | ${['fetchFills']}
    `(
      'Client performs $actions when entering round $round quarter $quarter',
      async ({ round, quarter, actions }) => {
        const mockAudit = jest.spyOn(client, 'audit')
        mockAudit.mockImplementation(() => {
          return Promise.resolve()
        })

        const methods: { [name: string]: jest.SpyInstance } = {}

        for (const action of actions) {
          methods[action] = jest.spyOn(client, action)

          // We are not interested in the behaviors of audit or confirmWithdrawal
          // here. They are to be tested in separate integration tests
          methods[action].mockImplementation(() => {})
        }

        await fixtures.skipToNextQuarterAndTriggerEvents()

        expect((await mediator.getCurrentRound()).toNumber()).toEqual(round)
        expect((await mediator.getCurrentQuarter()).toNumber()).toEqual(quarter)

        if (actions.includes('audit')) {
          expect(methods['audit']).toHaveBeenCalled()
        }

        if (actions.includes('confirmWithdrawal')) {
          expect(methods['confirmWithdrawal']).toHaveBeenCalled()
        }

        if (actions.includes('fetchFills')) {
          expect(methods['fetchFills']).toHaveBeenCalled()
        }
      }
    )
  })
})
