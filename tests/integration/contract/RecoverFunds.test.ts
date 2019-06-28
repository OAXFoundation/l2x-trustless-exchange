// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import 'jest'
import { D, etherToD, sum } from '../../../src/common/BigNumberUtils'
import { Address, Amount } from '../../../src/common/types/BasicTypes'

import {
  ALICE_INDEX,
  BlockchainClient,
  EthereumBlockchain,
  OperatorBlockchain,
  setBalancesAndCommit
} from '../../libs/EthereumBlockchain'
import { Proof } from '../../../src/common/types/SmartContractTypes'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'

describe('what happens when a client tries recover its funds', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let aliceAddress: Address
  let operator: OperatorBlockchain
  let bob: BlockchainClient
  let bobAddress: Address

  let contractUsedByOperator: MediatorAsync

  let aliceDeposit1: Amount
  let aliceDeposit2: Amount
  let aliceDeposit3: Amount
  let aliceDeposit4: Amount
  let aliceDeposit5: Amount
  let aliceDeposit6: Amount

  let aliceWithdrawal1: Amount
  let aliceWithdrawal2: Amount

  let contractUsedByAlice: MediatorAsync
  let contractUsedByBob: MediatorAsync

  let bobDeposit1: Amount
  let bobDeposit2: Amount
  let bobDeposit3: Amount

  let proofAliceRound1: Proof
  let proofAliceRound3: Proof
  let proofAliceRound5: Proof

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  describe('a short interaction', () => {
    beforeEach(async () => {
      await blockchain.deploy()
      contractUsedByOperator = blockchain.getMediatorContract(
        blockchain.operator
      )

      /////////////////////////////// Round 0 begins  //////////////////////////////

      alice = new BlockchainClient(blockchain.alice, blockchain)
      aliceAddress = await alice.getAddress()

      operator = new OperatorBlockchain(blockchain)
      bob = new BlockchainClient(blockchain.bob, blockchain)
      bobAddress = await bob.getAddress()

      aliceDeposit1 = etherToD('3')
      await alice.depositWETHTokensIntoMediator(aliceDeposit1)

      contractUsedByAlice = blockchain.getMediatorContract(alice.signer)
      contractUsedByBob = blockchain.getMediatorContract(bob.signer)

      await blockchain.skipToNextRound()
    })

    it('checks that Alice can recover her funds during round 1', async () => {
      /////////////////////////////// Round 1 begins  //////////////////////////////

      // Skipping to next quarter without any root being committed => halted
      await blockchain.skipToNextQuarter()

      // Alice can recover her initial deposit
      const aliceBalanceBeforeRefund = await alice.getBalanceWETHToken()
      await contractUsedByAlice.recoverOnChainFundsOnly(
        blockchain.WETHContract.address
      )
      const aliceBalanceAfterRefund = await alice.getBalanceWETHToken()

      const delta = aliceBalanceAfterRefund.minus(aliceBalanceBeforeRefund)

      expect(delta).toEqual(aliceDeposit1)
    })

    it('checks that Alice can recover her funds during round 2', async () => {
      /////////////////////////////// Round 1 begins  //////////////////////////////
      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [aliceDeposit1, D('0')],
        [D('0'), D('0')],
        blockchain,
        operator
      )

      const aliceDeposit2 = etherToD('0.5')
      await alice.depositWETHTokensIntoMediator(aliceDeposit2)

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 2 begins  //////////////////////////////

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [aliceDeposit1.plus(aliceDeposit2), D('0')],
        [D('0'), D('0')],
        blockchain,
        operator
      )

      const aliceDeposit3 = etherToD('1.5')
      await alice.depositWETHTokensIntoMediator(aliceDeposit3)

      await blockchain.skipToNextQuarter()

      await blockchain.halt()

      // Alice can recover her initial deposit
      const aliceBalanceBeforeRefund = await alice.getBalanceWETHToken()
      await contractUsedByAlice.recoverOnChainFundsOnly(
        blockchain.WETHContract.address
      )
      const aliceBalanceAfterRefund = await alice.getBalanceWETHToken()

      const delta = aliceBalanceAfterRefund.minus(aliceBalanceBeforeRefund)

      expect(delta).toEqual(
        aliceDeposit1.plus(aliceDeposit2).plus(aliceDeposit3)
      )
    })
  })

  describe('a long interaction', () => {
    beforeEach(async () => {
      await blockchain.deploy()
      contractUsedByOperator = blockchain.getMediatorContract(
        blockchain.operator
      )

      /////////////////////////////// Round 0 begins  //////////////////////////////

      alice = new BlockchainClient(blockchain.alice, blockchain)
      aliceAddress = await alice.getAddress()

      operator = new OperatorBlockchain(blockchain)
      bob = new BlockchainClient(blockchain.bob, blockchain)
      bobAddress = await bob.getAddress()

      aliceDeposit1 = etherToD('3')
      await alice.depositWETHTokensIntoMediator(aliceDeposit1)

      contractUsedByAlice = blockchain.getMediatorContract(alice.signer)
      contractUsedByBob = blockchain.getMediatorContract(bob.signer)

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 1 begins  //////////////////////////////

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [aliceDeposit1, D('0')],
        [D('0'), D('0')],
        blockchain,
        operator
      )

      let currentRound = await contractUsedByOperator.getCurrentRound()

      proofAliceRound1 = operator.computeProof(
        ALICE_INDEX,
        blockchain.WETHContract.address,
        currentRound
      )

      aliceDeposit2 = etherToD('2')
      await alice.depositWETHTokensIntoMediator(aliceDeposit2)

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 2 begins  //////////////////////////////

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [aliceDeposit1.plus(aliceDeposit2), D('0')],
        [D('0'), D('0')],
        blockchain,
        operator
      )

      aliceWithdrawal1 = etherToD('1.5')
      await contractUsedByAlice.initiateWithdrawal(
        proofAliceRound1,
        aliceWithdrawal1
      )

      aliceDeposit3 = etherToD('4')
      await alice.depositWETHTokensIntoMediator(aliceDeposit3)

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 3 begins  //////////////////////////////

      // Operator commits new root an computes proof
      let totalBalanceAlice = aliceDeposit1
        .plus(aliceDeposit2)
        .plus(aliceDeposit3)
        .minus(aliceWithdrawal1)
      let totalBalanceBob = D('0')

      currentRound = await contractUsedByOperator.getCurrentRound()

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [totalBalanceAlice, D('0')],
        [totalBalanceBob, D('0')],
        blockchain,
        operator
      )

      proofAliceRound3 = operator.computeProof(
        ALICE_INDEX,
        blockchain.WETHContract.address,
        currentRound
      )

      aliceDeposit4 = etherToD('3')
      await alice.depositWETHTokensIntoMediator(aliceDeposit4)

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 4 begins  //////////////////////////////

      totalBalanceAlice = totalBalanceAlice.plus(aliceDeposit4)

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [totalBalanceAlice, D('0')],
        [totalBalanceBob, D('0')],
        blockchain,
        operator
      )

      await blockchain.skipToNextQuarter()

      await contractUsedByAlice.confirmWithdrawal(
        blockchain.WETHContract.address
      )

      aliceWithdrawal2 = etherToD('1')
      await contractUsedByAlice.initiateWithdrawal(
        proofAliceRound3,
        aliceWithdrawal2
      )

      aliceDeposit5 = etherToD('2')
      await alice.depositWETHTokensIntoMediator(aliceDeposit5)

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 5 begins  //////////////////////////////
      totalBalanceAlice = totalBalanceAlice
        .plus(aliceDeposit5)
        .minus(aliceWithdrawal2)

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [totalBalanceAlice, D('0')],
        [totalBalanceBob, D('0')],
        blockchain,
        operator
      )

      aliceDeposit6 = etherToD('3')
      await alice.depositWETHTokensIntoMediator(aliceDeposit6)

      currentRound = await contractUsedByOperator.getCurrentRound()

      proofAliceRound5 = operator.computeProof(
        ALICE_INDEX,
        blockchain.WETHContract.address,
        currentRound
      )

      bobDeposit1 = etherToD('1.5')
      await bob.depositWETHTokensIntoMediator(bobDeposit1)

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 6 begins  //////////////////////////////
      totalBalanceAlice = totalBalanceAlice.plus(aliceDeposit6)
      totalBalanceBob = totalBalanceBob.plus(bobDeposit1)

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [totalBalanceAlice, D('0')],
        [totalBalanceBob, D('0')],
        blockchain,
        operator
      )

      await blockchain.skipToNextQuarter()

      bobDeposit2 = etherToD('1.5')
      await bob.depositWETHTokensIntoMediator(bobDeposit2)

      await contractUsedByAlice.confirmWithdrawal(
        blockchain.WETHContract.address
      )

      await blockchain.skipToNextRound()
    })

    it('enables Alice to recover all her funds', async () => {
      //halt
      await blockchain.skipToNextQuarter()

      const aliceBalanceBeforeRefund = await alice.getBalanceWETHToken()

      await contractUsedByAlice.recoverAllFunds(proofAliceRound5)

      //Check Alice received the money
      const aliceBalanceAfterRefund = await alice.getBalanceWETHToken()

      const delta = aliceBalanceAfterRefund.minus(aliceBalanceBeforeRefund)

      const totalDeposits = sum([
        aliceDeposit1,
        aliceDeposit2,
        aliceDeposit3,
        aliceDeposit4,
        aliceDeposit5,
        aliceDeposit6
      ])

      const totalWithdrawals = sum([aliceWithdrawal1, aliceWithdrawal2])
      const expectedRecoveredAmount = totalDeposits.minus(totalWithdrawals)

      expect(delta).toEqual(expectedRecoveredAmount)
    })

    it('checks that an invalid proof for round r-2 gets rejected', async () => {
      //halt
      await blockchain.skipToNextQuarter()

      //Not well formed
      const wrongHashes = ['0x00', '0x002']

      let currentRound = await contractUsedByOperator.getCurrentRound()

      const proofWithWrongHashes = new Proof(
        proofAliceRound3.clientOpeningBalance,
        proofAliceRound3.clientAddress,
        wrongHashes,
        proofAliceRound3.sums,
        blockchain.WETHContract.address,
        D('2'),
        D('4'),
        currentRound
      )

      await expect(
        contractUsedByAlice.recoverAllFunds(proofWithWrongHashes)
      ).rejects.toThrow()

      //No the right round
      await blockchain.skipToNextRound()

      await expect(
        contractUsedByAlice.recoverAllFunds(proofAliceRound3)
      ).rejects.toThrow()
    })

    it('checks that only Alice can recover her funds', async () => {
      //halt
      await blockchain.skipToNextQuarter()

      await expect(
        contractUsedByOperator.recoverAllFunds(proofAliceRound3)
      ).rejects.toThrow()
    })

    it('checks that funds can be recovered only when the contract is halted', async () => {
      //Check halted is false
      const isHalted = await contractUsedByOperator.isHalted()
      expect(isHalted).toBeFalsy()

      await expect(
        contractUsedByAlice.recoverAllFunds(proofAliceRound1)
      ).rejects.toThrow()

      await expect(
        contractUsedByBob.recoverOnChainFundsOnly(
          blockchain.WETHContract.address
        )
      ).rejects.toThrow()
    })

    it('enables Bob to recover his online funds', async () => {
      bobDeposit3 = etherToD('1.5')
      await bob.depositWETHTokensIntoMediator(bobDeposit3)

      //halt
      await blockchain.skipToNextQuarter()

      const bobBalanceBeforeRecovery = await bob.getBalanceWETHToken()

      await contractUsedByBob.recoverOnChainFundsOnly(
        blockchain.WETHContract.address
      )

      const bobBalanceAfterRecovery = await bob.getBalanceWETHToken()

      const delta = bobBalanceAfterRecovery.minus(bobBalanceBeforeRecovery)

      const expectedRecoveredAmount = bobDeposit1
        .plus(bobDeposit2)
        .plus(bobDeposit3)

      expect(delta).toEqual(expectedRecoveredAmount)
    })

    it('verifies that Alice nor Bob can recover their funds more than once', async () => {
      //halt
      await blockchain.skipToNextQuarter()

      //Alice
      await contractUsedByAlice.recoverAllFunds(proofAliceRound5)

      await expect(
        contractUsedByAlice.recoverAllFunds(proofAliceRound5)
      ).rejects.toThrow()

      //Bob
      await contractUsedByBob.recoverOnChainFundsOnly(
        blockchain.WETHContract.address
      )

      await expect(
        contractUsedByBob.recoverOnChainFundsOnly(
          blockchain.WETHContract.address
        )
      ).rejects.toThrow()
    })
  })
})
