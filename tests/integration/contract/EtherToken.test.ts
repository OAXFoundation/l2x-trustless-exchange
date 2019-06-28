// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import 'jest'

import {
  BlockchainClient,
  EthereumBlockchain
} from '../../libs/EthereumBlockchain'
import { Address } from '../../../src/common/types/BasicTypes'
import { D, etherToD } from '../../../src/common/BigNumberUtils'
import { BigNumber } from 'bignumber.js'
import { TokenAsync } from '../../../src/common/mediator/Contracts'

describe('Mediator', () => {
  let blockchain: EthereumBlockchain
  let bob: BlockchainClient
  let alice: BlockchainClient
  blockchain = new EthereumBlockchain()
  let bobAddress: Address
  let aliceAddress: Address
  let ETHTokenContractUsedByAlice: TokenAsync
  let ETHTokenContractUsedByBob: TokenAsync
  let ETHTOKENDEPOSIT: BigNumber
  let gasPrice: BigNumber

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    bob = new BlockchainClient(blockchain.bob, blockchain)
    alice = new BlockchainClient(blockchain.alice, blockchain)

    bobAddress = await bob.getAddress()
    aliceAddress = await alice.getAddress()

    ETHTokenContractUsedByAlice = blockchain.getWETHTokenContract(alice.signer)
    ETHTokenContractUsedByBob = blockchain.getWETHTokenContract(bob.signer)
    ETHTOKENDEPOSIT = etherToD('0.5')

    gasPrice = D((await blockchain.provider.getGasPrice()).toString())

    await alice.depositWETHTokens(ETHTOKENDEPOSIT)
    await bob.depositWETHTokens(ETHTOKENDEPOSIT)
    await bob.depositWETHTokens(ETHTOKENDEPOSIT)
  })

  it('checks the deposits in tokens of Alice and Bob', async () => {
    const aliceETHBalance = await ETHTokenContractUsedByAlice.balanceOf(
      aliceAddress
    )
    const bobETHBalance = await ETHTokenContractUsedByAlice.balanceOf(
      bobAddress
    )
    expect(aliceETHBalance).toEqual(ETHTOKENDEPOSIT)
    expect(bobETHBalance).toEqual(ETHTOKENDEPOSIT.times(2))
  })

  it('checks that Alice and Bob can do a withdraw and get their ethers back.', async () => {
    const aliceETHBalanceBefore = await alice.getBalance()
    let gasUsed: number = await ETHTokenContractUsedByAlice.withdraw()

    let ethSpentInGas = gasPrice.multipliedBy(D(gasUsed.toString(10)))

    const aliceETHBalanceAfter = await alice.getBalance()
    let delta = aliceETHBalanceAfter
      .minus(aliceETHBalanceBefore)
      .plus(ethSpentInGas)

    expect(delta).toEqual(ETHTOKENDEPOSIT)

    const bobETHBalanceBefore = await bob.getBalance()
    gasUsed = await ETHTokenContractUsedByBob.withdraw()

    ethSpentInGas = gasPrice.multipliedBy(D(gasUsed.toString(10)))
    const bobETHBalanceAfter = await bob.getBalance()

    delta = bobETHBalanceAfter.minus(bobETHBalanceBefore).plus(ethSpentInGas)

    expect(delta).toEqual(ETHTOKENDEPOSIT.times(2))
  })
})
