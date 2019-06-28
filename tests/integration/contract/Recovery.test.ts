// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import 'jest'

import { EthereumBlockchain } from '../../libs/EthereumBlockchain'
import { IRootInfo } from '../../../src/common/types/OperatorAndClientTypes'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'
import { D } from '../../../src/common/BigNumberUtils'

describe('How the Mediator smart contract handles the ISHALTED state', () => {
  let contractUsedByOperator: MediatorAsync
  let blockchain: EthereumBlockchain
  blockchain = new EthereumBlockchain()
  let root: IRootInfo

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()
    contractUsedByOperator = blockchain.getMediatorContract(blockchain.operator)
    root = {
      content:
        '0xff4801ad46e24917a0eb3069b3fb7f7593e1cb2432bc812d290d6c69b07f5e72',
      height: D('2'),
      width: D('4')
    }
  })

  it('switches to HALTED state if no root has been committed after quarter 1', async () => {
    await blockchain.skipToNextRound()

    // First commit is OK
    await contractUsedByOperator.commit(root, blockchain.WETHContract.address)

    let isHalted = await contractUsedByOperator.updateHaltedState()

    expect(isHalted).toBeFalsy()

    //We skip to the next round, then to quarter 2, and to root is committed
    await blockchain.skipToNextRound()
    await blockchain.skipToNextQuarter()

    isHalted = await contractUsedByOperator.updateHaltedState()
    expect(isHalted).toBeTruthy()
  })

  it('switches to HALTED state if some disputes (from previous round) are still open after quarter 1', async () => {
    await blockchain.skipToNextRound()

    // Need to commit the root for both tokens
    await contractUsedByOperator.commit(root, blockchain.WETHContract.address)
    await contractUsedByOperator.commit(root, blockchain.OAXContract.address)

    const currentRound = await contractUsedByOperator.getCurrentRound()

    await blockchain.skipToNextQuarter()

    await contractUsedByOperator.setOpenDisputeCounter(currentRound - 1, 0)

    let isHalted = await contractUsedByOperator.updateHaltedState()
    expect(isHalted).toBeFalsy()

    await contractUsedByOperator.setOpenDisputeCounter(currentRound - 1, 2)

    isHalted = await contractUsedByOperator.updateHaltedState()
    expect(isHalted).toBeTruthy()
  })

  it('checks that the functions cannot be invoked when the contract IS in HALTED mode', async () => {
    await blockchain.skipToNextRound()

    // First commit is OK
    await contractUsedByOperator.commit(root, blockchain.WETHContract.address)

    let isHalted = await contractUsedByOperator.updateHaltedState()

    expect(isHalted).toBeFalsy()

    //We skip to the next round, then to quarter 2, and to root is committed
    await blockchain.skipToNextRound()
    await blockchain.skipToNextQuarter()

    isHalted = await contractUsedByOperator.updateHaltedState()
    expect(isHalted).toBeTruthy()
  })
})
