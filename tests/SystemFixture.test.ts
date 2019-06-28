// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { JsonRpcProvider } from 'ethers/providers'
import { GETH_RPC_URL } from '../config/environment'
import * as SystemFixtures from './libs/SystemFixture'
import { etherToD } from '../src/common/BigNumberUtils'

describe('System Fixture Generator unit tests', () => {
  const provider = new JsonRpcProvider(GETH_RPC_URL)

  let fixtures: SystemFixtures.SystemFixture

  const assetWETH = 'ETHToken'
  const assetOAX = 'OAXToken'

  beforeEach(async () => {
    fixtures = await SystemFixtures.createSystemFixture({
      roundSize: 60,
      assets: [assetWETH, assetOAX],
      operator: {
        initialETH: etherToD('1000')
      },
      runServer: false,
      mockMediator: false,
      provider
    })
  })

  it('Skipping to the next quarter with noop transaction works', async () => {
    const operatorId = fixtures.getOperator().identity
    const mediator = fixtures.getMediator(operatorId)

    expect((await mediator.functions.getCurrentRound()).toNumber()).toEqual(0)
    expect((await mediator.functions.getCurrentQuarter()).toNumber()).toEqual(0)

    await fixtures.skipToNextQuarterNoMock()

    expect((await mediator.functions.getCurrentRound()).toNumber()).toEqual(0)
    expect((await mediator.functions.getCurrentQuarter()).toNumber()).toEqual(1)

    await fixtures.skipToNextQuarterNoMock()

    expect((await mediator.functions.getCurrentRound()).toNumber()).toEqual(0)
    expect((await mediator.functions.getCurrentQuarter()).toNumber()).toEqual(2)

    await fixtures.skipToNextQuarterNoMock()

    expect((await mediator.functions.getCurrentRound()).toNumber()).toEqual(0)
    expect((await mediator.functions.getCurrentQuarter()).toNumber()).toEqual(3)

    await fixtures.skipToNextQuarterNoMock()

    expect((await mediator.functions.getCurrentRound()).toNumber()).toEqual(1)
    expect((await mediator.functions.getCurrentQuarter()).toNumber()).toEqual(0)
  })
})
