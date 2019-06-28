// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/
import 'jest'

import { D, etherToD } from '../../../src/common/BigNumberUtils'
import {
  Address,
  Amount,
  Round,
  SignatureSol
} from '../../../src/common/types/BasicTypes'

import {
  ALICE_INDEX,
  BlockchainClient,
  EthereumBlockchain,
  NULL_AUTHORIZATION_MESSAGE,
  OperatorBlockchain,
  setBalancesAndCommit,
  setUpRound
} from '../../libs/EthereumBlockchain'

import { Proof } from '../../../src/common/types/SmartContractTypes'

import { FillMediator } from '../../../src/common/types/Fills'

import { Approval } from '../../../src/common/types/Approvals'

import { MediatorAsync } from '../../../src/common/mediator/Contracts'

/**
 * Generate approvals arrays
 */
function generateApprovalsAndFillsArrays(
  round: Round,
  blockchain: EthereumBlockchain,
  clientAddress: Address
) {
  const contractAddress = blockchain.contract.address

  const fill1 = new FillMediator(
    '1000',
    '100',
    round,
    D('20'),
    blockchain.OAXContract.address,
    D('4'),
    blockchain.WETHContract.address,
    clientAddress,
    contractAddress
  )

  const fill2 = new FillMediator(
    '1001',
    '100',
    round,
    D('40'),
    blockchain.OAXContract.address,
    D('10'),
    blockchain.WETHContract.address,
    clientAddress,
    contractAddress
  )

  const fill3 = new FillMediator(
    '1002',
    '200',
    round,
    D('20'),
    blockchain.WETHContract.address,
    D('5'),
    blockchain.OAXContract.address,
    clientAddress,
    contractAddress
  )

  const fill4 = new FillMediator(
    '1003',
    '200',
    round,
    D('17'),
    blockchain.WETHContract.address,
    D('5'),
    blockchain.OAXContract.address,
    clientAddress,
    contractAddress
  )

  const fill5 = new FillMediator(
    '1004',
    '200',
    round,
    D('18'),
    blockchain.WETHContract.address,
    D('6'),
    blockchain.OAXContract.address,
    clientAddress,
    contractAddress
  )

  const fill6 = new FillMediator(
    '1005',
    '300',
    round,
    D('10'),
    blockchain.WETHContract.address,
    D('50'),
    blockchain.OAXContract.address,
    clientAddress,
    contractAddress
  )

  const approval1 = new Approval({
    approvalId: fill1.approvalId,
    round: fill1.round,
    buy: { amount: D('60'), asset: fill1.buyAsset },
    sell: { amount: D('15'), asset: fill1.sellAsset },
    intent: 'buyAll',
    owner: clientAddress,

    instanceId: blockchain.contract.address
  })

  const approval2 = new Approval({
    approvalId: fill3.approvalId,
    round: fill3.round,
    buy: { amount: D('48'), asset: fill3.buyAsset },
    sell: { amount: D('16'), asset: fill3.sellAsset },
    intent: 'sellAll',
    owner: clientAddress,

    instanceId: blockchain.contract.address
  })

  const approval3 = new Approval({
    approvalId: fill6.approvalId,
    round: fill6.round,
    buy: { amount: D('10'), asset: fill3.buyAsset },
    sell: { amount: D('50'), asset: fill3.sellAsset },
    intent: 'sellAll',
    owner: clientAddress,

    instanceId: blockchain.contract.address
  })

  const approvalsArray = [
    approval1,
    approval1,
    approval2,
    approval2,
    approval2,
    approval3
  ]
  const fillsArray = [fill1, fill2, fill3, fill4, fill5, fill6]

  return {
    approvals: approvalsArray,
    fills: fillsArray
  }
}

describe('what happens when the operator closes a balance dispute', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let aliceAddress: string
  let operator: OperatorBlockchain

  let bob: BlockchainClient
  let bobAddress: string

  let aliceDepositETHRound1: Amount
  let aliceDepositOAXRound1: Amount

  let bobDepositETHRound1: Amount
  let bobDepositOAXRound1: Amount

  let aliceDepositETHRound2: Amount
  let aliceDepositOAXRound3: Amount

  let contractUsedByAlice: MediatorAsync
  let contractUsedByOperator: MediatorAsync

  let currentRound: Round
  let proofETHRound1: Proof
  let proofOAXRound1: Proof

  let proofETHDisputeRound: Proof
  let proofOAXDisputeRound: Proof
  let proofOAXDisputeRoundBob: Proof

  let disputeRound: Round

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    /////////////////////////////// Round 0 begins  //////////////////////////////

    alice = new BlockchainClient(blockchain.alice, blockchain)
    bob = new BlockchainClient(blockchain.bob, blockchain)
    operator = new OperatorBlockchain(blockchain)

    aliceAddress = await alice.getAddress()
    bobAddress = await bob.getAddress()

    contractUsedByAlice = blockchain.getMediatorContract(alice.signer)

    currentRound = await contractUsedByAlice.getCurrentRound()
  })

  describe('when the client tries to open a dispute during round 0', () => {
    it('fails', async () => {
      const authorizationMessage = await operator.computeAuthorizationMessage(
        aliceAddress,
        currentRound
      )
      await expect(
        contractUsedByAlice.openDispute([], [], [], authorizationMessage)
      ).rejects.toThrow()
    })
  })

  describe('when the client provides no proof', () => {
    beforeEach(async () => {
      await blockchain.skipToNextRound()

      /////////////////////////////// Round 1 begins  //////////////////////////////

      //The operator commits to a new root
      contractUsedByOperator = blockchain.getMediatorContract(
        blockchain.operator
      )

      currentRound = await contractUsedByOperator.getCurrentRound()

      aliceDepositETHRound1 = etherToD('3')
      await alice.depositWETHTokensIntoMediator(aliceDepositETHRound1)

      aliceDepositOAXRound1 = D('200')
      await alice.depositOAXTokensIntoMediator(aliceDepositOAXRound1)

      bobDepositETHRound1 = etherToD('4')
      await bob.depositWETHTokensIntoMediator(bobDepositETHRound1)

      bobDepositOAXRound1 = D('400')
      await bob.depositOAXTokensIntoMediator(bobDepositOAXRound1)

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [aliceDepositETHRound1, aliceDepositOAXRound1],
        [bobDepositETHRound1, bobDepositOAXRound1],
        blockchain,
        operator
      )

      proofETHRound1 = operator.computeProof(
        ALICE_INDEX,
        blockchain.WETHContract.address,
        currentRound
      )

      proofOAXRound1 = operator.computeProof(
        ALICE_INDEX,
        blockchain.OAXContract.address,
        currentRound
      )

      await blockchain.skipToNextRound()
      currentRound = await contractUsedByOperator.getCurrentRound()
    })

    it('shows that the operator is able to close the dispute', async () => {
      /////////////////////////////// Round 2 begins  //////////////////////////////
      disputeRound = currentRound

      const aliceETH = aliceDepositETHRound1
      const aliceOAX = aliceDepositOAXRound1

      const bobETH = bobDepositETHRound1
      const bobOAX = bobDepositOAXRound1

      const valuesRound2 = await setUpRound(
        blockchain,
        operator,
        aliceAddress,
        bobAddress,
        aliceETH,
        aliceOAX,
        bobETH,
        bobOAX
      )

      proofETHDisputeRound = valuesRound2.proofETHAlice
      proofOAXDisputeRound = valuesRound2.proofOAXAlice

      const proofsOperator = [proofETHDisputeRound, proofOAXDisputeRound]

      const authorizationMessage = await operator.computeAuthorizationMessage(
        aliceAddress,
        currentRound - 1
      )
      await contractUsedByAlice.openDispute([], [], [], authorizationMessage)

      await expect(
        contractUsedByOperator.closeDispute(
          proofsOperator,
          [],
          [],
          [],
          [],
          aliceAddress
        )
      ).resolves.not.toThrow()
    })
  })

  describe('when the client provides a proof', () => {
    beforeEach(async () => {
      aliceDepositETHRound1 = etherToD('3')
      await alice.depositWETHTokensIntoMediator(aliceDepositETHRound1)

      aliceDepositOAXRound1 = D('200')
      await alice.depositOAXTokensIntoMediator(aliceDepositOAXRound1)

      bobDepositETHRound1 = etherToD('4')
      await bob.depositWETHTokensIntoMediator(bobDepositETHRound1)

      bobDepositOAXRound1 = D('400')
      await bob.depositOAXTokensIntoMediator(bobDepositOAXRound1)

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 1 begins  //////////////////////////////

      //The operator commits to a new root
      contractUsedByOperator = blockchain.getMediatorContract(
        blockchain.operator
      )

      currentRound = await contractUsedByOperator.getCurrentRound()

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [aliceDepositETHRound1, aliceDepositOAXRound1],
        [bobDepositETHRound1, bobDepositOAXRound1],
        blockchain,
        operator
      )

      proofETHRound1 = operator.computeProof(
        ALICE_INDEX,
        blockchain.WETHContract.address,
        currentRound
      )

      proofOAXRound1 = operator.computeProof(
        ALICE_INDEX,
        blockchain.OAXContract.address,
        currentRound
      )

      await blockchain.skipToNextRound()
      currentRound = await contractUsedByOperator.getCurrentRound()
    })

    describe('with no fills', () => {
      beforeEach(async () => {
        /////////////////////////////// Round 2 begins  //////////////////////////////
        disputeRound = currentRound

        const aliceETH = aliceDepositETHRound1
        const aliceOAX = aliceDepositOAXRound1

        const bobETH = bobDepositETHRound1
        const bobOAX = bobDepositOAXRound1

        const valuesRound2 = await setUpRound(
          blockchain,
          operator,
          aliceAddress,
          bobAddress,
          aliceETH,
          aliceOAX,
          bobETH,
          bobOAX
        )

        proofETHDisputeRound = valuesRound2.proofETHAlice
        proofOAXDisputeRound = valuesRound2.proofOAXAlice
        proofOAXDisputeRoundBob = valuesRound2.proofOAXBob
      })

      it('fails when no dispute exists', async () => {
        const proofsDisputeRound = [proofETHDisputeRound, proofOAXDisputeRound]

        await expect(
          contractUsedByOperator.closeDispute(
            proofsDisputeRound,
            [],
            [],
            [],
            [],
            aliceAddress
          )
        ).rejects.toThrow()
      })

      describe('with open dispute in Q0', () => {
        let proofs: [Proof, Proof]
        let proofsDisputeRound: [Proof, Proof]

        beforeEach(async () => {
          proofs = [proofETHRound1, proofOAXRound1]
          await contractUsedByAlice.openDispute(
            proofs,
            [],
            [],
            NULL_AUTHORIZATION_MESSAGE
          )

          proofsDisputeRound = [proofETHDisputeRound, proofOAXDisputeRound]
        })

        it('lets the operator close the dispute as the values provided are valid', async () => {
          await contractUsedByOperator.closeDispute(
            proofsDisputeRound,
            [],
            [],
            [],
            [],
            aliceAddress
          )

          const disputeCounter = await contractUsedByAlice.openDisputeCounters(
            currentRound
          )
          expect(disputeCounter).toEqual(0)
          const dispute = await contractUsedByAlice.disputes(aliceAddress)
          expect(dispute.open).toEqual(false)
        })

        it('fails when the structure of the proofs array is not valid', async () => {
          const proofsArrayWithWrongOrder = [
            proofOAXDisputeRound,
            proofETHDisputeRound
          ]

          await expect(
            contractUsedByOperator.closeDispute(
              proofsArrayWithWrongOrder,
              [],
              [],
              [],
              [],
              aliceAddress
            )
          ).rejects.toThrow()

          const proofsArrayWithMissingElement = [proofETHDisputeRound]

          await expect(
            contractUsedByOperator.closeDispute(
              proofsArrayWithMissingElement,
              [],
              [],
              [],
              [],
              aliceAddress
            )
          ).rejects.toThrow()
        })

        it('fails when the Mediator is in HALTED mode.', async () => {
          await contractUsedByOperator.halt()

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [],
              [],
              [],
              [],
              aliceAddress
            )
          ).rejects.toThrow()
        })

        it('fails if the caller is not the operator.', async () => {
          await expect(
            contractUsedByAlice.closeDispute(
              proofsDisputeRound,
              [],
              [],
              [],
              [],
              aliceAddress
            )
          ).rejects.toThrow()
        })

        it('fails if no proof is provided', async () => {
          await expect(
            contractUsedByOperator.closeDispute(
              [],
              [],
              [],
              [],
              [],
              aliceAddress
            )
          ).rejects.toThrow()
        })

        describe('in the following quarter', () => {
          beforeEach(async () => {
            await blockchain.skipToNextQuarter()
          })

          it('works', async () => {
            await expect(
              contractUsedByOperator.closeDispute(
                proofsDisputeRound,
                [],
                [],
                [],
                [],
                aliceAddress
              )
            ).resolves.not.toThrow()
          })
        })

        describe('after the following quarter', () => {
          beforeEach(async () => {
            await blockchain.skipToNextQuarter()
            await blockchain.skipToNextQuarter()
          })

          it('fails if the operator tries to close the dispute two quarters after the opening.', async () => {
            await expect(
              contractUsedByOperator.closeDispute(
                proofsDisputeRound,
                [],
                [],
                [],
                [],
                aliceAddress
              )
            ).rejects.toThrow()
          })
        })

        it('fails when a proof is invalid', async () => {
          const proofOAXFake = new Proof(
            proofOAXRound1.clientOpeningBalance.plus('3'),
            proofOAXRound1.clientAddress,
            proofOAXRound1.hashes,
            proofOAXRound1.sums,
            proofOAXRound1.tokenAddress,
            D('2'),
            D('4'),
            currentRound
          )
          await expect(
            contractUsedByOperator.closeDispute(
              [proofETHDisputeRound, proofOAXFake],
              [],
              [],
              [],
              [],
              aliceAddress
            )
          ).rejects.toThrow()
        })

        it('fails when a proof does not belong to the client', async () => {
          await expect(
            contractUsedByOperator.closeDispute(
              [proofETHDisputeRound, proofOAXDisputeRoundBob],
              [],
              [],
              [],
              [],
              aliceAddress
            )
          ).rejects.toThrow()
        })
      })

      describe('with open dispute in Q3', () => {
        let proofs: [Proof, Proof]
        let proofsDisputeRound: [Proof, Proof]

        beforeEach(async () => {
          proofs = [proofETHRound1, proofOAXRound1]

          let currentRound = await contractUsedByOperator.getCurrentRound()
          expect(currentRound.toString()).toEqual('2')

          await blockchain.skipToNextQuarter()
          await blockchain.skipToNextQuarter()
          await blockchain.skipToNextQuarter()

          let currentQuarter = await contractUsedByOperator.getCurrentQuarter()
          expect(currentQuarter.toString()).toEqual('3')

          await contractUsedByAlice.openDispute(
            proofs,
            [],
            [],
            NULL_AUTHORIZATION_MESSAGE
          )

          proofsDisputeRound = [proofETHDisputeRound, proofOAXDisputeRound]

          await blockchain.skipToNextQuarter() //Going to the next round
          currentQuarter = await contractUsedByOperator.getCurrentQuarter()
          expect(currentQuarter.toString()).toEqual('0')

          currentRound = await contractUsedByOperator.getCurrentRound()
          expect(currentRound.toString()).toEqual('3')
        })

        it('lets the operator close the dispute as the values provided are valid', async () => {
          await contractUsedByOperator.closeDispute(
            proofsDisputeRound,
            [],
            [],
            [],
            [],
            aliceAddress
          )

          const disputeCounter = await contractUsedByAlice.openDisputeCounters(
            currentRound
          )
          expect(disputeCounter).toEqual(0)
          const dispute = await contractUsedByAlice.disputes(aliceAddress)
          expect(dispute.open).toEqual(false)
        })
      })
    })

    describe('with fills', () => {
      let tradingETHBalanceAlice: Amount
      let tradingOAXBalanceAlice: Amount
      let tradingETHBalanceBob: Amount
      let tradingOAXBalanceBob: Amount

      beforeEach(async () => {
        /////////////////////////////// Round 2 begins  //////////////////////////////

        disputeRound = currentRound

        //Set the new balances based on trading activity
        tradingETHBalanceAlice = D('51')
        tradingOAXBalanceAlice = D('-6')

        tradingETHBalanceBob = D('-51')
        tradingOAXBalanceBob = D('6')

        //Also must set balances for Bob in order to consistent global balances
        //for all tokens

        const aliceETH = aliceDepositETHRound1.plus(tradingETHBalanceAlice)
        const aliceOAX = aliceDepositOAXRound1.plus(tradingOAXBalanceAlice)

        const bobETH = bobDepositETHRound1.plus(tradingETHBalanceBob)
        const bobOAX = bobDepositOAXRound1.plus(tradingOAXBalanceBob)

        const valuesRound2 = await setUpRound(
          blockchain,
          operator,
          aliceAddress,
          bobAddress,
          aliceETH,
          aliceOAX,
          bobETH,
          bobOAX
        )

        proofETHDisputeRound = valuesRound2.proofETHAlice
        proofOAXDisputeRound = valuesRound2.proofOAXAlice
        proofOAXDisputeRoundBob = valuesRound2.proofOAXBob
      })

      describe('with open dispute containing a few fills', () => {
        let proofs: [Proof, Proof]
        let proofsDisputeRound: [Proof, Proof]
        let fill1: FillMediator
        let fill2: FillMediator
        let approval1: Approval
        let approval2: Approval

        let fill1Sig: SignatureSol
        let fill2Sig: SignatureSol
        let approval1Sig: SignatureSol
        let approval2Sig: SignatureSol

        beforeEach(async () => {
          const delta = D('5')

          fill1 = new FillMediator(
            '751761',
            '323243',
            disputeRound - 1,
            tradingETHBalanceAlice.minus(delta),
            blockchain.WETHContract.address,
            tradingOAXBalanceAlice.abs().minus(delta),
            blockchain.OAXContract.address,
            aliceAddress,
            blockchain.contract.address
          )

          fill1Sig = await operator.signFill(fill1)

          fill2 = new FillMediator(
            '17659877',
            '8737626',
            disputeRound - 1,
            delta,
            blockchain.WETHContract.address,
            delta,
            blockchain.OAXContract.address,
            aliceAddress,
            blockchain.contract.address
          )

          fill2Sig = await operator.signFill(fill2)

          approval1 = new Approval({
            approvalId: fill1.approvalId,
            round: fill1.round,
            buy: { amount: fill1.buyAmount, asset: fill1.buyAsset },
            sell: { amount: fill1.sellAmount, asset: fill1.sellAsset },
            intent: 'buyAll',
            owner: aliceAddress,

            instanceId: blockchain.contract.address
          })

          approval2 = new Approval({
            approvalId: fill2.approvalId,
            round: fill2.round,
            buy: { amount: fill2.buyAmount, asset: fill2.buyAsset },
            sell: { amount: fill2.sellAmount, asset: fill2.sellAsset },
            intent: 'sellAll',
            owner: aliceAddress,

            instanceId: blockchain.contract.address
          })

          approval1Sig = await alice.signApproval(approval1)
          approval2Sig = await alice.signApproval(approval2)

          proofs = [proofETHRound1, proofOAXRound1]
          await contractUsedByAlice.openDispute(
            proofs,
            [fill1, fill2],
            [fill1Sig, fill2Sig],
            NULL_AUTHORIZATION_MESSAGE
          )

          proofsDisputeRound = [proofETHDisputeRound, proofOAXDisputeRound]
        })

        it('works when all provided information is correct.', async () => {
          // Everything is fine, not throwing
          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1, approval2],
              [approval1Sig, approval2Sig],
              [fill1, fill2],
              [fill1Sig, fill2Sig],
              aliceAddress
            )
          ).resolves.not.toThrow()

          const dispute = await contractUsedByOperator.disputes(aliceAddress)
          expect(dispute.open).toBeFalsy()
        })

        it('fails if some fill of the dispute is not provided by the operator.', async () => {
          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [],
              [],
              [],
              [],
              aliceAddress
            )
          ).rejects.toThrow()

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [],
              [],
              [fill1],
              [fill1Sig],
              aliceAddress
            )
          ).rejects.toThrow()

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1, approval2],
              [approval1Sig, approval2Sig],
              [fill1, fill2],
              [fill1Sig, fill2Sig],
              aliceAddress
            )
          ).resolves.not.toThrow()
        })

        it('fails if some approval is not valid (signature or round)', async () => {
          const wrongSig1 = approval2Sig
          const wrongSig2 = approval1Sig

          // Raise an error if the signature is incorrect
          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1, approval2],
              [wrongSig1, approval2Sig],
              [fill1, fill2],
              [fill1Sig, fill2Sig],
              aliceAddress
            )
          ).rejects.toThrow()

          // Raise an error if the signature is incorrect
          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1, approval2],
              [approval1Sig, wrongSig2],
              [fill1, fill2],
              [fill1Sig, fill2Sig],
              aliceAddress
            )
          ).rejects.toThrow()

          //Wrong round for first approval
          const approval1WithWrongRound = new Approval({
            approvalId: fill1.approvalId,
            round: disputeRound - 2,
            buy: { amount: fill1.buyAmount, asset: fill1.buyAsset },
            sell: { amount: fill1.sellAmount, asset: fill1.sellAsset },
            intent: 'buyAll',
            owner: aliceAddress,

            instanceId: blockchain.contract.address
          })

          const approval1WithWrongRoundSig = await alice.signApproval(
            approval1WithWrongRound
          )

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1WithWrongRound, approval2],
              [approval1WithWrongRoundSig, approval2Sig],
              [fill1, fill2],
              [fill1Sig, fill2Sig],
              aliceAddress
            )
          ).rejects.toThrow()
        })

        it('fails if some of the fills are not valid', async () => {
          const wrongSig1 = fill2Sig
          const wrongSig2 = fill1Sig

          const correctRoundForFill = disputeRound - 1

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1, approval2],
              [approval1Sig, approval2Sig],
              [fill1, fill2],
              [wrongSig1, fill2Sig],
              aliceAddress
            )
          ).rejects.toThrow()

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1, approval2],
              [approval1Sig, approval2Sig],
              [fill1, fill2],
              [fill1Sig, wrongSig2],
              aliceAddress
            )
          ).rejects.toThrow()

          const wrongRound = disputeRound + 7

          fill1.round = wrongRound
          fill1Sig = await operator.signFill(fill1)

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1, approval2],
              [approval1Sig, approval2Sig],
              [fill1, fill2],
              [fill1Sig, fill2Sig],
              aliceAddress
            )
          ).rejects.toThrow()

          fill1.round = correctRoundForFill
          fill1Sig = await operator.signFill(fill1)

          fill2.round = wrongRound
          fill2Sig = await operator.signFill(fill2)

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1, approval2],
              [approval1Sig, approval2Sig],
              [fill1, fill2],
              [fill1Sig, fill2Sig],
              aliceAddress
            )
          ).rejects.toThrow()

          fill2.round = correctRoundForFill
          fill2Sig = await operator.signFill(fill2)

          //Build a fill with a wrong clientAddress
          const fill3 = new FillMediator(
            '776656564',
            '141541',
            disputeRound - 1,
            D('36'),
            blockchain.WETHContract.address,
            D('114'),
            blockchain.OAXContract.address,
            bobAddress, //Wrong address
            blockchain.contract.address
          )

          const fill3Sig = await operator.signFill(fill3)

          //Check the client Address
          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              [approval1, approval2],
              [approval1Sig, approval2Sig],
              [fill1, fill2, fill3],
              [fill1Sig, fill2Sig, fill3Sig],
              aliceAddress
            )
          ).rejects.toThrow()
        })

        describe('with a fill that violates approval', () => {
          let approval3: Approval
          let sigApproval3: SignatureSol

          beforeEach(async () => {
            approval3 = new Approval({
              approvalId: '322131213',
              round: fill1.round,
              buy: { amount: fill1.buyAmount, asset: fill1.buyAsset },
              sell: { amount: fill1.sellAmount, asset: fill1.sellAsset },
              intent: 'buyAll',
              owner: aliceAddress,

              instanceId: blockchain.contract.address
            })

            sigApproval3 = await alice.signApproval(approval3)
          })

          it('fails if the approval IDs differ.', async () => {
            const otherApprovalId = '8762876372'

            const fill3 = new FillMediator(
              '7517698781',
              otherApprovalId,
              approval3.round,
              approval3.buy.amount,
              approval3.buy.asset,
              approval3.sell.amount,
              approval3.sell.asset,
              aliceAddress,
              blockchain.contract.address
            )

            const fill3Sig = await operator.signFill(fill3)

            await expect(
              contractUsedByOperator.closeDispute(
                proofsDisputeRound,
                [approval1, approval2, approval3],
                [approval1Sig, approval2Sig, sigApproval3],
                [fill1, fill2, fill3],
                [fill1Sig, fill2Sig, fill3Sig],
                aliceAddress
              )
            ).rejects.toThrow()
          })

          it('fails if the assets differ.', async () => {
            const wrongAssetBuy = approval3.sell.asset
            const wrongAssetSell = approval3.buy.asset

            const fillWrongBuyAsset = new FillMediator(
              '7517698781',
              approval3.approvalId,
              approval3.round,
              approval3.buy.amount,
              wrongAssetBuy,
              approval3.sell.amount,
              approval3.sell.asset,
              aliceAddress,
              blockchain.contract.address
            )
            const fillWrongBuyAssetSig = await operator.signFill(
              fillWrongBuyAsset
            )

            const fillWrongSellAsset = new FillMediator(
              '7517698781',
              approval3.approvalId,
              approval3.round,
              approval3.buy.amount,
              approval3.buy.asset,
              approval3.sell.amount,
              wrongAssetSell,
              aliceAddress,
              blockchain.contract.address
            )
            const fillWrongSellAssetSig = await operator.signFill(
              fillWrongSellAsset
            )

            await expect(
              contractUsedByOperator.closeDispute(
                proofsDisputeRound,
                [approval1, approval2, approval3],
                [approval1Sig, approval2Sig, sigApproval3],
                [fill1, fill2, fillWrongBuyAsset],
                [fill1Sig, fill2Sig, fillWrongBuyAssetSig],
                aliceAddress
              )
            ).rejects.toThrow()

            await expect(
              contractUsedByOperator.closeDispute(
                proofsDisputeRound,
                [approval1, approval2, approval3],
                [approval1Sig, approval2Sig, sigApproval3],
                [fill1, fill2, fillWrongSellAsset],
                [fill1Sig, fill2Sig, fillWrongSellAssetSig],
                aliceAddress
              )
            ).rejects.toThrow()
          })

          it('fails if the price of the fill is higher than the price of the approval.', async () => {
            const fill3 = new FillMediator(
              '7517698781',
              approval3.approvalId,
              approval3.round,
              approval3.buy.amount,
              approval3.buy.asset,
              approval3.sell.amount.plus(2, 10),
              approval3.sell.asset,
              aliceAddress,
              blockchain.contract.address
            )

            const fill3Sig = await operator.signFill(fill3)

            await expect(
              contractUsedByOperator.closeDispute(
                proofsDisputeRound,
                [approval1, approval2, approval3],
                [approval1Sig, approval2Sig, sigApproval3],
                [fill1, fill2, fill3],
                [fill1Sig, fill2Sig, fill3Sig],
                aliceAddress
              )
            ).rejects.toThrow()
          })
        })
      })

      describe('with open dispute containing many fills', () => {
        let proofs: [Proof, Proof]
        let proofsDisputeRound: [Proof, Proof]

        let fillsArray: FillMediator[]
        let approvalsArray: Approval[]
        let fillsSigArray: SignatureSol[]
        let approvalsSigArray: SignatureSol[]

        beforeEach(async () => {
          const approvalsAndFills = generateApprovalsAndFillsArrays(
            disputeRound - 1,
            blockchain,
            aliceAddress
          )
          approvalsArray = approvalsAndFills.approvals
          fillsArray = approvalsAndFills.fills

          approvalsSigArray = new Array()
          fillsSigArray = new Array()

          for (var i = 0; i < approvalsArray.length; i++) {
            approvalsSigArray[i] = await alice.signApproval(approvalsArray[i])
            fillsSigArray[i] = await operator.signFill(fillsArray[i])
          }

          proofs = [proofETHRound1, proofOAXRound1]

          await contractUsedByAlice.openDispute(
            proofs,
            fillsArray,
            fillsSigArray,
            NULL_AUTHORIZATION_MESSAGE
          )

          proofsDisputeRound = [proofETHDisputeRound, proofOAXDisputeRound]
        })

        it('fails if the changes induced by the fills are not backed by the approvals', async () => {
          //The total buy amount of the fills exceeds the buy amount of the approval (BUYALL)

          const fill2 = fillsArray[1]

          const fill2ExcessBuy = new FillMediator(
            fill2.fillId,
            fill2.approvalId,
            fill2.round,
            fill2.buyAmount.plus(D('10')), //Buy amount excess
            fill2.buyAsset,
            fill2.sellAmount,
            fill2.sellAsset,
            fill2.clientAddress,
            blockchain.contract.address
          )

          const fill2ExcessBuySig = await operator.signFill(fill2ExcessBuy)
          let newFillsArray = [
            fillsArray[0],
            fill2ExcessBuy,
            fillsArray[2],
            fillsArray[3],
            fillsArray[4]
          ]
          let newFillsSigArray = [
            fillsSigArray[0],
            fill2ExcessBuySig,
            fillsSigArray[2],
            fillsSigArray[3],
            fillsSigArray[4]
          ]

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              approvalsArray,
              approvalsSigArray,
              newFillsArray,
              newFillsSigArray,
              aliceAddress
            )
          ).rejects.toThrow()

          //The total buy amount of the fills exceeds the buy amount of the approval (SELLALL)
          const fill4 = fillsArray[3]

          const fill4ExcessSell = new FillMediator(
            fill4.fillId,
            fill4.approvalId,
            fill4.round,
            fill4.buyAmount,
            fill4.buyAsset,
            fill4.sellAmount.plus(10),
            fill4.sellAsset,
            fill4.clientAddress,
            blockchain.contract.address
          )

          const fill4ExcessSellSig = await operator.signFill(fill4ExcessSell)
          newFillsArray = [
            fillsArray[0],
            fillsArray[1],
            fillsArray[2],
            fill4ExcessSell,
            fillsArray[4]
          ]
          newFillsSigArray = [
            fillsSigArray[0],
            fillsSigArray[1],
            fillsSigArray[2],
            fill4ExcessSellSig,
            fillsSigArray[4]
          ]

          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              approvalsArray,
              approvalsSigArray,
              newFillsArray,
              newFillsSigArray,
              aliceAddress
            )
          ).rejects.toThrow()

          //Now everything works fine
          await expect(
            contractUsedByOperator.closeDispute(
              proofsDisputeRound,
              approvalsArray,
              approvalsSigArray,
              fillsArray,
              fillsSigArray,
              aliceAddress
            )
          ).resolves.not.toThrow()
        })
      })
    })

    describe('with wrong claimed balances', () => {
      let tradingETHBalanceAlice: Amount
      let tradingOAXBalanceAlice: Amount

      let tradingETHBalanceBob: Amount
      let tradingOAXBalanceBob: Amount

      let aliceETH: Amount
      let aliceOAX: Amount

      let bobETH: Amount
      let bobOAX: Amount

      let aliceWithdrawalAmountETHRound2: Amount
      let aliceWithdrawalAmountOAXRound2: Amount

      let proofsRound2: [Proof, Proof]
      let proofsDisputeRound: [Proof, Proof]

      let fillsArray: FillMediator[]
      let approvalsArray: Approval[]
      let fillsSigArray: SignatureSol[]
      let approvalsSigArray: SignatureSol[]

      beforeEach(async () => {
        /////////////////////////////// Round 2 begins  ///////////////////////////////

        aliceETH = aliceDepositETHRound1
        aliceOAX = aliceDepositOAXRound1

        bobETH = bobDepositETHRound1
        bobOAX = bobDepositOAXRound1

        const round2Values = await setUpRound(
          blockchain,
          operator,
          aliceAddress,
          bobAddress,
          aliceETH,
          aliceOAX,
          bobETH,
          bobOAX
        )

        proofsRound2 = [round2Values.proofETHAlice, round2Values.proofOAXAlice]

        currentRound = await contractUsedByOperator.getCurrentRound()

        //Alice trades
        const approvalsAndFills = generateApprovalsAndFillsArrays(
          currentRound,
          blockchain,
          aliceAddress
        )
        approvalsArray = approvalsAndFills.approvals
        fillsArray = approvalsAndFills.fills

        approvalsSigArray = new Array()
        fillsSigArray = new Array()

        for (var i = 0; i < approvalsArray.length; i++) {
          approvalsSigArray[i] = await alice.signApproval(approvalsArray[i])
          fillsSigArray[i] = await operator.signFill(fillsArray[i])
        }

        //Alice deposits
        aliceDepositETHRound2 = etherToD('1')
        await alice.depositWETHTokensIntoMediator(aliceDepositETHRound2)

        aliceDepositOAXRound3 = D('350')
        await alice.depositOAXTokensIntoMediator(aliceDepositOAXRound3)

        //Alice initiates a withdrawal
        aliceWithdrawalAmountETHRound2 = aliceDepositETHRound1.div(2)
        await contractUsedByAlice.initiateWithdrawal(
          proofETHRound1,
          aliceWithdrawalAmountETHRound2
        )

        aliceWithdrawalAmountOAXRound2 = aliceDepositOAXRound1.div(4)
        await contractUsedByAlice.initiateWithdrawal(
          proofOAXRound1,
          aliceWithdrawalAmountOAXRound2
        )

        aliceETH = aliceDepositETHRound1
          .plus(aliceDepositETHRound2)
          .minus(aliceWithdrawalAmountETHRound2)
        aliceOAX = aliceDepositOAXRound1
          .plus(aliceDepositOAXRound3)
          .minus(aliceWithdrawalAmountOAXRound2)

        //These are the correct amounts traded
        tradingETHBalanceAlice = D('51')
        tradingOAXBalanceAlice = D('6') //Negative

        tradingETHBalanceBob = D('51') //Negative
        tradingOAXBalanceBob = D('6')

        aliceETH = aliceETH.plus(tradingETHBalanceAlice)
        aliceOAX = aliceOAX.minus(tradingOAXBalanceAlice)

        bobETH = bobETH.minus(tradingETHBalanceBob)
        bobOAX = bobOAX.plus(tradingOAXBalanceBob)

        await blockchain.skipToNextRound()

        /////////////////////////////// Round 3 begins  //////////////////////////////

        disputeRound = await contractUsedByOperator.getCurrentRound()
      })

      it('works if the balances provided are correct', async () => {
        const valuesRound3 = await setUpRound(
          blockchain,
          operator,
          aliceAddress,
          bobAddress,
          aliceETH,
          aliceOAX,
          bobETH,
          bobOAX
        )

        await contractUsedByAlice.openDispute(
          proofsRound2,
          fillsArray,
          fillsSigArray,
          NULL_AUTHORIZATION_MESSAGE
        )

        proofETHDisputeRound = valuesRound3.proofETHAlice
        proofOAXDisputeRound = valuesRound3.proofOAXAlice

        proofsDisputeRound = [proofETHDisputeRound, proofOAXDisputeRound]

        await expect(
          contractUsedByOperator.closeDispute(
            proofsDisputeRound,
            approvalsArray,
            approvalsSigArray,
            fillsArray,
            fillsSigArray,
            aliceAddress
          )
        ).resolves.not.toThrow()
      })

      it('fails if opening balance for ETH is incorrect', async () => {
        const wrongAliceETH = aliceETH.plus(D('1'))

        const valuesRound3 = await setUpRound(
          blockchain,
          operator,
          aliceAddress,
          bobAddress,
          wrongAliceETH,
          aliceOAX,
          bobETH,
          bobOAX
        )

        proofETHDisputeRound = valuesRound3.proofETHAlice
        proofOAXDisputeRound = valuesRound3.proofOAXAlice

        proofsDisputeRound = [proofETHDisputeRound, proofOAXDisputeRound]

        await expect(
          contractUsedByOperator.closeDispute(
            proofsDisputeRound,
            approvalsArray,
            approvalsSigArray,
            fillsArray,
            fillsSigArray,
            aliceAddress
          )
        ).rejects.toThrow()
      })

      it('fails if opening balance for OAX is incorrect', async () => {
        const wrongAliceOAX = aliceOAX.minus(D('1'))

        const valuesRound3 = await setUpRound(
          blockchain,
          operator,
          aliceAddress,
          bobAddress,
          aliceETH,
          wrongAliceOAX,
          bobETH,
          bobOAX
        )

        proofETHDisputeRound = valuesRound3.proofETHAlice
        proofOAXDisputeRound = valuesRound3.proofOAXAlice

        proofsDisputeRound = [proofETHDisputeRound, proofOAXDisputeRound]

        await expect(
          contractUsedByOperator.closeDispute(
            proofsDisputeRound,
            approvalsArray,
            approvalsSigArray,
            fillsArray,
            fillsSigArray,
            aliceAddress
          )
        ).rejects.toThrow()
      })
    })
  })
})
