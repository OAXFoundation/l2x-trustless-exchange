// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import R from 'ramda'
import {
  IAccount,
  Address,
  AssetAddress,
  IPartialProof,
  Round,
  AuditResult
} from '../src/common/types/BasicTypes'

import { L2Client } from '@oax/client'
import { SolvencyTree } from '@oax/common/accounting/SolvencyTree'
import { D, etherToD } from '@oax/common/BigNumberUtils'
import { PrivateKeyIdentity } from '@oax/common/identity/PrivateKeyIdentity'
import { HTTPClient } from '@oax/client'

import {
  IAuthorizationMessage,
  Proof
} from '@oax/common/types/SmartContractTypes'

import { MockMediatorAsync } from '../src/server/mediator/MockMediatorAsync'
import { Identity } from '@oax/common/identity/Identity'
import {
  NoActiveWithdrawalError,
  PrematureWithdrawalError
} from '@oax/common/Errors'
import { FillMediator, IFill, ISignedFill } from '@oax/common/types/Fills'
import { SOME_ADDRESS, SOME_SIGNATURE } from './libs/SystemFixture'
import { IApproval, ISignedApproval } from '@oax/common/types/Approvals'
import { NULL_AUTHORIZATION_MESSAGE } from './libs/EthereumBlockchain'
import { mkAuthorization } from '@oax/common/AuthorizationMessage'
import { ProofCollection } from '@oax/common/persistence/ProofCollection'
import { FillCollection } from '@oax/common/persistence/FillCollection'
import { mkFeeFromApproval } from './libs/ApprovalUtils'
import { mkRandomHash } from './libs/CryptoUtils'

describe('How the client interacts with the Operator and the Blockchain', () => {
  const operatorURL = 'https://dex.local'
  const operatorId = new PrivateKeyIdentity()
  const operatorAddress = operatorId.address
  let asset1: AssetAddress
  let asset2: AssetAddress
  let assets: AssetAddress[]

  const aliceId = new PrivateKeyIdentity()
  const aliceTransport = new HTTPClient(new URL(operatorURL))
  const bobId = new PrivateKeyIdentity()
  const bobTransport = new HTTPClient(new URL(operatorURL))

  let alice: L2Client
  let bob: L2Client
  let mediatorAlice: MockMediatorAsync
  let mediatorBob: MockMediatorAsync

  const dummyTxReceipt = {
    byzantium: true
  }

  beforeEach(async () => {
    asset1 = '0x408e05ee6c7051509dca1875829b57486ef29b26'
    asset2 = '0xf76B6D6967e4d86bD7c611e946090030DF6C1611'
    assets = [asset1, asset2]

    mediatorAlice = new MockMediatorAsync()
    mediatorBob = new MockMediatorAsync()

    jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(false)

    alice = new L2Client(aliceId, aliceTransport, {
      operatorAddress,
      mediator: mediatorAlice
    })

    const mockAliceGetRoundFromBlockNumber = jest.spyOn(
      alice,
      'getRoundFromBlockNumber'
    )
    mockAliceGetRoundFromBlockNumber.mockResolvedValue(1)

    const mockAliceGetRegisteredAssets = jest.spyOn(
      alice,
      'getRegisteredAssets'
    )
    mockAliceGetRegisteredAssets.mockResolvedValue(assets)

    await alice.init()

    bob = new L2Client(bobId, bobTransport, {
      operatorAddress,
      mediator: mediatorBob
    })

    const mockBobGetRegisteredAssets = jest.spyOn(bob, 'getRegisteredAssets')
    mockBobGetRegisteredAssets.mockResolvedValue(assets)

    const mockBobGetRoundFromBlockNumber = jest.spyOn(
      bob,
      'getRoundFromBlockNumber'
    )
    mockBobGetRoundFromBlockNumber.mockResolvedValue(1)

    await bob.init()
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    await alice.leave()
    await bob.leave()
  })

  describe('Scenario: Joining exchange', () => {
    describe(`Given the Mediator is halted`, () => {
      beforeEach(async () => {
        await mockTransportJoinResponse(
          aliceTransport,
          operatorId,
          mediatorAlice.contractAddress,
          0,
          alice.address
        )

        jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(true)
      })

      it('when the client joins the exchange, it throws an exception', async () => {
        await expect(alice.join()).rejects.toThrow(
          `Unable to join: the mediator is halted.`
        )
      })
    })

    it('sends a get_authorization message to OperatorBlockchain', async () => {
      const transport = await mockTransportJoinResponse(
        aliceTransport,
        operatorId,
        mediatorAlice.contractAddress,
        0,
        alice.address
      )
      await alice.join()

      const sig = await alice.identity.hashAndSign(alice.address)
      expect(transport).toBeCalledWith(alice.address, sig)
    })

    it('hasAuthorization is true after joining successfully', async () => {
      await mockTransportJoinResponse(
        aliceTransport,
        operatorId,
        mediatorAlice.contractAddress,
        0,
        alice.address
      )
      await alice.join()

      const authorized = alice.hasAuthorization()
      expect(authorized).toBe(true)
    })

    it('fails if invalid countersignature is received from the operator', async () => {
      await mockTransportJoinResponse(
        aliceTransport,
        operatorId,
        mediatorAlice.contractAddress,
        0,
        SOME_ADDRESS
      )

      await expect(alice.join()).rejects.toThrow(
        'The authorization message is not valid.'
      )
    })

    it('gets correct round from mediator', async () => {
      await mockTransportJoinResponse(
        aliceTransport,
        operatorId,
        mediatorAlice.contractAddress,
        2,
        alice.address
      )
      const mockedCurrentRound = jest.spyOn(mediatorAlice, 'getCurrentRound')
      mockedCurrentRound.mockResolvedValue(2)

      await alice.join()

      expect(alice.round).toEqual(2)
    })

    it('.isConnected is true when joined successfully', async () => {
      expect(alice.isConnected).toBeFalsy()

      await mockTransportJoinResponse(
        aliceTransport,
        operatorId,
        mediatorAlice.contractAddress,
        0,
        alice.address
      )

      await alice.join()

      expect(alice.isConnected).toBeTruthy()
    })
  })

  describe('leave', () => {
    it('leave works', async () => {
      await mockTransportJoinResponse(
        aliceTransport,
        operatorId,
        mediatorAlice.contractAddress,
        0,
        alice.address
      )

      await alice.join()

      await expect(alice.leave()).resolves.not.toThrow()
    })

    it('.isConnected becomes false', async () => {
      await mockTransportJoinResponse(
        aliceTransport,
        operatorId,
        mediatorAlice.contractAddress,
        0,
        alice.address
      )

      await alice.join()

      expect(alice.isConnected).toBeTruthy()
      await alice.leave()
      expect(expect(alice.isConnected).toBeFalsy())
    })
  })

  describe('How the client verifies a Proof', () => {
    let mockedMediatorisProofValid: jest.SpyInstance
    let tree: SolvencyTree
    let proofOfLiability: IPartialProof
    let leaf: IAccount
    let proof: Proof

    beforeEach(async () => {
      mockedMediatorisProofValid = jest.spyOn(mediatorAlice, 'isProofValid')
      mockedMediatorisProofValid.mockReturnValue(true)

      const round = 0

      tree = samplePartialProof(alice, [bob], round)

      leaf = {
        address: alice.address,
        sum: D('0'),
        round: round
      }

      const liabilities = tree.getLiabilities({
        address: alice.address,
        sum: D('0'),
        round: round
      })
      const height = tree.getHeight()
      const width = tree.getWidth()

      proofOfLiability = {
        liabilities: liabilities,
        height: height,
        width: width,
        round: round
      }

      proof = Proof.fromProofOfLiability(proofOfLiability, leaf, asset1)

      await mockTransportJoinResponse(
        aliceTransport,
        operatorId,
        mediatorAlice.contractAddress,
        round,
        alice.address
      )
      await alice.join()
    })

    it('stores a proof array in a robust way', async () => {
      await alice.persistence
      const round = proof.round

      let storedProofs: Proof[] = await ProofCollection.with(
        alice.persistence
      ).find({
        asset: proof.tokenAddress,
        round: round
      })

      expect(storedProofs.length).toEqual(0)

      // The proof is correctly inserted
      await alice.storeProofsAsync([proof], round)

      const storedProof: Proof | undefined = await ProofCollection.with(
        alice.persistence
      ).findOne({
        asset: proof.tokenAddress,
        round: round
      })

      expect(storedProof).toEqual(proof)

      // Inserting the proof again does not alter the state nor raise an exception
      await alice.storeProofsAsync([proof], round)

      storedProofs = await ProofCollection.with(alice.persistence).find({
        asset: proof.tokenAddress,
        round: round
      })

      expect(storedProofs.length).toEqual(1)
    })

    it('validates proof of stake from operator', async () => {
      await alice.checkProof(proof, 1)
      expect(mockedMediatorisProofValid).toHaveBeenCalledWith(proof, 1)
    })

    it('throws exception when openingBalance proof is not correct', async () => {
      const round = 0
      const receivedProof = await alice.getProofAsync(asset1, round)
      expect(receivedProof).toBeUndefined()
    })
  })

  describe(`Scenario: hold back from auditing in user's first round`, () => {
    let client: L2Client

    describe(`Given a client joining for the first time in round 1 quarter 0`, () => {
      beforeEach(async () => {
        jest.spyOn(mediatorAlice, 'getCurrentRound').mockResolvedValue(1)
        jest
          .spyOn(mediatorAlice, 'getSortedListOfregisteredTokensAddresses')
          .mockResolvedValue(assets)

        client = new L2Client(aliceId, aliceTransport, {
          operatorAddress,
          mediator: mediatorAlice
        })

        await client.init()

        await mockTransportJoinResponse(
          aliceTransport,
          operatorId,
          mediatorAlice.contractAddress,
          1,
          alice.address
        )

        await client.join()
      })

      describe(`When the user enters round 1 quarter 1`, () => {
        it(`does not attempt to audit`, async () => {
          const audit = jest.spyOn(client, 'audit')

          await client.goToQuarter(1, 1)

          expect(audit).not.toHaveBeenCalled()
        })
      })
    })
  })

  describe('audit', () => {
    let proof1: Proof
    let proof2: Proof
    let info: Promise<{ result: AuditResult; message?: string }>

    beforeEach(async () => {
      proof1 = new Proof(
        D('1'),
        alice.address,
        [],
        [],
        asset1,
        D('1'),
        D('1'),
        alice.round
      )
      proof2 = new Proof(
        D('1'),
        alice.address,
        [],
        [],
        asset2,
        D('1'),
        D('1'),
        alice.round
      )

      // Since there is no root in round 0, proof verification would be skipped
      const mockedCurrentRound = jest.spyOn(mediatorAlice, 'getCurrentRound')
      mockedCurrentRound.mockResolvedValue(1)
      await alice.ensureRound()
      expect(alice.round).toEqual(1)

      info = new Promise(resolve =>
        alice.once('auditComplete', info => resolve(info))
      )
    })

    it('stores proofs if audit is successful', async () => {
      jest.spyOn(alice.transport, 'audit').mockResolvedValue([proof1, proof2])
      jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)
      jest.spyOn(alice, 'isProofBalanceOk').mockResolvedValue(true)

      const storeProofs = jest.spyOn(alice, 'storeProofsAsync')

      await alice.audit()
      await expect(info).resolves.toMatchObject({ result: 'ok' })
      expect(storeProofs).toHaveBeenCalledWith([proof1, proof2], 1)
    })

    describe('opens dispute if', () => {
      let disputeMethod: any

      beforeEach(() => {
        disputeMethod = jest.spyOn(alice, 'openBalanceDispute')
        disputeMethod.mockResolvedValue(undefined)
      })

      it('a proof for an asset is missing', async () => {
        jest.spyOn(alice.transport, 'audit').mockResolvedValue([])

        await alice.audit()
        await expect(info).resolves.toMatchObject({
          message: expect.stringMatching(
            /number of proofs does not match number of assets/i
          )
        })
        expect(disputeMethod).toHaveBeenCalled()
      })

      it('a proof is for the wrong asset', async () => {
        proof1.tokenAddress = '0xBBBAAAA'
        jest.spyOn(alice.transport, 'audit').mockResolvedValue([proof1, proof2])

        await alice.audit()
        await expect(info).resolves.toMatchObject({
          message: expect.stringMatching(/wrong asset in proof/i)
        })
        expect(disputeMethod).toHaveBeenCalled()
      })

      it('a proof is repeated', async () => {
        jest.spyOn(alice.transport, 'audit').mockResolvedValue([proof1, proof1])
        jest.spyOn(alice, 'isProofBalanceOk').mockResolvedValue(true)
        jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)

        await alice.audit()
        await expect(info).resolves.toMatchObject({
          message: expect.stringMatching(/wrong asset in proof/i)
        })
        expect(disputeMethod).toHaveBeenCalled()
      })

      it('the order of the proof is wrong', async () => {
        jest.spyOn(alice.transport, 'audit').mockResolvedValue([proof2, proof1])
        jest.spyOn(alice, 'isProofBalanceOk').mockResolvedValue(true)
        jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)

        await alice.audit()
        await expect(info).resolves.toMatchObject({
          message: expect.stringMatching(/wrong asset in proof/i)
        })
        expect(disputeMethod).toHaveBeenCalled()
      })

      it('a proof has a wrong client address', async () => {
        proof1.clientAddress = '0xBBBAAAA'
        jest.spyOn(alice.transport, 'audit').mockResolvedValue([proof1, proof2])

        await alice.audit()
        await expect(info).resolves.toMatchObject({
          message: expect.stringMatching(/client address not ours/i)
        })
        expect(disputeMethod).toHaveBeenCalled()
      })

      it("a proof balance does not match the client's balance", async () => {
        jest.spyOn(alice.transport, 'audit').mockResolvedValue([proof1, proof2])
        jest.spyOn(alice, 'isProofBalanceOk').mockResolvedValue(false)

        await alice.audit()
        await expect(info).resolves.toMatchObject({
          message: expect.stringMatching(/does not match our accounting/i)
        })
        expect(disputeMethod).toHaveBeenCalled()
      })

      it('if fetching proofs from operator fails', async () => {
        jest
          .spyOn(alice.transport, 'audit')
          .mockRejectedValue(new Error('fetching proof failed'))

        await alice.audit()
        await expect(info).resolves.toMatchObject({
          message: expect.stringMatching('fetching proof failed')
        })
        expect(disputeMethod).toHaveBeenCalled()
      })

      it('if verifying proofs fails', async () => {
        jest.spyOn(alice.transport, 'audit').mockResolvedValue([proof1, proof2])
        jest.spyOn(alice, 'isProofBalanceOk').mockResolvedValue(true)
        jest
          .spyOn(mediatorAlice, 'isProofValid')
          .mockRejectedValue(new Error('proof verification failed'))

        await alice.audit()
        await expect(info).resolves.toMatchObject({
          message: expect.stringMatching('proof verification failed')
        })
        expect(disputeMethod).toHaveBeenCalled()
      })
    })
  })

  describe('Making a deposit to the mediator', () => {
    const aliceAmountDeposit = etherToD('3')

    beforeEach(() => {
      jest
        .spyOn(mediatorAlice, 'depositsToken')
        .mockResolvedValue(dummyTxReceipt)
    })

    it.each`
      authorized | halted   | result
      ${true}    | ${true}  | ${'Cannot deposit'}
      ${true}    | ${false} | ${'Can deposit'}
      ${false}   | ${true}  | ${'Cannot deposit'}
      ${false}   | ${false} | ${'Cannot deposit'}
    `(
      '$result when authorized=$authorized, halted=$halted',
      async ({ authorized, halted, result }) => {
        if (authorized) {
          await mockTransportJoinResponse(
            aliceTransport,
            operatorId,
            mediatorAlice.contractAddress,
            0,
            alice.address
          )

          await alice.join()
        }

        if (halted) {
          jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(true)
        } else {
          jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(false)
        }

        if (result === 'Can deposit') {
          await expect(
            alice.deposit(asset1, aliceAmountDeposit, false)
          ).resolves.not.toThrow()
        } else {
          await expect(
            alice.deposit(asset1, aliceAmountDeposit, false)
          ).rejects.toThrow()
        }
      }
    )
  })

  describe('Scenario: withdrawing tokens', () => {
    let proof: Proof

    let firstRound: Round = 1
    let secondRound: Round = 2

    beforeEach(async () => {
      await mockTransportJoinResponse(
        aliceTransport,
        operatorId,
        mediatorAlice.contractAddress,
        0,
        alice.address
      )
      await alice.join()
      proof = await alice.ledger.completeProof(asset1, alice.address, 1)

      jest
        .spyOn(mediatorAlice, 'depositsToken')
        .mockResolvedValue(dummyTxReceipt)
      jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(false)
    })

    it('prevents withdrawal if current round < first round + 2', async () => {
      jest.spyOn(alice.ledger, 'balance').mockResolvedValue(D('1'))

      alice.goToRound(0)

      await expect(alice.withdraw(asset1, D('1'))).rejects.toThrow(
        'Withdrawal round must be > 0. Given 0'
      )
    })

    it('prevents to do more than one withdrawal per round', async () => {
      jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)
      jest
        .spyOn(mediatorAlice, 'initiateWithdrawal')
        .mockResolvedValue(dummyTxReceipt)

      await alice.deposit(asset1, D('3'), false)
      alice.goToRound(firstRound)

      await alice.storeProofsAsync([proof], firstRound)
      alice.goToRound(secondRound)

      await alice.storeProofsAsync([proof], secondRound)

      await expect(alice.withdraw(asset1, D('1'))).resolves.not.toThrow()

      await expect(alice.withdraw(asset1, D('2'))).rejects.toThrow(
        `An existing withdrawal already exists from round ${secondRound}`
      )
    })

    it('prevents withdrawal when the contract is halted', async () => {
      jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)
      jest
        .spyOn(mediatorAlice, 'initiateWithdrawal')
        .mockResolvedValue(dummyTxReceipt)

      await alice.deposit(asset1, D('3'), false)
      alice.goToRound(firstRound)
      await alice.storeProofsAsync([proof], firstRound)

      alice.goToRound(2)

      //Halt the mediator
      jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(true)

      await expect(alice.withdraw(asset1, D('2'))).rejects.toThrow(
        'Unable to initiate withdrawal when the Mediator is halted.'
      )
    })

    it('works if below minimum openingBalance within current and past round', async () => {
      jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)
      jest
        .spyOn(mediatorAlice, 'initiateWithdrawal')
        .mockResolvedValue(dummyTxReceipt)

      await alice.deposit(asset1, D('3'), false)
      alice.goToRound(firstRound)
      await alice.storeProofsAsync([proof], firstRound)
      alice.goToRound(secondRound)
      await alice.checkProof(proof, secondRound)

      await expect(alice.withdraw(asset1, D('3'))).resolves.not.toThrow()
    })

    it('fails on overdraw ', async () => {
      jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)
      jest
        .spyOn(mediatorAlice, 'initiateWithdrawal')
        .mockResolvedValue(dummyTxReceipt)

      await alice.deposit(asset1, D('3'), false)
      alice.goToRound(firstRound)
      await alice.storeProofsAsync([proof], firstRound)

      alice.goToRound(secondRound)
      await alice.storeProofsAsync([proof], secondRound)

      await expect(alice.withdraw(asset1, D('4'))).rejects.toThrow(
        `Insufficient balance for withdrawal. Asset: ${asset1} Available: 3 Requested: 4`
      )
    })

    it('fails if proof of stake not supplied for previous round', async () => {
      jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)
      jest.spyOn(alice, 'hasAuthorization').mockReturnValue(true)
      jest.spyOn(mediatorAlice, 'initiateWithdrawal')

      await alice.deposit(asset1, D('3'), false)
      alice.goToRound(firstRound)
      alice.goToRound(secondRound)

      await expect(alice.withdraw(asset1, D('3'))).rejects.toThrow(
        `Unable to withdraw without proof from round ${1}`
      )
    })

    describe('prevent overdrawing off-chain balance', () => {
      let dummyProof: Proof

      beforeEach(() => {
        jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)
        jest
          .spyOn(mediatorAlice, 'initiateWithdrawal')
          .mockResolvedValue(dummyTxReceipt)
      })

      it('cannot overdraw beyond minimum openingBalance within past round', async () => {
        const amountDeposit = D('3')

        await alice.deposit(asset1, amountDeposit, false)
        alice.goToRound(firstRound)

        dummyProof = await alice.ledger.completeProof(
          asset1,
          alice.address,
          firstRound
        )

        bob.goToRound(firstRound)
        await alice.storeProofsAsync([dummyProof], firstRound)

        const approval: ISignedApproval = {
          params: {
            approvalId: '13424542',
            round: firstRound,
            buy: { asset: asset1, amount: D('0') },
            sell: { asset: asset1, amount: D('1') },
            intent: 'sellAll',
            owner: alice.address,

            instanceId: SOME_ADDRESS
          },
          ownerSig: 'sig'
        }

        const fill: ISignedFill = {
          params: {
            fillId: '8767686',
            approvalId: approval.params.approvalId,
            round: firstRound,
            buyAmount: approval.params.buy.amount,
            buyAsset: approval.params.buy.asset,
            sellAmount: approval.params.sell.amount,
            sellAsset: approval.params.sell.asset,
            clientAddress: alice.address,
            instanceId: SOME_ADDRESS
          },
          signature: SOME_SIGNATURE
        }

        await alice.ledger.insertApproval(approval)
        await alice.ledger.insertFill(fill)

        alice.goToRound(secondRound)

        await expect(alice.withdraw(asset1, amountDeposit)).rejects.toThrow(
          `Insufficient balance for withdrawal. Asset: ${asset1} Available: 2 Requested: 3`
        )
      })

      it('cannot overdraw beyond minimum openingBalance within current round', async () => {
        const amountDeposit = D('3')

        await alice.deposit(asset1, amountDeposit, false)
        alice.goToRound(firstRound)

        dummyProof = await alice.ledger.completeProof(
          asset1,
          alice.address,
          firstRound
        )

        bob.goToRound(firstRound)
        await alice.storeProofsAsync([dummyProof], firstRound)

        alice.goToRound(secondRound)

        const approval: ISignedApproval = {
          params: {
            approvalId: '13424542',
            round: secondRound,
            buy: { asset: asset1, amount: D('0') },
            sell: { asset: asset1, amount: D('1') },
            intent: 'sellAll',
            owner: alice.address,

            instanceId: SOME_ADDRESS
          },
          ownerSig: 'sig'
        }

        await alice.ledger.insertApproval(approval)

        await expect(alice.withdraw(asset1, amountDeposit)).rejects.toThrow(
          `Insufficient balance for withdrawal. Asset: ${asset1} Available: 2 Requested: 3`
        )
      })
    })

    it('Confirms withdrawal after 2 rounds', async () => {
      jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)
      jest
        .spyOn(mediatorAlice, 'depositsToken')
        .mockResolvedValue(dummyTxReceipt)
      jest
        .spyOn(mediatorAlice, 'initiateWithdrawal')
        .mockResolvedValue(dummyTxReceipt)

      const confirmWithdrawal = jest.spyOn(alice, 'confirmWithdrawal')

      const amountDeposit = D('3')

      await alice.deposit(asset1, amountDeposit, false)

      alice.goToRound(firstRound)
      await alice.storeProofsAsync([proof], firstRound)

      alice.goToRound(secondRound)
      await alice.storeProofsAsync([proof], secondRound)
      await alice.withdraw(asset1, amountDeposit)

      const thirdRound = 3

      alice.goToRound(thirdRound)
      await alice.storeProofsAsync([proof], thirdRound)
      expect(confirmWithdrawal).not.toHaveBeenCalled()

      const fourthRound = 4
      alice.goToRound(fourthRound)

      await alice.storeProofsAsync([proof], fourthRound)

      // Fetching proofs would fail during audit.
      jest.spyOn(alice, 'audit').mockResolvedValue(undefined)

      await alice.goToQuarter(fourthRound, 1)
      expect(confirmWithdrawal).toHaveBeenCalled()
    })

    describe('When there is no pending withdrawal to confirm', () => {
      beforeEach(() => {
        jest
          .spyOn(mediatorAlice, 'getActiveWithdrawalRound')
          .mockResolvedValue(0)
      })

      it('confirming withdrawal raises an exception', async () => {
        const confirmWithdrawal = alice.confirmWithdrawal(asset1)

        await expect(confirmWithdrawal).rejects.toThrow(NoActiveWithdrawalError)
      })
    })

    describe('When there is a pending withdrawal to confirm', () => {
      beforeEach(() => {
        jest
          .spyOn(mediatorAlice, 'getActiveWithdrawalRound')
          .mockResolvedValue(1)

        jest
          .spyOn(mediatorAlice, 'requestedWithdrawalAmount')
          .mockResolvedValue(D('10'))
      })

      /*
      Full test table. The actual code below tests only equivalence partitions + boundary values
      requestRound | confirmRound | confirmQuarter | isHalted | canConfirmWithdrawal
        ${1}         | ${1}         | ${0}           | ${false} | ${'Cannot'}
        ${1}         | ${1}         | ${1}           | ${false} | ${'Cannot'}
        ${1}         | ${1}         | ${2}           | ${false} | ${'Cannot'}
        ${1}         | ${1}         | ${3}           | ${false} | ${'Cannot'}
        ${1}         | ${2}         | ${0}           | ${false} | ${'Cannot'}
        ${1}         | ${2}         | ${1}           | ${false} | ${'Cannot'}
        ${1}         | ${2}         | ${2}           | ${false} | ${'Cannot'}
        ${1}         | ${2}         | ${3}           | ${false} | ${'Cannot'}
        ${1}         | ${3}         | ${0}           | ${false} | ${'Cannot'}
        ${1}         | ${3}         | ${1}           | ${false} | ${'Can'}
        ${1}         | ${3}         | ${2}           | ${false} | ${'Can'}
        ${1}         | ${3}         | ${3}           | ${false} | ${'Can'}
        ${1}         | ${1}         | ${0}           | ${true}  | ${'Cannot'}
        ${1}         | ${1}         | ${1}           | ${true}  | ${'Cannot'}
        ${1}         | ${1}         | ${2}           | ${true}  | ${'Cannot'}
        ${1}         | ${1}         | ${3}           | ${true}  | ${'Cannot'}
        ${1}         | ${2}         | ${0}           | ${true}  | ${'Cannot'}
        ${1}         | ${2}         | ${1}           | ${true}  | ${'Cannot'}
        ${1}         | ${2}         | ${2}           | ${true}  | ${'Cannot'}
        ${1}         | ${2}         | ${3}           | ${true}  | ${'Cannot'}
        ${1}         | ${3}         | ${0}           | ${true}  | ${'Cannot'}
        ${1}         | ${3}         | ${1}           | ${true}  | ${'Cannot'}
        ${1}         | ${3}         | ${2}           | ${true}  | ${'Cannot'}
        ${1}         | ${3}         | ${3}           | ${true}  | ${'Cannot'}
       */
      it.each`
        requestRound | confirmRound | confirmQuarter | isHalted | canConfirmWithdrawal
        ${2}         | ${2}         | ${0}           | ${false} | ${'Cannot'}
        ${2}         | ${2}         | ${1}           | ${false} | ${'Cannot'}
        ${2}         | ${2}         | ${1}           | ${true}  | ${'Cannot'}
        ${2}         | ${3}         | ${0}           | ${false} | ${'Cannot'}
        ${2}         | ${3}         | ${1}           | ${false} | ${'Cannot'}
        ${2}         | ${3}         | ${1}           | ${true}  | ${'Cannot'}
        ${2}         | ${4}         | ${0}           | ${false} | ${'Cannot'}
        ${2}         | ${4}         | ${1}           | ${false} | ${'Can'}
        ${2}         | ${4}         | ${1}           | ${true}  | ${'Cannot'}
      `(
        'Withdrawal initiated in round $requestRound $canConfirmWithdrawal be confirmed given confirmRound=$confirmRound confirmQuarter=$confirmQuarter isHalted=$isHalted',
        async ({
          requestRound,
          confirmRound,
          confirmQuarter,
          isHalted,
          canConfirmWithdrawal
        }) => {
          // Setting up preconditions
          jest
            .spyOn(mediatorAlice, 'getActiveWithdrawalRound')
            .mockResolvedValue(requestRound)
          jest
            .spyOn(mediatorAlice, 'getCurrentRound')
            .mockResolvedValue(confirmRound)
          jest
            .spyOn(mediatorAlice, 'getCurrentQuarter')
            .mockResolvedValue(confirmQuarter)
          jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(isHalted)
          jest.spyOn(alice, 'round', 'get').mockReturnValue(confirmRound)
          jest.spyOn(alice, 'quarter', 'get').mockReturnValue(confirmQuarter)

          jest
            .spyOn(mediatorAlice, 'confirmWithdrawal')
            .mockImplementation(() => Promise.resolve(dummyTxReceipt))

          await alice.ledger.creditDeposit(
            asset1,
            alice.address,
            etherToD('10'),
            requestRound
          )

          await alice.ledger.withdraw({
            txHash: mkRandomHash(),
            asset: asset1,
            wallet: alice.address,
            amount: etherToD('10'),
            round: requestRound
          })

          // Confirm withdrawal
          const confirmWithdrawal = alice.confirmWithdrawal(asset1)

          // Expectation
          if (canConfirmWithdrawal === 'Can') {
            await expect(confirmWithdrawal).resolves.not.toThrow()
          } else {
            await expect(confirmWithdrawal).rejects.toThrow(
              PrematureWithdrawalError
            )
          }
        }
      )
    })
  })

  describe('recoverFunds', () => {
    describe('When the mediator is not halted', () => {
      beforeEach(() => {
        jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(false)
      })

      it('throws an exception', async () => {
        const recoverFunds = alice.recoverFunds(asset1)

        await expect(recoverFunds).rejects.toThrow(
          'Cannot recover funds while the mediator is still active.'
        )
      })
    })

    describe('When the mediator is halted', () => {
      let recoverOnChainFundsOnly: jest.SpyInstance
      let recoverAllFunds: jest.SpyInstance

      beforeEach(() => {
        jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(true)
        recoverOnChainFundsOnly = jest
          .spyOn(mediatorAlice, 'recoverOnChainFundsOnly')
          .mockResolvedValue(dummyTxReceipt)
        recoverAllFunds = jest
          .spyOn(mediatorAlice, 'recoverAllFunds')
          .mockResolvedValue(dummyTxReceipt)
      })

      it('throws exception if the asset has already been recovered', async () => {
        await alice.recoverFunds(asset1)

        await expect(alice.recoverFunds(asset1)).rejects.toThrow(
          'Already recovered fund for this asset'
        )
      })

      describe('When no proof is available from 2 rounds ago', () => {
        it('invokes mediator.recoverOnChainFundsOnly with token address', async () => {
          await alice.recoverFunds(asset1)

          expect(recoverOnChainFundsOnly).toHaveBeenCalledWith(asset1)
        })
      })

      describe('When proof is available from 2 rounds ago', () => {
        let proof: Proof

        beforeEach(async () => {
          const currentRound: Round = 3

          jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)
          jest
            .spyOn(mediatorAlice, 'getCurrentRound')
            .mockResolvedValue(currentRound)

          const tree = samplePartialProof(alice, [bob], currentRound)

          const leaf = {
            address: alice.address,
            sum: D('0'),
            round: currentRound
          }

          const liabilities = tree.getLiabilities({
            address: alice.address,
            sum: D('0'),
            round: currentRound
          })
          const height = tree.getHeight()
          const width = tree.getWidth()

          const proofOfLiability = {
            liabilities: liabilities,
            height: height,
            width: width,
            round: currentRound
          }

          proof = Proof.fromProofOfLiability(proofOfLiability, leaf, asset1)

          const roundNumber = 1
          await alice.storeProofsAsync([proof], roundNumber)
        })

        it('invokes mediator.recoverAllFunds with proof', async () => {
          await alice.recoverFunds(asset1)
          expect(recoverAllFunds).toHaveBeenCalledWith(proof)
        })
      })
    })
  })

  describe('Invoking onReceivedFill with a fill', () => {
    let approval: ISignedApproval
    let fillParams: IFill

    beforeAll(async () => {
      approval = {
        params: {
          approvalId: '13424542',
          round: 3,
          buy: { asset: asset1, amount: D('4') },
          sell: { asset: asset2, amount: D('5') },
          intent: 'sellAll',
          owner: alice.address,

          instanceId: SOME_ADDRESS
        },
        ownerSig: 'sig'
      }

      fillParams = {
        fillId: '1',
        approvalId: approval.params.approvalId,
        round: approval.params.round,
        buyAmount: approval.params.buy.amount,
        buyAsset: approval.params.buy.asset,
        sellAmount: approval.params.sell.amount,
        sellAsset: approval.params.sell.asset,
        clientAddress: alice.address,
        instanceId: SOME_ADDRESS
      }
    })

    describe('Given an invalid signature on the fill', () => {
      let fill: ISignedFill
      beforeAll(() => {
        fill = {
          params: fillParams,
          signature: '0xb4d'
        }
      })

      it('throws an error', async () => {
        await expect(alice.onReceiveFillAsync(fill)).rejects.toThrow(
          /invalid signature/i
        )

        await expect(alice.hasFill(fill.params.round, fill)).resolves.toBe(
          false
        )
      })
    })

    describe('Given a valid signature on the fill', () => {
      let fill: ISignedFill

      beforeEach(async () => {
        const digest = FillMediator.fromIFill(fillParams).createDigest()

        fill = {
          params: fillParams,
          signature: await operatorId.signHash(digest)
        }
        await mockTransportJoinResponse(
          aliceTransport,
          operatorId,
          mediatorAlice.contractAddress,
          0,
          alice.address
        )
        await alice.join()

        jest
          .spyOn(mediatorAlice, 'depositsToken')
          .mockResolvedValue(dummyTxReceipt)

        jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(false)

        await alice.deposit(asset2, D('5'), false)

        await alice.ledger.insertApproval(approval)
      })

      it('the fill is stored', async () => {
        await alice.onReceiveFillAsync(fill)

        await expect(alice.hasFill(fill.params.round, fill)).resolves.toBe(true)
      })

      it('shows that the fill will not be stored / processed twice', async () => {
        const buyAssetAddress = fill.params.buyAsset
        const round = fill.params.round
        const fillId = fill.params.fillId

        let storedFills = await FillCollection.with(alice.persistence).find({
          fillId: fillId
        })
        expect(storedFills.length).toEqual(0)

        let balanceTokenBuy = await alice.getBalanceTokenOffChain(
          buyAssetAddress,
          round
        )

        expect(balanceTokenBuy).toEqual(D('0'))

        await alice.onReceiveFillAsync(fill)

        storedFills = await FillCollection.with(alice.persistence).find({
          fillId: fillId
        })
        expect(storedFills.length).toEqual(1)

        balanceTokenBuy = await alice.getBalanceTokenOffChain(
          buyAssetAddress,
          round
        )

        expect(balanceTokenBuy).toEqual(D('4'))

        await expect(alice.onReceiveFillAsync(fill)).rejects.toThrow(
          `Failed to insert fill: Fill with ID ${
            fill.params.fillId
          } already exists`
        )

        storedFills = await FillCollection.with(alice.persistence).find({
          fillId: fillId
        })
        expect(storedFills.length).toEqual(1)

        balanceTokenBuy = await alice.getBalanceTokenOffChain(
          buyAssetAddress,
          round
        )

        expect(balanceTokenBuy).toEqual(D('4'))
      })
    })
  })

  describe('Syncing state with Exchange', () => {
    describe(`Given that the client joined in round 0 quarter 0
      And made a deposit and submitted approval in round 1 quarter 0
      And left in round 1 quarter 0
      And the exchange filled the approval in full in round 1`, () => {
      let orderFill: ISignedFill
      let feeFill: ISignedFill
      let proofsBeforeFill: Proof[]
      let proofsAfterFill: Proof[]

      const asset1OpeningBalance = D('3')

      beforeEach(async () => {
        // Mocking contract methods
        jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(false)
        jest
          .spyOn(mediatorAlice, 'depositsToken')
          .mockResolvedValue(dummyTxReceipt)
        jest.spyOn(mediatorAlice, 'isProofValid').mockResolvedValue(true)

        await mockTransportJoinResponse(
          aliceTransport,
          operatorId,
          mediatorAlice.contractAddress,
          alice.round,
          alice.address
        )

        // JOINING IN ROUND 0 QUARTER 0
        jest.spyOn(mediatorAlice, 'getCurrentRound').mockResolvedValue(0)
        jest.spyOn(mediatorAlice, 'getCurrentQuarter').mockResolvedValue(0)

        await alice.join()

        // GO TO ROUND 1 QUARTER 0
        alice.goToRound(1)
        await alice.goToQuarter(1, 0)

        // DEPOSIT
        await alice.deposit(asset1, asset1OpeningBalance, false)

        // SUBMITTING ORDER
        const approval: IApproval = {
          approvalId: '1001',
          round: 1,
          buy: { asset: asset2, amount: D('10') },
          sell: { asset: asset1, amount: D('2') },
          intent: 'sellAll',
          owner: alice.address,

          instanceId: SOME_ADDRESS
        }

        const fee: IApproval = {
          approvalId: '1002',
          round: 1,
          buy: { asset: asset1, amount: D('0') },
          sell: { asset: asset1, amount: D('1') },
          intent: 'sellAll',
          owner: alice.address,

          instanceId: SOME_ADDRESS
        }

        const orderApproval: ISignedApproval = await alice.makeSignedApproval(
          approval
        )

        const feeApproval: ISignedApproval = await alice.makeSignedApproval(fee)

        jest.spyOn(aliceTransport, 'createOrder').mockResolvedValue({
          orderApproval,
          feeApproval
        })

        await alice.createOrder(approval, fee)

        // CLIENT LEAVES IN ROUND 1 QUARTER 0
        await alice.leave()

        // ORDER EXECUTION
        const makeFee = R.curry(mkFeeFromApproval)(aliceId, operatorId)
        orderFill = await makeFee(approval, '0001')
        feeFill = await makeFee(fee, '0002')

        // fills made in round 1 are retrievable in round 2
        jest
          .spyOn(aliceTransport, 'fetchFills')
          .mockImplementation(async (wallet, round) => {
            if (wallet === alice.address && round === 2) {
              return [orderFill, feeFill]
            }

            return []
          })

        // proofs from round 1 and round 2 that the client should receive
        const asset1BeforeFillProof = await alice.ledger.completeProof(
          asset1,
          alice.address,
          1
        )
        const asset2BeforeFillProof = await alice.ledger.completeProof(
          asset2,
          alice.address,
          1
        )

        const asset1AfterFillProof = await alice.ledger.completeProof(
          asset1,
          alice.address,
          1
        )
        asset1AfterFillProof.clientOpeningBalance = asset1OpeningBalance
          .minus(orderFill.params.sellAmount)
          .minus(feeFill.params.sellAmount)

        const asset2AfterFillProof = await alice.ledger.completeProof(
          asset2,
          alice.address,
          1
        )
        asset2AfterFillProof.clientOpeningBalance = orderFill.params.buyAmount

        proofsBeforeFill = [asset1BeforeFillProof, asset2BeforeFillProof]
        proofsAfterFill = [asset1AfterFillProof, asset2AfterFillProof]
      })

      describe.each`
        round | quarter | shouldAuditThisRound
        ${3}  | ${0}    | ${false}
        ${3}  | ${1}    | ${true}
        ${3}  | ${2}    | ${true}
        ${3}  | ${3}    | ${true}
      `('Wen client joins in round $round quarter $quarter', ctx => {
        const { round, quarter, shouldAuditThisRound } = ctx

        beforeEach(async () => {
          jest.spyOn(mediatorAlice, 'getCurrentRound').mockResolvedValue(round)
          jest
            .spyOn(mediatorAlice, 'getCurrentQuarter')
            .mockResolvedValue(quarter)

          jest
            .spyOn(aliceTransport, 'audit')
            .mockImplementation(async (_wallet, round) => {
              if (round <= 1) {
                return proofsBeforeFill
              }

              return proofsAfterFill
            })

          await alice.join()
        })

        it('retrieves fills', async () => {
          const fills = await alice.ledger.getFills({})

          expect(fills).toMatchObject([orderFill, feeFill])
        })

        it('updates balance correctly to reflect fills from round 1', async () => {
          const balance = await alice.getBalanceTokenOffChain(
            orderFill.params.sellAsset,
            2
          )

          expect(balance).toEqual(
            asset1OpeningBalance
              .minus(orderFill.params.sellAmount)
              .minus(feeFill.params.sellAmount)
          )
        })

        it('retrieves proof from round 1', async () => {
          const round1Proof = await alice.getProofAsync(asset1, 1)
          expect(round1Proof).not.toBe(undefined)
        })

        it('retrieves proof from round 2', async () => {
          const round2Proof = await alice.getProofAsync(asset1, 2)
          expect(round2Proof).not.toBe(undefined)
        })

        if (shouldAuditThisRound) {
          it('retrieves proof from round 3', async () => {
            const round3Proof = await alice.getProofAsync(asset1, 3)
            expect(round3Proof).not.toBe(undefined)
          })
        } else {
          it('does not retrieve proof from round 3', async () => {
            const round3Proof = await alice.getProofAsync(asset1, 3)
            expect(round3Proof).toBe(undefined)
          })
        }
      })
    })
  })

  describe('Scenario: Open dispute', () => {
    describe(`Given the client joined the exchange
      And the mediator becomes halted`, () => {
      beforeEach(async () => {
        await mockTransportJoinResponse(
          aliceTransport,
          operatorId,
          mediatorAlice.contractAddress,
          0,
          alice.address
        )

        await alice.join()

        jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(true)
      })

      it('When the client opens a dispute, it throws an exception', async () => {
        await expect(alice.openBalanceDispute(0)).rejects.toThrow(
          'Unable to open dispute: the mediator is halted.'
        )
      })
    })
  })

  describe('Scenario: create order', () => {
    describe(`Given the client joined the exchange
    And the mediator becomes halted`, () => {
      beforeEach(async () => {
        await mockTransportJoinResponse(
          aliceTransport,
          operatorId,
          mediatorAlice.contractAddress,
          0,
          alice.address
        )

        await alice.join()

        jest.spyOn(mediatorAlice, 'isHalted').mockResolvedValue(true)
      })

      it('when the client creates order, it throws an exception', async () => {
        const approval: IApproval = {
          approvalId: '1001',
          round: 1,
          buy: { asset: asset2, amount: D('10') },
          sell: { asset: asset1, amount: D('2') },
          intent: 'sellAll',
          owner: alice.address,

          instanceId: SOME_ADDRESS
        }

        const fee: IApproval = {
          approvalId: '1002',
          round: 1,
          buy: { asset: asset1, amount: D('0') },
          sell: { asset: asset1, amount: D('1') },
          intent: 'sellAll',
          owner: alice.address,

          instanceId: SOME_ADDRESS
        }
        await expect(alice.createOrder(approval, fee)).rejects.toThrow(
          'Unable to create order: the mediator is halted.'
        )
      })
    })
  })
})

function samplePartialProof(
  client: L2Client,
  otherClients: L2Client[],
  round: Round
): SolvencyTree {
  const account = {
    address: client.address,
    sum: D('0'),
    round: round
  }

  const otherAccounts = otherClients.map(c => ({
    address: c.address,
    sum: D('0'),
    round: round
  }))

  const tree = new SolvencyTree([account, ...otherAccounts])
  return tree
}

/**
 * Mocks the transport to bypass sending the admission message to an operator
 *
 * @param transport
 * @param operatorId
 * @param contractAddress
 * @param claimedAddress
 */
async function mockTransportJoinResponse(
  transport: HTTPClient,
  operatorId: Identity,
  contractAddress: Address,
  round: Round,
  claimedAddress?: any
): Promise<jest.SpyInstance> {
  const spied = jest.spyOn(transport, 'join')

  const mockedVerify = jest.spyOn(transport, 'mediator')
  mockedVerify.mockResolvedValue(contractAddress)

  let authorization: IAuthorizationMessage

  if (claimedAddress !== undefined) {
    authorization = await mkAuthorization(
      claimedAddress,
      round,
      operatorId as PrivateKeyIdentity
    )
  } else {
    authorization = NULL_AUTHORIZATION_MESSAGE
  }

  spied.mockResolvedValue(authorization)

  return spied
}
