// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/
import 'jest'

import { ROUNDSIZE, EthereumBlockchain } from '../../libs/EthereumBlockchain'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'

describe('How the Mediator contract computes / handles quarters.', () => {
  let contractUsedByOperator: MediatorAsync
  let blockchain: EthereumBlockchain
  blockchain = new EthereumBlockchain()
  let quarterSize: number

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()
    contractUsedByOperator = blockchain.getMediatorContract(blockchain.operator)
    quarterSize = ROUNDSIZE / 4
  })

  it('raises an error when the size of a round is not a multiple of 4', async () => {
    const otherBlockchain = new EthereumBlockchain()
    await otherBlockchain.start()
    const NOT_MULTIPLE_OF_FOUR = 10
    await expect(blockchain.deploy(NOT_MULTIPLE_OF_FOUR)).rejects.toThrow()
  })

  it('returns the correct number of quarter', async () => {
    const quarterAtBeginning = await contractUsedByOperator.getCurrentQuarter()
    expect(quarterAtBeginning).toBe(0)

    await blockchain.skipToNextRound()
    await blockchain.skipToNextRound()
    await blockchain.skipToNextRound()

    const expectedQuarter = 3
    await blockchain.skipBlocks(quarterSize * expectedQuarter + 3)

    let currentQuarter = await contractUsedByOperator.getCurrentQuarter()
    expect(currentQuarter).toEqual(expectedQuarter)

    await blockchain.skipToNextQuarter()
    currentQuarter = await contractUsedByOperator.getCurrentQuarter()
    expect(currentQuarter).toEqual(0) // 0 = 4 mod 4

    await blockchain.skipToNextQuarter()
    currentQuarter = await contractUsedByOperator.getCurrentQuarter()
    expect(currentQuarter).toEqual(1)
  })

  it('freezes time correctly after the Mediator enters in HALTED mode.', async () => {
    await blockchain.skipToNextRound()
    await blockchain.halt()
    let currentRound = await contractUsedByOperator.getCurrentRound()
    await contractUsedByOperator.isHalted()
    let lastActiveRound = await contractUsedByOperator.lastActiveRound()
    expect(currentRound).toEqual(lastActiveRound)

    //Check that the last active round remains constant once the Mediator enters in HALTED mode
    await blockchain.skipToNextRound()
    await blockchain.skipToNextRound()
    currentRound = await contractUsedByOperator.getCurrentRound()
    expect(currentRound).toEqual(lastActiveRound)
  })
})
