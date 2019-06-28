// ---------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// ----------------------------------------------------------------------------

/* eslint-env jest*/
import 'jest'

import { D, etherToD } from '../../../src/common/BigNumberUtils'
import { BigNumber } from 'bignumber.js'
import {
  Address,
  SignatureSol,
  Round
} from '../../../src/common/types/BasicTypes'

import { IRootInfo } from '../../../src/common/types/OperatorAndClientTypes'

import { IApproval } from '../../../src/common/types/Approvals'

import { Proof } from '../../../src/common/types/SmartContractTypes'

import {
  ALICE_INDEX,
  BlockchainClient,
  EthereumBlockchain,
  OperatorBlockchain,
  setBalancesAndCommit
} from '../../libs/EthereumBlockchain'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'

describe('what happens when the operator decides to cancel a withdrawal', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let operator: OperatorBlockchain
  let bob: BlockchainClient
  let rootWETH: IRootInfo

  let aliceDeposit: BigNumber
  let contractUsedByAlice: MediatorAsync
  let aliceAddress: Address

  let bobAddress: Address
  let bobDeposit: BigNumber

  let contractUsedByOperator: MediatorAsync

  let withdrawalAmount: BigNumber

  let proof: Proof
  let roundOfRequest: Round

  let oax: Address
  let weth: Address

  //ApprovalsFunctions
  let approvalParams: IApproval
  let sig: SignatureSol

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

    /////////////////////////////// Round 1 begins  ////////////////////////////
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

    oax = blockchain.OAXContract.address
    weth = blockchain.WETHContract.address

    contractUsedByAlice = blockchain.getMediatorContract(alice.signer)

    withdrawalAmount = etherToD('1')

    proof = operator.computeProof(ALICE_INDEX, weth, currentRound)

    await blockchain.skipToNextRound()

    /////////////////////////////// Round 2 begins  ////////////////////////////

    await setBalancesAndCommit(
      aliceAddress,
      bobAddress,
      [aliceDeposit, D('0')],
      [bobDeposit, D('0')],
      blockchain,
      operator
    )

    await contractUsedByAlice.initiateWithdrawal(proof, withdrawalAmount)

    roundOfRequest = await contractUsedByOperator.getCurrentRound()

    //ApprovalsFunctions
    approvalParams = {
      approvalId: '12345',
      buy: { asset: oax, amount: etherToD('2') },
      sell: { asset: weth, amount: etherToD('2.0001') },
      round: 1,
      intent: 'buyAll',
      owner: 'alice',

      instanceId: blockchain.contract.address
    }

    sig = await alice.signApproval(approvalParams)
  })

  it('checks that a withdrawal request cannot be cancelled if the Mediator is in HALTED mode.', async () => {
    await blockchain.halt()

    await expect(
      contractUsedByOperator.cancelWithdrawal(
        [approvalParams],
        [sig],
        weth,
        aliceAddress
      )
    ).rejects.toThrow()
  })

  it('checks that only the operator can cancel a withdrawal request.', async () => {
    await expect(
      contractUsedByAlice.cancelWithdrawal(
        [approvalParams],
        [sig],
        weth,
        aliceAddress
      )
    ).rejects.toThrow()
  })

  it('checks that if there is no active withdrawal then the function throws', async () => {
    await contractUsedByOperator.cancelWithdrawal(
      [approvalParams],
      [sig],
      weth,
      aliceAddress
    )

    await expect(
      contractUsedByOperator.cancelWithdrawal(
        [approvalParams],
        [sig],
        weth,
        aliceAddress
      )
    ).rejects.toThrow()
  })

  it('checks that every approval must be unique', async () => {
    await expect(
      contractUsedByOperator.cancelWithdrawal(
        [approvalParams, approvalParams],
        [sig, sig],
        weth,
        aliceAddress
      )
    ).rejects.toThrow()
  })

  it('checks that the round of the approval is correct', async () => {
    approvalParams = {
      approvalId: '12345',
      buy: { asset: oax, amount: etherToD('2') },
      sell: { asset: weth, amount: etherToD('2.0001') },
      round: 2,
      intent: 'buyAll',
      owner: 'alice',

      instanceId: blockchain.contract.address
    }

    sig = await alice.signApproval(approvalParams)

    await contractUsedByOperator.cancelWithdrawal(
      [approvalParams],
      [sig],
      weth,
      aliceAddress
    )

    const wrongRound = 3

    approvalParams = {
      approvalId: '12345',
      buy: { asset: oax, amount: etherToD('2') },
      sell: { asset: weth, amount: etherToD('2.0001') },
      round: wrongRound,
      intent: 'buyAll',
      owner: 'alice',

      instanceId: blockchain.contract.address
    }

    sig = await alice.signApproval(approvalParams)

    await expect(
      contractUsedByOperator.cancelWithdrawal(
        [approvalParams],
        [sig],
        weth,
        aliceAddress
      )
    ).rejects.toThrow()
  })

  it('checks the withdrawal cannot be cancelled after a commit', async () => {
    await blockchain.skipToNextRound()

    rootWETH = operator.getRootInfo(blockchain.WETHContract.address)
    await contractUsedByOperator.commit(rootWETH, weth)

    //Cannot cancel once the root for token has been committed
    await expect(
      contractUsedByOperator.cancelWithdrawal(
        [approvalParams],
        [sig],
        weth,
        aliceAddress
      )
    ).rejects.toThrow()
  })

  it('checks the withdrawal can be cancelled during the next round but before a commit', async () => {
    await blockchain.skipToNextRound()

    ////////////////// Round 3 begins   ////////////////////////////////////////

    //Cannot cancel once the root for token has been committed, but before the commit
    // everything is fine
    await contractUsedByOperator.cancelWithdrawal(
      [approvalParams],
      [sig],
      weth,
      aliceAddress
    )
  })

  it('checks that the withdrawal request cannot be cancelled if it is legitimate', async () => {
    const legitimateAmount = etherToD('1.9999')

    approvalParams = {
      approvalId: '12345',
      buy: { asset: oax, amount: etherToD('2') },
      sell: { asset: weth, amount: legitimateAmount },
      round: 2,
      intent: 'buyAll',
      owner: 'alice',

      instanceId: blockchain.contract.address
    }

    sig = await alice.signApproval(approvalParams)

    await expect(
      contractUsedByOperator.cancelWithdrawal(
        [approvalParams],
        [sig],
        weth,
        aliceAddress
      )
    ).rejects.toThrow()
  })

  it('can cancel an over withdrawal with an approval', async () => {
    await contractUsedByOperator.cancelWithdrawal(
      [approvalParams],
      [sig],
      weth,
      aliceAddress
    )

    const activeWithdrawalRound = await contractUsedByOperator.getActiveWithdrawalRound(
      weth,
      aliceAddress
    )
    expect(activeWithdrawalRound).toEqual(0)

    const requestedWithdrawalAmount = await contractUsedByOperator.requestedWithdrawalAmount(
      roundOfRequest,
      weth,
      aliceAddress
    )
    expect(requestedWithdrawalAmount).toEqual(D('0'))

    const totalRequestedWithdrawalsAmount = await contractUsedByOperator.totalRequestedWithdrawals(
      roundOfRequest,
      weth
    )
    expect(totalRequestedWithdrawalsAmount).toEqual(D('0'))
  })
})
