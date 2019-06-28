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
  BOB_INDEX,
  EthereumBlockchain,
  OperatorBlockchain,
  setBalancesAndCommit
} from '../../libs/EthereumBlockchain'
import { Proof } from '../../../src/common/types/SmartContractTypes'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'

describe('what happens when a client initiates a withdrawal', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let operator: OperatorBlockchain

  let aliceAddress: Address
  let aliceDeposit: BigNumber

  let bob: BlockchainClient
  let bobAddress: Address
  let bobDeposit: BigNumber

  let contractUsedByAlice: MediatorAsync
  let contractUsedByOperator: MediatorAsync

  let proof: Proof

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    /////////////////////////////// Round 0 begins  //////////////////////////////

    alice = new BlockchainClient(blockchain.alice, blockchain)
    operator = new OperatorBlockchain(blockchain)
    bob = new BlockchainClient(blockchain.bob, blockchain)

    aliceDeposit = etherToD('3')
    bobDeposit = etherToD('3')

    aliceAddress = await alice.getAddress()
    bobAddress = await bob.getAddress()

    await alice.depositWETHTokensIntoMediator(aliceDeposit)
    await bob.depositWETHTokensIntoMediator(bobDeposit)

    await blockchain.skipToNextRound()

    /////////////////////////////// Round 1 begins  //////////////////////////////
    //The operator commits to the new roots
    contractUsedByOperator = blockchain.getMediatorContract(blockchain.operator)

    let currentRound = await contractUsedByOperator.getCurrentRound()

    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit, D('0')],
      [bobDeposit, D('0')],
      blockchain,
      operator
    )

    proof = operator.computeProof(
      ALICE_INDEX,
      blockchain.WETHContract.address,
      currentRound
    )

    contractUsedByAlice = blockchain.getMediatorContract(alice.signer)

    aliceAddress = await alice.getAddress()
  })

  it('shows a correct withdrawal request is accepted and stored in the Mediator smart contract.', async () => {
    await blockchain.skipToNextRound()

    const aliceOpeningBalance = aliceDeposit
    const withdrawalAmount = aliceOpeningBalance

    await contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)

    const currentRound = await contractUsedByOperator.getCurrentRound()

    const requestedWithdrawalAmountAlice = await contractUsedByOperator.requestedWithdrawalAmount(
      currentRound,
      blockchain.WETHContract.address,
      aliceAddress
    )
    expect(requestedWithdrawalAmountAlice).toEqual(withdrawalAmount)

    const totalRequestedWithdrawal = await contractUsedByOperator.totalRequestedWithdrawals(
      currentRound,
      blockchain.WETHContract.address
    )
    expect(totalRequestedWithdrawal).toEqual(withdrawalAmount)
  })

  it('is not possible to initiate a withdrawal with a 0 amount.', async () => {
    await blockchain.skipToNextRound()

    const withdrawalAmount = D('0')

    await expect(
      contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)
    ).rejects.toThrow()
  })

  it('is not possible to initiate a withdrawal request during round 0', async () => {
    await blockchain.skipToNextRound()

    const aliceOpeningBalance = aliceDeposit
    const withdrawalAmount = aliceOpeningBalance

    await blockchain.goToRound0()

    const currentRound = await contractUsedByOperator.getCurrentRound()
    expect(currentRound).toEqual(0)

    await expect(
      contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)
    ).rejects.toThrow()
  })

  it('shows a withdrawal request with an excessive amount is rejected.', async () => {
    const excessiveWithdrawalAmount = aliceDeposit.times('2')
    await expect(
      contractUsedByAlice.initiateWithdrawal(proof, excessiveWithdrawalAmount)
    ).rejects.toThrow()
  })

  it('shows a withdrawal request with a wrong proof is rejected.', async () => {
    const currentRound = await contractUsedByOperator.getCurrentRound()

    const aliceOpeningBalance = aliceDeposit
    const withdrawalAmount = aliceOpeningBalance
    const wrongHashesProof = [
      '0x29273633f642bbc775c0d85e33e560905e32fcce967d477a0ae5f76258da6e06',
      '0x0069c4e89d9c086ac88de205a556eae6dc34c830267b69e8508cc7b457476674'
    ]

    const proofWithWrongHashes = new Proof(
      proof.clientOpeningBalance,
      proof.clientAddress,
      wrongHashesProof,
      proof.sums,
      blockchain.WETHContract.address,
      D('2'),
      D('4'),
      currentRound
    )

    await expect(
      contractUsedByAlice.initiateWithdrawal(
        proofWithWrongHashes,
        withdrawalAmount
      )
    ).rejects.toThrow()
  })

  it('shows only a single withdrawal request can be done at once.', async () => {
    await blockchain.skipToNextRound()

    const aliceOpeningBalance = aliceDeposit
    const withdrawalAmount = aliceOpeningBalance.div(3)

    //First time is OK
    await contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)

    //Second time the Mediator raises an exception
    await expect(
      contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)
    ).rejects.toThrow()
  })

  it('shows only Alice can initiate a withdrawal for her money.', async () => {
    const currentRound = await contractUsedByOperator.getCurrentRound()

    const bobOpeningBalance = bobDeposit
    const withdrawalAmount = bobOpeningBalance

    const bobProof = operator.computeProof(
      BOB_INDEX,
      blockchain.WETHContract.address,
      currentRound
    )

    await expect(
      contractUsedByAlice.initiateWithdrawal(bobProof, withdrawalAmount)
    ).rejects.toThrow()
  })

  it('checks that it is not possible to initiate a withdrawal when the contract is halted.', async () => {
    const aliceOpeningBalance = aliceDeposit
    const withdrawalAmount = aliceOpeningBalance

    await blockchain.halt()

    await expect(
      contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)
    ).rejects.toThrow()
  })
})
