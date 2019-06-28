// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import 'jest'

import {
  BlockchainClient,
  EthereumBlockchain,
  INITIAL_AMOUNT_OAX_TOKENS
} from '../../libs/EthereumBlockchain'
import { Address } from '../../../src/common/types/BasicTypes'
import {
  TokenAsync,
  MediatorAsync
} from '../../../src/common/mediator/Contracts'
import { etherToD, toEthersBn } from '../../../src/common/BigNumberUtils'
import {
  ethersBNToBigNumber,
  waitForMining
} from '../../../src/common/ContractUtils'

describe('Mediator', () => {
  let blockchain: EthereumBlockchain
  let bob: BlockchainClient
  let alice: BlockchainClient
  blockchain = new EthereumBlockchain()
  let bobAddress: Address
  let aliceAddress: Address
  let OAXTokenContractUsedByAlice: TokenAsync
  let OAXTokenContractUsedByBob: TokenAsync
  let OAXTokenContractUsedByOperator: TokenAsync
  let contractUsedByAlice: MediatorAsync
  let contractUsedByBob: MediatorAsync

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    bob = new BlockchainClient(blockchain.bob, blockchain)
    alice = new BlockchainClient(blockchain.alice, blockchain)

    bobAddress = await bob.getAddress()
    aliceAddress = await alice.getAddress()

    OAXTokenContractUsedByAlice = blockchain.getOAXTokenContract(alice.signer)
    OAXTokenContractUsedByBob = blockchain.getOAXTokenContract(bob.signer)
    OAXTokenContractUsedByOperator = blockchain.getOAXTokenContract(
      blockchain.operator
    )

    contractUsedByAlice = blockchain.getMediatorContract(alice.signer)
    contractUsedByBob = blockchain.getMediatorContract(bob.signer)
  })

  it('checks the deposits in tokens of Alice and Bob', async () => {
    const aliceOAXBalance = await OAXTokenContractUsedByAlice.balanceOf(
      aliceAddress
    )
    const bobOAXBalance = await OAXTokenContractUsedByBob.balanceOf(bobAddress)
    expect(aliceOAXBalance).toEqual(INITIAL_AMOUNT_OAX_TOKENS)
    expect(bobOAXBalance).toEqual(INITIAL_AMOUNT_OAX_TOKENS)
  })

  it('checks that Alice and Bob can deposit some OAX token into the Mediator contract', async () => {
    const OAX_DEPOSIT_AMOUNT = INITIAL_AMOUNT_OAX_TOKENS.div(2)

    await OAXTokenContractUsedByAlice.approve(
      blockchain.contract.address,
      OAX_DEPOSIT_AMOUNT
    )
    await contractUsedByAlice.depositsToken(
      blockchain.OAXContract.address,
      OAX_DEPOSIT_AMOUNT
    )

    await OAXTokenContractUsedByBob.approve(
      blockchain.contract.address,
      INITIAL_AMOUNT_OAX_TOKENS
    )

    await contractUsedByBob.depositsToken(
      blockchain.OAXContract.address,
      INITIAL_AMOUNT_OAX_TOKENS
    )

    const OAXBalanceMediator = await OAXTokenContractUsedByOperator.balanceOf(
      blockchain.contract.address
    )

    const EXPECTED = OAX_DEPOSIT_AMOUNT.plus(INITIAL_AMOUNT_OAX_TOKENS)

    expect(OAXBalanceMediator).toEqual(EXPECTED)
  })

  it('checks that ETH tokens can be deposited into the contract', async () => {
    const ETHTokenContractUsedByAlice = blockchain.getWETHTokenContract(
      alice.signer
    )
    const ETHTOKENDEPOSIT = etherToD('0.5')
    await alice.depositWETHTokensIntoMediator(ETHTOKENDEPOSIT)

    const ETHTokenBalanceMediator = await ETHTokenContractUsedByAlice.balanceOf(
      blockchain.contract.address
    )
    expect(ETHTokenBalanceMediator).toEqual(ETHTOKENDEPOSIT)
  })

  it('checks that only registered tokens can be deposited.', async () => {
    const contractUsedByOperator = blockchain.getMediatorContract(
      blockchain.operator
    )
    const WETHTokenAddress = blockchain.WETHContract.address

    await contractUsedByOperator.unregisterToken(WETHTokenAddress)

    const ETHTOKENDEPOSIT = etherToD('0.5')

    await expect(
      alice.depositWETHTokensIntoMediator(ETHTOKENDEPOSIT)
    ).rejects.toThrow()
  })

  it('Updates the total deposited for all clients during the current round', async () => {
    const aliceDeposit = INITIAL_AMOUNT_OAX_TOKENS.div(2)
    const bobDeposit = INITIAL_AMOUNT_OAX_TOKENS.div(4)

    const totalDeposit = aliceDeposit.times('2').plus(bobDeposit)

    await OAXTokenContractUsedByAlice.approve(
      blockchain.contract.address,
      aliceDeposit.times(2)
    )

    await OAXTokenContractUsedByBob.approve(
      blockchain.contract.address,
      bobDeposit
    )

    await contractUsedByAlice.depositsToken(
      blockchain.OAXContract.address,
      aliceDeposit
    )

    await contractUsedByAlice.depositsToken(
      blockchain.OAXContract.address,
      aliceDeposit
    )

    await contractUsedByBob.depositsToken(
      blockchain.OAXContract.address,
      bobDeposit
    )

    let result = ethersBNToBigNumber(
      await contractUsedByAlice.getCurrentRound()
    )
    const currentRound = result

    result = ethersBNToBigNumber(
      await contractUsedByAlice.totalDeposits(
        currentRound,
        blockchain.OAXContract.address
      )
    )
    const totalDepositAll = result
    expect(totalDepositAll).toEqual(totalDeposit)
  })

  it('checks that it is not possible to receive a deposit when the contract is halted.', async () => {
    await blockchain.skipToNextRound()
    await blockchain.skipToNextQuarter()

    await OAXTokenContractUsedByAlice.approve(
      contractUsedByAlice.contractAddress,
      INITIAL_AMOUNT_OAX_TOKENS
    )

    await expect(
      contractUsedByAlice.depositsToken(
        blockchain.OAXContract.address,
        INITIAL_AMOUNT_OAX_TOKENS
      )
    ).rejects.toThrow()
  })

  it('checks that it is not possible to send ethers directly to the contract', async () => {
    await expect(
      waitForMining(
        alice.signer.sendTransaction({
          to: blockchain.contract.address,
          value: toEthersBn(etherToD('0.5'))
        })
      )
    ).rejects.toThrow()
  })
})
