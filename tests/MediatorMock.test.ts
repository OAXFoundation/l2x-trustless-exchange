// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import 'jest'
import { EthereumBlockchain } from './libs/EthereumBlockchain'
import { MediatorAsync } from '../src/common/mediator/Contracts'

describe('MediatorMock', () => {
  let blockchain: EthereumBlockchain

  let mediator: MediatorAsync

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()
    mediator = blockchain.getMediatorContract(blockchain.operator)
  })

  it('freezes time when forced to halt', async () => {
    await blockchain.skipToNextRound()
    await blockchain.skipToNextQuarter()
    await blockchain.skipToNextQuarter()
    await mediator.halt()

    expect(await mediator.isHalted()).toBe(true)
    expect(await mediator.getCurrentRound()).toEqual(1)
    expect(await mediator.lastActiveRound()).toEqual(1)
    expect(await mediator.lastActiveQuarter()).toEqual(2)
  })
})
