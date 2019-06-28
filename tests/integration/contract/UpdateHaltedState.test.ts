// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/
import 'jest'

import { waitForMining } from '../../../src/common/ContractUtils'
import { EthereumBlockchain } from '../../libs/EthereumBlockchain'
import { MediatorMock } from '../../../src/contracts/wrappers/MediatorMock'

describe('what happens when mediator.updateHaltedState() is invoked', () => {
  let contract: MediatorMock
  let blockchain: EthereumBlockchain
  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()
    contract = blockchain.contract
  })

  it('checks that if no token is registered then the contract enters in HALTED mode', async () => {
    await blockchain.skipToNextRound()
    await waitForMining(contract.functions.setCommitsCounter(1, 1))
    await waitForMining(contract.functions.setRegisteredNumTokens(0))
    await blockchain.skipToNextQuarter()
    await waitForMining(contract.functions.updateHaltedState())
    const result = await contract.functions.halted()
    expect(result).toBeTruthy()
  })

  it('checks that if not all the tokens have been committed then the contract enters in HALTED mode', async () => {
    await blockchain.skipToNextRound()
    // There should be two commits not one
    await waitForMining(contract.functions.setCommitsCounter(1, 1))
    await blockchain.skipToNextQuarter()
    await waitForMining(contract.functions.updateHaltedState())
    const result = await contract.functions.halted()
    expect(result).toBeTruthy()
  })

  it('checks that if some dispute during the last round is open then the contract enters in HALTED mode', async () => {
    await blockchain.skipToNextRound()
    //There is a correct number of commits
    await waitForMining(contract.functions.setCommitsCounter(1, 2))
    //Still one dispute remains open during the previous round
    await waitForMining(contract.functions.setOpenDisputeCounter(0, 1))
    await blockchain.skipToNextQuarter()
    await waitForMining(contract.functions.updateHaltedState())
    const result = await contract.functions.halted()
    expect(result).toBeTruthy()
  })

  it('checks that if the operator commits correctly and no dispute is open then the contract does not enter in HALTED mode.', async () => {
    await blockchain.skipToNextRound()
    //There is a correct number of commits
    await waitForMining(contract.functions.setCommitsCounter(1, 2))
    await waitForMining(contract.functions.setCommittedRounds(1))
    //Still one dispute remains open during the previous round
    await waitForMining(contract.functions.setOpenDisputeCounter(0, 0))
    await blockchain.skipToNextQuarter()
    await waitForMining(contract.functions.updateHaltedState())
    const result = await contract.functions.halted()
    expect(result).toBeFalsy()
  })
})
