// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import 'jest'
import { D, etherToD } from '../../../src/common/BigNumberUtils'

import { providers } from 'ethers'
import { GETH_RPC_URL } from '../../../config/environment'

import * as SystemFixtures from '../../libs/SystemFixture'
import { Identity } from '../../../src/common/identity/Identity'
import { OAX_CONTRACT_NAME, WETH_CONTRACT_NAME } from '../../libs/SystemFixture'

describe('How the operator and client interact', () => {
  let provider: providers.JsonRpcProvider

  let fixtures: SystemFixtures.SystemFixture

  let client: Identity
  let amountOAX = D('100')

  const amountWETH = etherToD('10')
  const amountToTradeWETH = amountWETH.div(2)

  provider = new providers.JsonRpcProvider(GETH_RPC_URL)
  provider.pollingInterval = 10

  beforeEach(async () => {
    fixtures = await SystemFixtures.createSystemFixture({
      roundSize: 100,
      assets: [WETH_CONTRACT_NAME, OAX_CONTRACT_NAME],
      operator: {
        initialETH: etherToD('1000')
      },
      runServer: false,
      provider
    })

    client = await fixtures.getIdentityAsync({
      initialETH: amountWETH,
      initialTokens: {
        [WETH_CONTRACT_NAME]: amountToTradeWETH,
        [OAX_CONTRACT_NAME]: amountOAX
      },
      approveMediatorForTransfer: {
        [WETH_CONTRACT_NAME]: amountToTradeWETH,
        [OAX_CONTRACT_NAME]: amountOAX
      }
    })

    /////////////////////////////// Round 0 begins  //////////////////////////
    await fixtures.executeCommandAsync(new SystemFixtures.JoinCommand(client))
    await fixtures.executeCommandAsync(
      new SystemFixtures.SignerDepositCommand(
        client,
        OAX_CONTRACT_NAME,
        amountOAX
      )
    )
  })

  describe('The operator can commit for each new round', () => {
    it('checks the operator commits successfully for each new round', async () => {
      const EXPECTED_NUMBER_OF_COMMITS = 2

      await fixtures.skipToNextRoundAndTriggerEvents()

      /////////////////////////////// Round 1 begins  ////////////////////////////
      expect(
        await fixtures.checkNumberOfCommits(EXPECTED_NUMBER_OF_COMMITS)
      ).toBeTruthy()

      new SystemFixtures.SignerDepositCommand(
        client,
        WETH_CONTRACT_NAME,
        amountToTradeWETH
      )

      await fixtures.skipToNextRoundAndTriggerEvents()

      /////////////////////////////// Round 2 begins  ////////////////////////////
      expect(
        await fixtures.checkNumberOfCommits(EXPECTED_NUMBER_OF_COMMITS)
      ).toBeTruthy()

      await fixtures.skipToNextRoundAndTriggerEvents()

      /////////////////////////////// Round 3 begins  ////////////////////////////
      expect(
        await fixtures.checkNumberOfCommits(EXPECTED_NUMBER_OF_COMMITS)
      ).toBeTruthy()

      await fixtures.skipToNextRoundAndTriggerEvents()

      /////////////////////////////// Round 4 begins  ////////////////////////////
      expect(
        await fixtures.checkNumberOfCommits(EXPECTED_NUMBER_OF_COMMITS)
      ).toBeTruthy()
    })
  })
})
