// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import 'jest'

import { Signer } from 'ethers'

import { EthereumBlockchain, ROUNDSIZE } from '../../libs/EthereumBlockchain'
import { MediatorMock } from '../../../src/contracts/wrappers/MediatorMock'

describe('When the Mediator contract is created several parameters are defined.', () => {
  let contract: MediatorMock
  let blockchain: EthereumBlockchain
  let operator: Signer
  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()
    contract = blockchain.contract
    operator = blockchain.operator
  })

  it('Check that the address of the operator is correctly stored', async () => {
    const result = await contract.functions.operatorAddress()
    expect(result).toBe(await operator.getAddress())
  })

  it('It checks the creation block number used to compute rounds', async () => {
    const resultHex = await contract.functions.blockNumberAtCreation()
    const expectedBlockNumber = 0
    const resultInt = parseInt(resultHex.toHexString())
    expect(resultInt).toBe(expectedBlockNumber)
  })

  it('Computes the current round based on the block number', async () => {
    const result = await contract.functions.getCurrentRound()
    const roundAtCreationHex = await contract.functions.blockNumberAtCreation()
    const roundAtCreation = parseInt(roundAtCreationHex.toHexString())

    const blockNumber = (await contract.functions.getCurrentBlockNumber())
      .toTwos(2)
      .toNumber()
    const expectedRoundNumber = Math.floor(
      (blockNumber - roundAtCreation) / ROUNDSIZE
    )

    expect(result.toNumber()).toEqual(expectedRoundNumber)
  })

  it('checks at the moment of creation the contract is not halted.', async () => {
    await contract.functions.updateHaltedState()
    const result = await contract.functions.halted()
    expect(result).toBeFalsy()
  })

  it('checks the registered tokens.', async () => {
    const OAXContractAddress = blockchain.OAXContract.address
    const WETHContractAddress = blockchain.WETHContract.address
    expect(
      await contract.functions.registeredTokens(OAXContractAddress)
    ).toBeTruthy()
    expect(
      await contract.functions.registeredTokens(WETHContractAddress)
    ).toBeTruthy()

    const randomAddress = '0xc2056642BBfF3927EEfD6bEb5F3bffFC9e765397'
    expect(await contract.functions.registeredTokens(randomAddress)).toBeFalsy()
  })
})
