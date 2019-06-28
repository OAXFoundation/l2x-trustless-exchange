// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import 'jest'

import { D, etherToD } from '../../../src/common/BigNumberUtils'
import { BigNumber } from 'bignumber.js'
import { Address } from '../../../src/common/types/BasicTypes'

import {
  ALICE_INDEX,
  BlockchainClient,
  EthereumBlockchain,
  OperatorBlockchain,
  setBalancesAndCommit
} from '../../libs/EthereumBlockchain'

import { Proof } from '../../../src/common/types/SmartContractTypes'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'

describe('what happens when a client tries to confirm a withdrawal', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let aliceAddress: Address
  let operator: OperatorBlockchain
  let bob: BlockchainClient
  let bobAddress: Address

  let aliceDeposit: BigNumber
  let contractUsedByAlice: MediatorAsync
  let contractUsedByOperator: MediatorAsync
  let contractUsedByBob: MediatorAsync

  let proof: Proof

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    alice = new BlockchainClient(blockchain.alice, blockchain)
    operator = new OperatorBlockchain(blockchain)
    bob = new BlockchainClient(blockchain.bob, blockchain)

    aliceDeposit = etherToD('3')
    await alice.depositWETHTokensIntoMediator(aliceDeposit)

    aliceAddress = await alice.getAddress()
    bobAddress = await bob.getAddress()

    await blockchain.skipToNextRound()

    ////////////////// Round 1 begins //////////////////////////////////////////

    contractUsedByOperator = blockchain.getMediatorContract(blockchain.operator)

    let currentRound = await contractUsedByOperator.getCurrentRound()

    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit, D('0')],
      [D('0'), D('0')],
      blockchain,
      operator
    )

    proof = operator.computeProof(
      ALICE_INDEX,
      blockchain.WETHContract.address,
      currentRound
    )

    contractUsedByAlice = blockchain.getMediatorContract(alice.signer)
    contractUsedByBob = blockchain.getMediatorContract(bob.signer)

    await blockchain.skipToNextRound()
    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit, D('0')],
      [D('0'), D('0')],
      blockchain,
      operator
    )
  })

  it('A correct withdrawal confirmation yields the contract to send the money back to Alice.', async () => {
    const withdrawalAmount = etherToD('1')

    const roundOfWithdrawalRequest = await contractUsedByOperator.getCurrentRound()
    const aliceBalanceBeforeWithdrawal = await alice.getBalanceWETHToken()

    await contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)

    await blockchain.skipToNextRound()

    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit.minus(withdrawalAmount), D('0')],
      [D('0'), D('0')],
      blockchain,
      operator
    )

    await blockchain.skipToNextRound()
    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit, D('0')],
      [D('0'), D('0')],
      blockchain,
      operator
    )

    await blockchain.skipToNextQuarter()

    await contractUsedByAlice.confirmWithdrawal(blockchain.WETHContract.address)

    //Check Alice received the money
    const aliceBalanceAfterWithdrawal = await alice.getBalanceWETHToken()
    const delta = aliceBalanceAfterWithdrawal.minus(
      aliceBalanceBeforeWithdrawal
    )

    expect(delta).toEqual(withdrawalAmount)

    //Requested withdrawal amount remains the same
    const requestedWithdrawalAmount = await contractUsedByOperator.requestedWithdrawalAmount(
      roundOfWithdrawalRequest,
      blockchain.WETHContract.address,
      aliceAddress
    )
    expect(requestedWithdrawalAmount).toEqual(withdrawalAmount)

    const activeWithdrawalRound = await contractUsedByOperator.getActiveWithdrawalRound(
      blockchain.WETHContract.address,
      aliceAddress
    )
    expect(activeWithdrawalRound).toEqual(0)

    const totalWithdrawals = await contractUsedByOperator.totalRequestedWithdrawals(
      roundOfWithdrawalRequest,
      blockchain.WETHContract.address
    )

    expect(totalWithdrawals).toEqual(withdrawalAmount)

    const withdrawnAmountAliceDuringRound = await contractUsedByOperator.requestedWithdrawalAmount(
      roundOfWithdrawalRequest,
      blockchain.WETHContract.address,
      aliceAddress
    )
    expect(withdrawnAmountAliceDuringRound).toEqual(withdrawalAmount)
  })

  it('If no withdrawal is pending then an error is raised', async () => {
    await blockchain.skipToNextRound()
    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit, D('0')],
      [D('0'), D('0')],
      blockchain,
      operator
    )

    await blockchain.skipToNextRound()
    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit, D('0')],
      [D('0'), D('0')],
      blockchain,
      operator
    )

    await expect(
      contractUsedByAlice.confirmWithdrawal(blockchain.WETHContract.address)
    ).rejects.toThrow()
  })

  it('If Alice tries to confirm the withdrawal too early then an error is raised.', async () => {
    const aliceOpeningBalance = aliceDeposit
    const withdrawalAmount = aliceOpeningBalance

    await contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)

    await expect(
      contractUsedByOperator.confirmWithdrawal(blockchain.WETHContract.address)
    ).rejects.toThrow()
  })

  it("If Bob  tries to confirm Alice's withdrawal then an error is raised.", async () => {
    const aliceOpeningBalance = aliceDeposit
    const withdrawalAmount = aliceOpeningBalance

    await contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)

    await blockchain.skipToNextRound()

    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit.minus(withdrawalAmount), D('0')],
      [D('0'), D('0')],
      blockchain,
      operator
    )
    await blockchain.skipToNextRound()
    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit, D('0')],
      [D('0'), D('0')],
      blockchain,
      operator
    )

    await blockchain.skipToNextQuarter()

    await expect(
      contractUsedByBob.confirmWithdrawal(blockchain.WETHContract.address)
    ).rejects.toThrow()
  })
})
