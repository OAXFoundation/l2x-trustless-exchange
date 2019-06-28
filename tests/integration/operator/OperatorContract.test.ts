// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

import { JsonRpcProvider } from 'ethers/providers'
import { Operator } from '../../../src/server/operator/Operator'
import { GETH_RPC_URL } from '../../../config/environment'
import { D, etherToD } from '../../../src/common/BigNumberUtils'
import * as SystemFixtures from '../../libs/SystemFixture'
import { Identity } from '../../../src/common/identity/Identity'

import { OAX_CONTRACT_NAME, WETH_CONTRACT_NAME } from '../../libs/SystemFixture'

import {
  Address,
  AssetAddress,
  Round
} from '../../../src/common/types/BasicTypes'
import { IApproval } from '../../../src/common/types/Approvals'
import {
  FillMediator,
  IFill,
  ISignedFill
} from '../../../src/common/types/Fills'
import { MetaLedger } from '../../../src/common/accounting/MetaLedger'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'
import { Proof } from '../../../src/common/types/SmartContractTypes'

describe('how the operator interacts with the mediator', () => {
  const provider = new JsonRpcProvider(GETH_RPC_URL)

  let fixtures: SystemFixtures.SystemFixture
  let operator: Operator
  let metaledger: MetaLedger

  let contractUsedByOperator: MediatorAsync

  const amountOAX = D('100')
  const amountWETH = etherToD('1')
  const amountToTradeWETH = D('40')

  let bob: Identity
  let alice: Identity

  let OAXAddress: AssetAddress
  let WETHAddress: AssetAddress

  let aliceAddress: Address
  let bobAddress: Address

  beforeEach(async () => {
    fixtures = await SystemFixtures.createSystemFixture({
      roundSize: 100,
      assets: [WETH_CONTRACT_NAME, OAX_CONTRACT_NAME],
      operator: {
        initialETH: etherToD('1000')
      },
      runServer: false,
      provider
    })

    operator = fixtures.getOperator()

    contractUsedByOperator = fixtures.getMediatorOperatorAsync()

    alice = await fixtures.getIdentityAsync({
      initialETH: amountWETH,
      initialTokens: {
        [WETH_CONTRACT_NAME]: amountToTradeWETH,
        [OAX_CONTRACT_NAME]: amountOAX
      },
      approveMediatorForTransfer: {
        [WETH_CONTRACT_NAME]: amountToTradeWETH,
        [OAX_CONTRACT_NAME]: amountOAX
      }
    })

    bob = await fixtures.getIdentityAsync({
      initialETH: amountWETH,
      initialTokens: {
        [WETH_CONTRACT_NAME]: amountToTradeWETH,
        [OAX_CONTRACT_NAME]: amountOAX
      },
      approveMediatorForTransfer: {
        [WETH_CONTRACT_NAME]: amountToTradeWETH,
        [OAX_CONTRACT_NAME]: amountOAX
      }
    })

    metaledger = fixtures.getMetaLedger()

    OAXAddress = fixtures.getAssetContractAddress(OAX_CONTRACT_NAME)
    WETHAddress = fixtures.getAssetContractAddress(WETH_CONTRACT_NAME)

    ///////////////////// Round 0 begins  //////////////////////////////////////

    await fixtures.executeCommandAsync(new SystemFixtures.JoinCommand(alice))
    await fixtures.executeCommandAsync(new SystemFixtures.JoinCommand(bob))
    aliceAddress = alice.address
    bobAddress = bob.address
  })

  describe('how dispute resolution is handled by the operator', () => {
    let currentRound: Round

    it('shows how the operator closes a simple dispute from Alice', async () => {
      await fixtures.skipToNextRoundAndTriggerEvents()

      //////////////////  Round 1 begins ///////////////////////////////////////

      await fixtures.executeCommandAsync(
        new SystemFixtures.SignerDepositCommand(
          alice,
          OAX_CONTRACT_NAME,
          amountOAX
        )
      )

      await fixtures.executeCommandAsync(
        new SystemFixtures.SignerDepositCommand(
          alice,
          WETH_CONTRACT_NAME,
          amountToTradeWETH
        )
      )

      await fixtures.skipToNextRoundAndTriggerEvents()

      //////////////////  Round 2 begins ///////////////////////////////////////

      await fixtures.executeCommandAsync(
        new SystemFixtures.SignerDispute(alice, [], [], [])
      )

      currentRound = await fixtures.getCurrentRound()

      //Check that the disputes are stored in the mediator

      let aliceDispute = await contractUsedByOperator.disputes(aliceAddress)

      expect(aliceDispute.open).toBeTruthy()

      //The operator closes the disputes
      await fixtures.executeCommandAsync(
        new SystemFixtures.OperatorClosesDispute(currentRound, aliceAddress)
      )

      //Check that the dispute is closed
      aliceDispute = await contractUsedByOperator.disputes(aliceAddress)
      expect(aliceDispute.open).toBeFalsy()
    })

    describe('How to handle complex disputes (at least one fill)', () => {
      let proof1: Proof
      let proof2: Proof

      beforeEach(async () => {
        //////////////////  Round 0 still ///////////////////////////////////////

        await fixtures.executeCommandAsync(
          new SystemFixtures.SignerDepositCommand(
            alice,
            OAX_CONTRACT_NAME,
            amountOAX
          )
        )

        await fixtures.executeCommandAsync(
          new SystemFixtures.SignerDepositCommand(
            alice,
            WETH_CONTRACT_NAME,
            amountToTradeWETH
          )
        )

        await fixtures.executeCommandAsync(
          new SystemFixtures.SignerDepositCommand(
            bob,
            OAX_CONTRACT_NAME,
            amountOAX
          )
        )

        await fixtures.executeCommandAsync(
          new SystemFixtures.SignerDepositCommand(
            bob,
            WETH_CONTRACT_NAME,
            amountToTradeWETH
          )
        )

        await fixtures.skipToNextRoundAndTriggerEvents()

        /////////////// Round 1 begins ///////////////////////////////////////////

        currentRound = await fixtures.getCurrentRound()

        proof1 = await operator.getProofClient(
          WETHAddress,
          aliceAddress,
          currentRound
        )
        proof2 = await operator.getProofClient(
          OAXAddress,
          aliceAddress,
          currentRound
        )
      })

      it('shows how the operator closes a complex dispute from Alice with a single fill', async () => {
        /////////////// Still round 1 //////////////////////////////////////////

        //Approval

        const aliceApprovalBuyAmount = amountToTradeWETH.div(2)
        const aliceApprovalSellAmount = D('10')

        const aliceApproval: IApproval = {
          approvalId: '0',
          round: currentRound,
          buy: {
            asset: WETHAddress,
            amount: aliceApprovalBuyAmount
          },
          sell: {
            asset: OAXAddress,
            amount: aliceApprovalSellAmount
          },
          intent: 'sellAll',
          owner: aliceAddress,

          instanceId: fixtures.getMediatorAddress()
        }

        const aliceSignedApproval = await alice.makeSignedApproval(
          aliceApproval
        )

        //Fill
        const aliceFill: IFill = {
          fillId: '0',
          approvalId: aliceApproval.approvalId,
          round: currentRound,
          buyAmount: aliceApproval.buy.amount,
          buyAsset: aliceApproval.buy.asset,
          sellAmount: aliceApproval.sell.amount,
          sellAsset: aliceApproval.sell.asset,
          clientAddress: aliceAddress,
          instanceId: fixtures.getMediatorAddress()
        }

        // Update the accounting information for the operator

        const aliceFillSig = await operator.signFill(aliceFill)

        const aliceSignedFill: ISignedFill = {
          params: aliceFill,
          signature: aliceFillSig
        }

        await metaledger.insertApproval(aliceSignedApproval)
        await metaledger.insertFill(aliceSignedFill)

        const bobApproval: IApproval = {
          approvalId: '1',
          round: currentRound,
          buy: {
            asset: OAXAddress,
            amount: aliceApprovalSellAmount
          },
          sell: {
            asset: WETHAddress,
            amount: aliceApprovalBuyAmount
          },
          intent: 'buyAll',
          owner: bobAddress,

          instanceId: fixtures.getMediatorAddress()
        }

        const bobSignedApproval = await alice.makeSignedApproval(bobApproval)

        //Fill
        const bobFill: IFill = {
          fillId: '1',
          approvalId: bobApproval.approvalId,
          round: currentRound,
          buyAmount: bobApproval.buy.amount,
          buyAsset: bobApproval.buy.asset,
          sellAmount: bobApproval.sell.amount,
          sellAsset: bobApproval.sell.asset,
          clientAddress: bobAddress,
          instanceId: fixtures.getMediatorAddress()
        }

        // Update the accounting information for the operator

        const bobFillSig = await operator.signFill(bobFill)

        const bobSignedFill: ISignedFill = {
          params: bobFill,
          signature: bobFillSig
        }

        await metaledger.insertApproval(bobSignedApproval)
        await metaledger.insertFill(bobSignedFill)

        const fill1Mediator = FillMediator.fromIFill(aliceFill)

        //////////////////  Round 2 begins ///////////////////////////////////////

        await fixtures.skipToNextRoundAndTriggerEvents()

        await fixtures.executeCommandAsync(
          new SystemFixtures.SignerDispute(
            alice,
            [proof1, proof2],
            [fill1Mediator],
            [aliceFillSig]
          )
        )

        const disputeProcessedEvent = fixtures.waitForEventOperator(
          'disputeProcessed'
        )

        currentRound = await fixtures.getCurrentRound()

        //Check that the disputes are stored in the mediator

        let aliceDispute = await contractUsedByOperator.disputes(aliceAddress)

        expect(aliceDispute.open).toBeTruthy()

        //The operator closes the disputes
        await fixtures.executeCommandAsync(
          new SystemFixtures.OperatorClosesDispute(currentRound, aliceAddress)
        )

        await disputeProcessedEvent

        //Check that the dispute is closed
        aliceDispute = await contractUsedByOperator.disputes(aliceAddress)
        expect(aliceDispute.open).toBeFalsy()
      })

      it('shows how the operator closes a complex dispute from Alice with a two fills corresponding to one approval', async () => {
        ////////////////////////////// Still round 1 ///////////////////////////

        //Approval

        const aliceApprovalBuyAmount = amountToTradeWETH.div(2)
        const aliceApprovalSellAmount = D('10')

        const approvalAlice: IApproval = {
          approvalId: '0',
          round: currentRound,
          buy: {
            asset: WETHAddress,
            amount: aliceApprovalBuyAmount
          },
          sell: {
            asset: OAXAddress,
            amount: aliceApprovalSellAmount
          },
          intent: 'sellAll',
          owner: aliceAddress,

          instanceId: fixtures.getMediatorAddress()
        }

        const approvalBob: IApproval = {
          approvalId: '1',
          round: currentRound,
          buy: {
            asset: OAXAddress,
            amount: aliceApprovalSellAmount
          },
          sell: {
            asset: WETHAddress,
            amount: aliceApprovalBuyAmount
          },
          intent: 'buyAll',
          owner: bobAddress,
          instanceId: fixtures.getMediatorAddress()
        }

        const signedAliceApproval = await alice.makeSignedApproval(
          approvalAlice
        )

        await metaledger.insertApproval(signedAliceApproval)

        const signedBobApproval = await bob.makeSignedApproval(approvalBob)

        await metaledger.insertApproval(signedBobApproval)

        //Fills

        const aliceFill1: IFill = {
          fillId: '0',
          approvalId: approvalAlice.approvalId,
          round: currentRound,
          buyAmount: approvalAlice.buy.amount.div(2),
          buyAsset: approvalAlice.buy.asset,
          sellAmount: approvalAlice.sell.amount.div(2),
          sellAsset: approvalAlice.sell.asset,
          clientAddress: aliceAddress,
          instanceId: fixtures.getMediatorAddress()
        }

        // Update the accounting information for the operator

        const aliceFill1Sig = await operator.signFill(aliceFill1)
        const aliceSignedFill1: ISignedFill = {
          params: aliceFill1,
          signature: aliceFill1Sig
        }

        const aliceFill2: IFill = {
          fillId: '1',
          approvalId: approvalAlice.approvalId,
          round: currentRound,
          buyAmount: approvalAlice.buy.amount.div(2),
          buyAsset: approvalAlice.buy.asset,
          sellAmount: approvalAlice.sell.amount.div(2),
          sellAsset: approvalAlice.sell.asset,
          clientAddress: aliceAddress,
          instanceId: fixtures.getMediatorAddress()
        }

        // Update the accounting information for the operator

        const aliceFill2Sig = await operator.signFill(aliceFill2)
        const aliceSignedFill2: ISignedFill = {
          params: aliceFill2,
          signature: aliceFill2Sig
        }

        const bobFill1: IFill = {
          fillId: '2',
          approvalId: approvalBob.approvalId,
          round: currentRound,
          buyAmount: approvalBob.buy.amount.div(2),
          buyAsset: approvalBob.buy.asset,
          sellAmount: approvalBob.sell.amount.div(2),
          sellAsset: approvalBob.sell.asset,
          clientAddress: bobAddress,
          instanceId: fixtures.getMediatorAddress()
        }

        // Update the accounting information for the operator

        const bobFill1Sig = await operator.signFill(bobFill1)
        const bobSignedFill1: ISignedFill = {
          params: bobFill1,
          signature: bobFill1Sig
        }

        const bobFill2: IFill = {
          fillId: '3',
          approvalId: approvalBob.approvalId,
          round: currentRound,
          buyAmount: approvalBob.buy.amount.div(2),
          buyAsset: approvalBob.buy.asset,
          sellAmount: approvalBob.sell.amount.div(2),
          sellAsset: approvalBob.sell.asset,
          clientAddress: bobAddress,
          instanceId: fixtures.getMediatorAddress()
        }

        // Update the accounting information for the operator

        const bobFill2Sig = await operator.signFill(bobFill2)
        const bobSignedFill2: ISignedFill = {
          params: bobFill2,
          signature: bobFill2Sig
        }

        await metaledger.insertFill(aliceSignedFill1)
        await metaledger.insertFill(aliceSignedFill2)

        await metaledger.insertFill(bobSignedFill1)
        await metaledger.insertFill(bobSignedFill2)

        const fill1Mediator = FillMediator.fromIFill(aliceFill1)
        const fill2Mediator = FillMediator.fromIFill(aliceFill2)

        //////////////////  Round 2 begins ///////////////////////////////////////

        await fixtures.skipToNextRoundAndTriggerEvents()

        await fixtures.executeCommandAsync(
          new SystemFixtures.SignerDispute(
            alice,
            [proof1, proof2],
            [fill1Mediator, fill2Mediator],
            [aliceFill1Sig, aliceFill2Sig]
          )
        )

        const disputeProcessedEvent = fixtures.waitForEventOperator(
          'disputeProcessed'
        )

        currentRound = await fixtures.getCurrentRound()

        //Check that the disputes are stored in the mediator

        let aliceDispute = await contractUsedByOperator.disputes(aliceAddress)

        expect(aliceDispute.open).toBeTruthy()

        //The operator closes the disputes
        await fixtures.executeCommandAsync(
          new SystemFixtures.OperatorClosesDispute(currentRound, aliceAddress)
        )

        await disputeProcessedEvent

        //Check that the dispute is closed
        aliceDispute = await contractUsedByOperator.disputes(aliceAddress)
        expect(aliceDispute.open).toBeFalsy()
      })
    })
  })
})
