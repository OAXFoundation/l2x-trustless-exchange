// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'

import { Address, Amount, Round } from '../../../src/common/types/BasicTypes'

import { L2Client } from '../../../src/client/operator/L2Client'

import { D, etherToD } from '../../../src/common/BigNumberUtils'

import { JsonRpcProvider } from 'ethers/providers'
import { FEE_AMOUNT_WEI, GETH_RPC_URL } from '../../../config/environment'
import { Identity } from '../../../src/common/identity/Identity'
import * as SystemFixtures from '../../libs/SystemFixture'

import { MediatorMock } from '../../../src/contracts/wrappers/MediatorMock'
import {
  CONSTANT_FEE,
  OAX_CONTRACT_NAME,
  SignerConfig,
  WETH_CONTRACT_NAME
} from '../../libs/SystemFixture'

import { ClientAuditCommand } from '../../libs/SystemFixture'
import {
  IOpenDispute,
  Proof
} from '../../../src/common/types/SmartContractTypes'
import { OperatorMock } from '../../../src/server/operator/Operator'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'
import { IFill, ISignedFill } from '../../../src/common/types/Fills'
import {
  ApprovalsFunctions,
  IApproval
} from '../../../src/common/types/Approvals'
import { AuditError } from '../../../src/common/Errors'

describe('How the client interacts with other components', () => {
  describe('the main functions of the client.', () => {
    const provider = new JsonRpcProvider(GETH_RPC_URL)

    let OAXAddress: Address
    let WETHAddress: Address

    let fixtures: SystemFixtures.SystemFixture
    let operatorIdentity: Identity
    let alice: L2Client
    let bob: L2Client
    let mediatorOperator: MediatorMock

    let operator: OperatorMock
    let mediatorAsync: MediatorAsync

    let amountWETHAlice: Amount = etherToD('10')
    let amountOAXAlice: Amount = FEE_AMOUNT_WEI.multipliedBy(2)
    let amountToTradeWETHAlice: Amount = amountWETHAlice.div(2)

    beforeEach(async () => {
      fixtures = await SystemFixtures.createSystemFixture({
        // Round size has to be long enough for fixtures initialization to
        // complete. Need 1 block to register the asset contract, and another
        // block to control movement to the next quarter
        roundSize: 8,
        assets: [WETH_CONTRACT_NAME, OAX_CONTRACT_NAME],
        operator: {
          initialETH: etherToD('1000')
        },
        runServer: true,
        mockMediator: true,
        provider
      })

      operatorIdentity = fixtures.getOperator().identity

      OAXAddress = fixtures.getAssetContractAddress(OAX_CONTRACT_NAME)
      WETHAddress = fixtures.getAssetContractAddress(WETH_CONTRACT_NAME)

      ///////////////////////// Round 0 begins /////////////////////////////////

      const configAlice: SignerConfig = {
        initialETH: amountWETHAlice,
        initialTokens: {
          [WETH_CONTRACT_NAME]: amountToTradeWETHAlice,
          [OAX_CONTRACT_NAME]: amountOAXAlice
        },
        approveMediatorForTransfer: {
          [WETH_CONTRACT_NAME]: amountToTradeWETHAlice,
          [OAX_CONTRACT_NAME]: amountOAXAlice
        }
      }

      const configBob: SignerConfig = configAlice

      alice = await fixtures.getClientAsync(configAlice)
      bob = await fixtures.getClientAsync(configBob)
      operator = fixtures.getOperator()
      mediatorAsync = fixtures.getMediatorOperatorAsync()

      mediatorOperator = fixtures.getMediator(operatorIdentity) as MediatorMock

      await fixtures.executeCommandAsync(new SystemFixtures.JoinCommand(alice))
      await fixtures.executeCommandAsync(new SystemFixtures.JoinCommand(bob))
    })

    afterEach(async () => {
      await alice.leave()
      await bob.leave()
      await fixtures.stopServer()
    })

    it('The client can check for the halted status', async () => {
      await expect(alice.isHalted()).resolves.toEqual(false)
      await mediatorOperator.halt()
      await expect(alice.isHalted()).resolves.toEqual(true)
    })

    describe('How the client verifies a proof from the operator', () => {
      let proof: Proof

      let currentRound: Round

      beforeEach(async () => {
        //Skip to the next round in order to commit the root
        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 1 begins ///////////////////////////////

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 2 begins ///////////////////////////////

        currentRound = (await mediatorOperator.functions.getCurrentRound()).toNumber()

        proof = (await alice.fetchProofs(currentRound))[0]
      })

      it('validates proof of stake from operator', async () => {
        await expect(
          alice.checkProof(proof, currentRound)
        ).resolves.not.toThrow()
      })

      it('throws exception when openingBalance proof is not correct', async () => {
        const wrongOpeningBalance = D('10')
        proof.sums[0] = wrongOpeningBalance

        await expect(alice.checkProof(proof, currentRound)).rejects.toThrow(
          /Invalid Proof Of Stake/i
        )
      })
    })

    describe('How the client recovers funds', () => {
      let openingWalletBalance: Amount
      let recoveryCompleted: Promise<any>

      beforeEach(async () => {
        openingWalletBalance = await alice.getBalanceTokenOnChain(OAXAddress)

        await fixtures.executeCommandAsync(
          new SystemFixtures.ClientDepositCommand(
            alice,
            OAX_CONTRACT_NAME,
            amountOAXAlice
          )
        )

        recoveryCompleted = alice.waitForEvent('recoveryCompleted')
      })

      it('is possible for the client to recover his funds without a proof', async () => {
        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 1 begins ///////////////////////////////

        await mediatorOperator.functions.halt()

        await recoveryCompleted

        const closingWalletBalance = await alice.getBalanceTokenOnChain(
          OAXAddress
        )

        expect(openingWalletBalance).toEqual(closingWalletBalance)
      })

      it('is possible for the client to recover his funds with a proof', async () => {
        let currentRound: Round

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 1 begins ///////////////////////////////

        //So that the proofs of round 1 are fetched
        await fixtures.executeCommandAsync(new ClientAuditCommand(alice))

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 2 begins ///////////////////////////////

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 3 begins ///////////////////////////////

        currentRound = (await mediatorOperator.functions.getCurrentRound()).toNumber()
        expect(currentRound).toEqual(3)

        //Halting after we have proof for r and r is confirmed
        await mediatorOperator.functions.halt()

        await recoveryCompleted

        const closingWalletBalance = await alice.getBalanceTokenOnChain(
          OAXAddress
        )

        expect(openingWalletBalance).toEqual(closingWalletBalance)
      })
    })

    describe('How the client can make a deposit and withdrawals on the blockchain', () => {
      const amountOAX = D('100')

      // Because of the long test time, we don't do full isolation here

      beforeEach(async () => {
        await fixtures.skipToNextRoundAndTriggerEvents()
      })

      it('allows Alice to make some deposit in the Mediator contract', async () => {
        ///////////////////////// Round 1 begins ///////////////////////////////

        const balanceAliceBefore = await alice.getBalanceTokenOnChain(
          OAXAddress
        )

        await fixtures.executeCommandAsync(
          new SystemFixtures.ClientDepositCommand(
            alice,
            OAX_CONTRACT_NAME,
            amountOAX
          )
        )

        const balanceAliceAfter = await alice.getBalanceTokenOnChain(OAXAddress)

        const delta = balanceAliceBefore.minus(balanceAliceAfter)

        expect(delta).toEqual(amountOAX)
      })

      it(
        'shows that if a withdrawal request of round r hits the blockchain during round r+1 and gets rejected, ' +
          'then ledger is not updated and thus remains consistent',
        async () => {
          ///////////////////////// Round 1 begins ///////////////////////////////

          await fixtures.executeCommandAsync(
            new SystemFixtures.ClientDepositCommand(
              alice,
              OAX_CONTRACT_NAME,
              amountOAX
            )
          )
          await fixtures.skipToNextRoundAndTriggerEvents()

          ///////////////////////// Round 2 begins ///////////////////////////////

          const currentRound = (await mediatorOperator.functions.getCurrentRound()).toNumber()
          expect(currentRound).toEqual(2)

          await fixtures.skipToNextRoundAndTriggerEvents()

          ///////////////////////// Round 3 begins ///////////////////////////////

          await fixtures.skipToNextRoundAndTriggerEvents()

          // Now we are in round 4 yet we are going to assume that alice is still in round 3 when initiating the withdrawal

          jest.spyOn(alice, 'round', 'get').mockReturnValue(3)

          let balanceAfterWithdrawal = await alice.getBalanceTokenOffChain(
            OAXAddress,
            3
          )
          expect(balanceAfterWithdrawal).toEqual(amountOAX)

          await expect(
            fixtures.executeCommandAsync(
              new SystemFixtures.ClientWithdrawCommand(
                alice,
                OAXAddress,
                amountOAX
              )
            )
          ).rejects.toThrow()

          // The balance remains unchanged as the withdrawal request has been rejected
          balanceAfterWithdrawal = await alice.getBalanceTokenOffChain(
            OAXAddress,
            3
          )
          expect(balanceAfterWithdrawal).toEqual(amountOAX)

          balanceAfterWithdrawal = await alice.getBalanceTokenOffChain(
            OAXAddress,
            4
          )
          expect(balanceAfterWithdrawal).toEqual(amountOAX)
        }
      )

      it('allows Alice to initiate and confirm withdrawals', async () => {
        ///////////////////////// Round 1 begins ///////////////////////////////

        await fixtures.executeCommandAsync(
          new SystemFixtures.ClientDepositCommand(
            alice,
            OAX_CONTRACT_NAME,
            amountOAX
          )
        )
        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 2 begins ///////////////////////////////

        const currentRound = (await mediatorOperator.functions.getCurrentRound()).toNumber()
        expect(currentRound).toEqual(2)

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 3 begins ///////////////////////////////

        await fixtures.executeCommandAsync(
          new SystemFixtures.ClientWithdrawCommand(alice, OAXAddress, amountOAX)
        )

        const balanceAfterWithdrawal = await alice.getBalanceTokenOnChain(
          OAXAddress
        )
        expect(balanceAfterWithdrawal).toEqual(amountOAXAlice.minus(amountOAX))

        //Skip 2 rounds in order to confirm the withdrawal
        await fixtures.skipToNextRoundAndTriggerEvents()
        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 4 begins ///////////////////////////////

        const withdrawalConfirmedEvent = alice.waitForEvent(
          'WithdrawalConfirmed'
        )

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 5 begins ///////////////////////////////

        await fixtures.skipToNextQuarterAndTriggerEvents()
        //The withdrawal confirmation is done implicitly by the client
        await withdrawalConfirmedEvent

        const newBalanceAlice = await alice.getBalanceTokenOnChain(OAXAddress)
        expect(newBalanceAlice).toEqual(amountOAXAlice)

        // The balance remains unchanged as the withdrawal request has been rejected
        let balanceAfterWithdrawalOffChain = await alice.getBalanceTokenOffChain(
          OAXAddress,
          5
        )
        expect(balanceAfterWithdrawalOffChain).toEqual(D('0'))
      })

      it('allows Alice to initiate and confirm a withdrawal after 2+ rounds', async () => {
        ///////////////////////// Round 1 begins ///////////////////////////////

        await fixtures.executeCommandAsync(
          new SystemFixtures.ClientDepositCommand(
            alice,
            OAX_CONTRACT_NAME,
            amountOAX
          )
        )
        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 2 begins ///////////////////////////////

        const currentRound = (await mediatorOperator.functions.getCurrentRound()).toNumber()
        expect(currentRound).toEqual(2)

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 3 begins ///////////////////////////////

        await alice.withdraw(OAXAddress, amountOAX)

        const balanceAfterWithdrawal = await alice.getBalanceTokenOnChain(
          OAXAddress
        )
        expect(balanceAfterWithdrawal).toEqual(amountOAXAlice.minus(amountOAX))

        //Skip 2 rounds in order to confirm the withdrawal
        await fixtures.skipToNextRoundNoEvent()

        ///////////////////////// Round 4 begins ///////////////////////////////

        for (let i = 0; i < 7; i++) {
          await fixtures.skipToNextRoundNoEvent()
        }

        ///////////////////////// Round 11 begins //////////////////////////////
        const withdrawalConfirmedEvent = alice.waitForEvent(
          'WithdrawalConfirmed'
        )
        await fixtures.skipToNextQuarterAndTriggerEvents()
        //The withdrawal confirmation is done implicitly by the client
        await withdrawalConfirmedEvent

        const newBalanceAlice = await alice.getBalanceTokenOnChain(OAXAddress)
        expect(newBalanceAlice).toEqual(amountOAXAlice)
      })
    })

    describe('how Alice and Bob opening each a dispute that the operator closes', () => {
      let amountOAX = FEE_AMOUNT_WEI.multipliedBy(2)
      let amountWETH = D('100')

      beforeEach(async () => {
        await fixtures.executeCommandAsync(
          new SystemFixtures.ClientDepositCommand(
            alice,
            OAX_CONTRACT_NAME,
            amountOAX
          )
        )

        await fixtures.executeCommandAsync(
          new SystemFixtures.ClientDepositCommand(
            bob,
            OAX_CONTRACT_NAME,
            amountOAX
          )
        )

        await fixtures.executeCommandAsync(
          new SystemFixtures.ClientDepositCommand(
            alice,
            WETH_CONTRACT_NAME,
            amountWETH
          )
        )

        await fixtures.executeCommandAsync(
          new SystemFixtures.ClientDepositCommand(
            bob,
            WETH_CONTRACT_NAME,
            amountWETH
          )
        )

        ///////////////////////// Round 1 begins ///////////////////////////////

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 2 begins ///////////////////////////////

        await fixtures.skipToNextRoundAndTriggerEvents()
      })

      it('Without approvals nor fills', async () => {
        ///////////////////////// Round 3 begins ///////////////////////////////

        let currentRound = await fixtures.getCurrentRound()

        await alice.openBalanceDispute(currentRound)
        await bob.openBalanceDispute(currentRound)

        let numberOfDisputesOnChain = await fixtures.mediatorUsedByOperator!.openDisputeCounters(
          currentRound
        )

        expect(numberOfDisputesOnChain).toEqual(2)

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 4 begins ///////////////////////////////

        await fixtures.skipToNextQuarterAndTriggerEvents()

        currentRound = await fixtures.getCurrentRound()

        // The operator should have closed the disputes
        numberOfDisputesOnChain = await fixtures.mediatorUsedByOperator!.openDisputeCounters(
          currentRound
        )

        expect(numberOfDisputesOnChain).toEqual(0)
      })

      it('With approvals and fills', async () => {
        ///////////////////////// Round 3 begins ///////////////////////////////

        // Some trading happens

        let currentRound = await fixtures.getCurrentRound()
        let mediatorAddress = fixtures.getMediatorAddress()

        const orderAlice: IApproval = {
          approvalId: ApprovalsFunctions.generateUniqueIdentifier(
            currentRound,
            OAXAddress,
            D('1'),
            WETHAddress,
            D('1'),
            'buyAll'
          ),
          round: currentRound,
          buy: { asset: OAXAddress, amount: D('1') },
          sell: { asset: WETHAddress, amount: D('1') },
          intent: 'buyAll',
          owner: alice.address,

          instanceId: mediatorAddress
        }

        const feeAlice: IApproval = {
          approvalId: ApprovalsFunctions.generateUniqueIdentifier(
            currentRound,
            OAXAddress,
            D('0'),
            OAXAddress,
            CONSTANT_FEE,
            'sellAll'
          ),
          round: currentRound,
          buy: { asset: OAXAddress, amount: D('0') },
          sell: { asset: OAXAddress, amount: CONSTANT_FEE },
          intent: 'sellAll',
          owner: alice.address,

          instanceId: mediatorAddress
        }

        const orderBob: IApproval = {
          approvalId: ApprovalsFunctions.generateUniqueIdentifier(
            currentRound,
            WETHAddress,
            D('1'),
            OAXAddress,
            D('1'),
            'sellAll'
          ),
          round: currentRound,
          buy: { asset: WETHAddress, amount: D('1') },
          sell: { asset: OAXAddress, amount: D('1') },
          intent: 'sellAll',
          owner: bob.address,

          instanceId: mediatorAddress
        }

        const feeBob: IApproval = {
          approvalId: ApprovalsFunctions.generateUniqueIdentifier(
            currentRound,
            OAXAddress,
            D('0'),
            OAXAddress,
            CONSTANT_FEE,
            'sellAll'
          ),
          round: currentRound,
          buy: { asset: OAXAddress, amount: D('0') },
          sell: { asset: OAXAddress, amount: CONSTANT_FEE },
          intent: 'sellAll',
          owner: bob.address,

          instanceId: mediatorAddress
        }

        await alice.createOrder(orderAlice, feeAlice)
        await bob.createOrder(orderBob, feeBob)

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 4 begins ///////////////////////////////

        currentRound = await fixtures.getCurrentRound()

        await alice.openBalanceDispute(currentRound)
        await bob.openBalanceDispute(currentRound)

        let numberOfDisputesOnChain = await fixtures.mediatorUsedByOperator!.openDisputeCounters(
          currentRound
        )

        expect(numberOfDisputesOnChain).toEqual(2)

        await fixtures.skipToNextRoundAndTriggerEvents()

        ///////////////////////// Round 5 begins ///////////////////////////////

        await fixtures.skipToNextQuarterAndTriggerEvents()

        // The operator should have closed the disputes
        numberOfDisputesOnChain = await fixtures.mediatorUsedByOperator!.openDisputeCounters(
          currentRound
        )

        expect(numberOfDisputesOnChain).toEqual(0)
      })
    })

    describe('How the client performs an audit', () => {
      it('fails when the client tries to audit during round 0', async () => {
        await expect(alice.audit()).rejects.toThrow(new AuditError())
      })

      describe('when round > 0', () => {
        let currentRound: Round

        beforeEach(async () => {
          //Skip to the next round in order to commit the root

          ///////////////////////// Round 1 begins ///////////////////////////////

          await fixtures.skipToNextRoundAndTriggerEvents()

          await fixtures.executeCommandAsync(
            new SystemFixtures.ClientDepositCommand(
              alice,
              WETH_CONTRACT_NAME,
              D('10')
            )
          )

          //Enable Alice to fetch and store the proofs
          await alice.audit()

          await fixtures.skipToNextRoundAndTriggerEvents()

          ///////////////////////// Round 2 begins ///////////////////////////////
          currentRound = (await mediatorOperator.functions.getCurrentRound()).toNumber()
          expect(currentRound).toEqual(2)
        })

        it('shows that the client stores the (correct) proofs from the operator', async () => {
          ///////////////////////// Still round 2   //////////////////////////////

          let proofWETH = await alice.getProofAsync(WETHAddress, currentRound)
          expect(proofWETH).toEqual(undefined)

          let proofOAX = await alice.getProofAsync(OAXAddress, currentRound)
          expect(proofOAX).toEqual(undefined)

          await alice.audit()

          const expectedProofWETH = await operator.getProofClient(
            WETHAddress,
            alice.address,
            currentRound
          )
          const expectedProofOAX = await operator.getProofClient(
            OAXAddress,
            alice.address,
            currentRound
          )

          proofWETH = await alice.getProofAsync(WETHAddress, currentRound)
          expect(proofWETH).toEqual(expectedProofWETH)

          proofOAX = await alice.getProofAsync(OAXAddress, currentRound)
          expect(proofOAX).toEqual(expectedProofOAX)
        })

        it('shows that the client opens a dispute when the proofs sent by the operator are incorrect', async () => {
          let metaledger = fixtures.getMetaLedger()

          //Alter the balance of Alice so that the proof computed by the operator is incorrect
          const fill: IFill = {
            fillId: '9798',
            approvalId: '871233',
            round: currentRound - 1,
            buyAmount: D('1'),
            buyAsset: OAXAddress,
            sellAmount: D('3'),
            sellAsset: WETHAddress,
            clientAddress: alice.address,
            instanceId: fixtures.getMediatorAddress()
          }

          const approval: IApproval = {
            approvalId: fill.approvalId,
            round: fill.round,
            buy: { asset: fill.buyAsset, amount: fill.buyAmount },
            sell: { asset: fill.sellAsset, amount: fill.sellAmount },
            owner: fill.clientAddress,
            intent: 'buyAll',

            instanceId: fixtures.getMediatorAddress()
          }

          const signedApproval = await alice.makeSignedApproval(approval)
          await metaledger.insertApproval(signedApproval)

          const sigFill = await operator.signFill(fill)
          const signedFill: ISignedFill = { params: fill, signature: sigFill }

          await metaledger.insertFill(signedFill)

          await alice.ledger.insertApproval(signedApproval)
          await alice.insertFill(signedFill)
          //There is no open dispute before the audit
          let dispute: IOpenDispute

          dispute = await mediatorAsync.disputes(alice.address)
          expect(dispute.open).toBeFalsy()

          await alice.audit()

          //Some of the proofs are incorrect and thus no proof is stored
          let proofWETH = await alice.getProofAsync(WETHAddress, currentRound)
          expect(proofWETH).toEqual(undefined)

          let proofOAX = await alice.getProofAsync(OAXAddress, currentRound)
          expect(proofOAX).toEqual(undefined)

          //The client has opened a dispute that contains a fill
          dispute = await mediatorAsync.disputes(alice.address)
          expect(dispute.open).toBeTruthy()
          expect(dispute.fillCount.toString()).toEqual('1')
        })
      })
    })
  })
})
