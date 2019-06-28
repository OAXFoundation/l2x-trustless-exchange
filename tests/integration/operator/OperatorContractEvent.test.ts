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
import { Proof } from '../../../src/common/types/SmartContractTypes'
import {
  Address,
  AssetAddress,
  IPartialProof
} from '../../../src/common/types/BasicTypes'

import { IApproval } from '../../../src/common/types/Approvals'
import { MetaLedger } from '../../../src/common/accounting/MetaLedger'
import { OAX_CONTRACT_NAME, WETH_CONTRACT_NAME } from '../../libs/SystemFixture'

describe('how the operator process mediator events', () => {
  const provider = new JsonRpcProvider(GETH_RPC_URL)
  provider.pollingInterval = 20

  let fixtures: SystemFixtures.SystemFixture
  let operator: Operator
  let client: Identity
  let metaLedger: MetaLedger

  const amountOAX = D('100')
  const amountWETH = etherToD('10')
  const amountToTradeWETH = amountWETH.div(2)

  beforeEach(async () => {
    fixtures = await SystemFixtures.createSystemFixture({
      roundSize: 100,
      assets: [WETH_CONTRACT_NAME, OAX_CONTRACT_NAME],
      operator: {
        initialETH: etherToD('1000')
      },
      runServer: false,
      mockMediator: true,
      provider
    })

    operator = fixtures.getOperator()

    client = await fixtures.getIdentityAsync({
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

    metaLedger = fixtures.getMetaLedger()
  })

  describe('When a withdrawal is successfully initiated on the mediator', () => {
    let clientAddress: Address
    let proof: Proof
    let assetWETHAddress: AssetAddress
    let assetOAXAddress: AssetAddress

    beforeEach(async () => {
      // round 0
      await fixtures.executeRoundAsync({
        Q0: [
          new SystemFixtures.JoinCommand(client),
          new SystemFixtures.SignerDepositCommand(
            client,
            OAX_CONTRACT_NAME,
            amountOAX
          ),
          new SystemFixtures.SignerDepositCommand(
            client,
            WETH_CONTRACT_NAME,
            amountToTradeWETH
          )
        ]
      })
      clientAddress = await client.getAddress()

      assetWETHAddress = fixtures.getAssetContractAddress(WETH_CONTRACT_NAME)
      assetOAXAddress = fixtures.getAssetContractAddress(OAX_CONTRACT_NAME)
    })

    it('Operator should receive a withdrawal request event from mediator', async () => {
      // Round 1
      await fixtures.skipToNextRoundAndTriggerEvents()

      const currentRound = await fixtures.getCurrentRound()
      const previousRound = currentRound - 1

      //Round 2 begins
      let proofOfStake: IPartialProof = await metaLedger.getPartialProof(
        assetOAXAddress,
        clientAddress,
        previousRound
      )
      proof = Proof.fromProofOfLiability(
        proofOfStake,
        { address: clientAddress, sum: amountOAX, round: previousRound },
        assetOAXAddress
      )

      await fixtures.executeCommandAsync(
        new SystemFixtures.SignerWithdrawalCommand(client, proof, amountOAX)
      )

      const withdrawals = await metaLedger.getWithdrawalAsync('unchecked')

      expect(withdrawals).toMatchObject([
        {
          round: 2,
          asset: fixtures.getAssetContractAddress(OAX_CONTRACT_NAME),
          wallet: clientAddress,
          amount: amountOAX
        }
      ])
    })

    it('shows that the operator can cancel an illegitimate withdrawal', async () => {
      // Round 1
      await fixtures.skipToNextRoundAndTriggerEvents()

      // Round 2
      //The client produces an approval
      const currentRound = await fixtures.getCurrentRound()
      const previousRound = currentRound - 1
      const mediatorAddress = fixtures.getMediatorAddress()

      const approval: IApproval = {
        approvalId: '87463836',
        round: currentRound,
        buy: { asset: assetWETHAddress, amount: D('100') },
        sell: { asset: assetOAXAddress, amount: amountOAX },
        intent: 'buyAll',
        owner: clientAddress,
        instanceId: mediatorAddress
      }

      const signedApproval = await client.makeSignedApproval(approval)

      await metaLedger.insertApproval(signedApproval)
      clientAddress = await client.getAddress()

      let proofOfStake = await metaLedger.getPartialProof(
        assetOAXAddress,
        clientAddress,
        previousRound
      )

      proof = Proof.fromProofOfLiability(
        proofOfStake,
        { address: clientAddress, sum: amountOAX, round: previousRound },
        assetOAXAddress
      )

      // The operator successfully cancelled the withdrawal request
      const operatorHasModeratedWithdrawal = fixtures.waitForEventOperator(
        'withdrawalModerated'
      )

      await fixtures.executeCommandAsync(
        new SystemFixtures.SignerWithdrawalCommand(client, proof, amountOAX)
      )
      await fixtures.skipToNextRoundAndTriggerEvents()

      // Round 3
      const OAXAddress = fixtures.getAssetContractAddress(OAX_CONTRACT_NAME)
      const activeWithdrawalRound = await fixtures.mediatorUsedByOperator!.getActiveWithdrawalRound(
        OAXAddress,
        clientAddress
      )

      await operatorHasModeratedWithdrawal
      expect(activeWithdrawalRound).toEqual(0)
    })
  })

  describe('Given a balance dispute was successfully opened on mediator', () => {
    const disputeRound = 0

    beforeEach(async () => {
      /////////////////// Round 0   ///////////////////////////////////////////

      await fixtures.executeCommandAsync(new SystemFixtures.JoinCommand(client))

      await fixtures.skipToNextRoundAndTriggerEvents()

      ///////////////// Round 1 begins /////////////////////////////////////////
    })

    it('operator should receive an balance dispute event', async () => {
      await fixtures.executeCommandAsync(
        new SystemFixtures.SignerDispute(client, [], [], [])
      )

      const hasDispute = await operator.hasBalanceDisputeAsync({
        round: disputeRound,
        wallet: client.address
      })

      expect(hasDispute).toBe(true)
    })

    it('Operator stores the dispute event', async () => {
      await fixtures.executeCommandAsync(
        new SystemFixtures.SignerDispute(client, [], [], [])
      )

      const hasDispute = await metaLedger.hasOpenDisputeAsync({
        round: disputeRound,
        wallet: client.address
      })

      expect(hasDispute).toBe(true)
    })
  })
})
