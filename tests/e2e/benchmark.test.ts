// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import {
  ALICE_INDEX,
  BlockchainClient,
  EthereumBlockchain,
  OperatorBlockchain
} from '../libs/EthereumBlockchain'
import {
  Address,
  Amount,
  IAccount,
  Round,
  SignatureSol
} from '../../src/common/types/BasicTypes'
import { MediatorAsync } from '../../src/common/mediator/Contracts'
import { Proof } from '../../src/common/types/SmartContractTypes'

import { FillMediator } from '../../src/common/types/Fills'

import { Approval, IApproval } from '../../src/common/types/Approvals'

import { D, etherToD } from '../../src/common/BigNumberUtils'

import 'jest'

function generateFills(
  numberOfFills: number,
  blockchain: EthereumBlockchain,
  currentRound: Round,
  clientAddress: Address
): FillMediator[] {
  let fillsArray: FillMediator[] = new Array(numberOfFills)
  let fillId = 0
  let approvalId = 0

  for (let i = 0; i < numberOfFills; i++) {
    approvalId = fillId
    fillsArray[i] = new FillMediator(
      fillId.toString(10),
      approvalId.toString(10),
      currentRound - 1,
      D('1'),
      blockchain.WETHContract.address,
      D('1'),
      blockchain.WETHContract.address,
      clientAddress,
      blockchain.contract.address
    )

    fillId += 1
  }

  return fillsArray
}

function generateApprovals(
  numberOfApprovals: number,
  blockchain: EthereumBlockchain,
  currentRound: Round,
  clientAddress: Address
): Approval[] {
  let approvalsArray: Approval[] = new Array(numberOfApprovals)
  let approvalId = 0

  for (let i = 0; i < numberOfApprovals; i++) {
    approvalsArray[i] = new Approval({
      approvalId: approvalId.toString(10),
      round: currentRound - 1,
      buy: { amount: D('1'), asset: blockchain.WETHContract.address },
      sell: { amount: D('1'), asset: blockchain.WETHContract.address },
      intent: 'buyAll',
      owner: clientAddress,
      instanceId: blockchain.contract.address
    })
    approvalId += 1
  }

  return approvalsArray
}

async function signApprovals(
  approvalsArray: IApproval[],
  client: BlockchainClient
): Promise<SignatureSol[]> {
  let sigs: SignatureSol[] = new Array(approvalsArray.length)

  for (let approval of approvalsArray) {
    sigs.push(await client.signApproval(approval))
  }

  return sigs
}

async function signFills(
  fillsArray: FillMediator[],
  operator: OperatorBlockchain
): Promise<SignatureSol[]> {
  let sigs: SignatureSol[] = new Array(fillsArray.length)

  for (let fill of fillsArray) {
    sigs.push(await operator.signFill(fill))
  }

  return sigs
}

/**
 * Helper function to set the balances of participants
 * @param aliceAddress address of Alice
 * @param aliceBalances array of dimension 2 with the balances of Alice.
 *        aliceBalances[0] WETH deposit
 *        aliceBalances[1] OAX deposit
 * @param blockchain blockchain object that contains the addresses of the contracts
 * @param operator operator object that will set the accounts
 */
async function setBalancesAndCommitScale(
  aliceAddress: Address,
  aliceBalances: Amount[],
  blockchain: EthereumBlockchain,
  operator: OperatorBlockchain,
  numberOfAccounts: number
) {
  const currentRound = await blockchain
    .getMediatorContract(operator.signer)
    .getCurrentRound()

  const emptyValue: IAccount = {
    address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
    sum: D('0'),
    round: currentRound
  }

  let accountsETH: IAccount[] = new Array(numberOfAccounts).fill(emptyValue)
  accountsETH[0] = {
    address: aliceAddress,
    sum: aliceBalances[0],
    round: currentRound
  }

  let accountsOAX: IAccount[] = new Array(numberOfAccounts).fill(emptyValue)
  accountsOAX[0] = {
    address: aliceAddress,
    sum: aliceBalances[1],
    round: currentRound
  }

  operator.setAccounts(accountsETH, blockchain.WETHContract.address)
  operator.setAccounts(accountsOAX, blockchain.OAXContract.address)

  const contractUsedByOperator = blockchain.getMediatorContract(
    blockchain.operator
  )

  const rootETH = operator.getRootInfo(blockchain.WETHContract.address)
  const rootOAX = operator.getRootInfo(blockchain.OAXContract.address)

  await contractUsedByOperator.commit(rootETH, blockchain.WETHContract.address)
  await contractUsedByOperator.commit(rootOAX, blockchain.OAXContract.address)
}

describe('How the client interacts with the OperatorBlockchain and the Blockchain', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let operator: OperatorBlockchain

  let aliceAddress: Address
  let aliceDepositETH: Amount
  let aliceDepositOAX: Amount

  let contractUsedByAlice: MediatorAsync
  let contractUsedByOperator: MediatorAsync

  let proofETH: Proof
  let proofOAX: Proof

  let NUMBER_OF_ACCOUNTS: number

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    /////////////////////////////// Round 0 begins  //////////////////////////////

    alice = new BlockchainClient(blockchain.alice, blockchain)
    operator = new OperatorBlockchain(blockchain)

    contractUsedByAlice = blockchain.getMediatorContract(alice.signer)
    contractUsedByOperator = blockchain.getMediatorContract(blockchain.operator)

    aliceDepositETH = etherToD('3')
    aliceDepositOAX = D('0')

    aliceAddress = await alice.getAddress()

    await alice.depositWETHTokensIntoMediator(aliceDepositETH)

    await blockchain.skipToNextRound()

    /////////////////////////////// Round 1 begins  //////////////////////////////
    //The operator commits to the new roots

    let currentRound = await contractUsedByAlice.getCurrentRound()

    NUMBER_OF_ACCOUNTS = 2 ** 10

    await setBalancesAndCommitScale(
      aliceAddress,
      [aliceDepositETH, aliceDepositOAX],
      blockchain,
      operator,
      NUMBER_OF_ACCOUNTS
    )

    proofETH = operator.computeProof(
      ALICE_INDEX,
      blockchain.WETHContract.address,
      currentRound
    )

    proofOAX = operator.computeProof(
      ALICE_INDEX,
      blockchain.OAXContract.address,
      currentRound
    )

    await blockchain.skipToNextRound()
  })

  it('evaluates the performance of Mediator.initWithdrawal', async () => {
    //////////////////////////// Round 2 begins ///////////////////////////////

    const aliceOpeningBalance = aliceDepositETH
    const withdrawalAmount = aliceOpeningBalance

    await expect(
      contractUsedByAlice.initiateWithdrawal(proofETH, withdrawalAmount)
    ).resolves.not.toThrow()
  })

  it('evaluates the performance of Mediator.openDispute.', async () => {
    /////////////////////////////// Round 2 begins  //////////////////////////////

    let currentRound = await contractUsedByOperator.getCurrentRound()

    const NUMBER_OF_FILLS = 35

    //With NUMBER_OF_FILLS + 1 the mediator raises an exception

    let fills = generateFills(
      NUMBER_OF_FILLS + 1,
      blockchain,
      currentRound,
      aliceAddress
    )

    let sigFills = await signFills(fills, operator)

    const proofs = [proofETH, proofOAX]
    const authorizationMessage = await operator.getDummyAuthorizationMessage()

    //await expect(
    await contractUsedByAlice.openDispute(
      proofs,
      fills,
      sigFills,
      authorizationMessage
    )
    //).rejects.toThrow()

    //With NUMBER_OF_FILLS the mediator the dispute is opened successfully

    fills = generateFills(
      NUMBER_OF_FILLS,
      blockchain,
      currentRound,
      aliceAddress
    )

    sigFills = await signFills(fills, operator)

    const txInfo = await contractUsedByAlice.openDispute(
      proofs,
      fills,
      sigFills,
      authorizationMessage
    )

    const gasUsed = txInfo.gasUsed!.toNumber()

    expect(gasUsed).toBeGreaterThan(500000)
  })

  it('evaluates the performance of Mediator.closeDispute.', async () => {
    /////////////////////////////// Round 2 begins  //////////////////////////////

    let currentRound = await contractUsedByOperator.getCurrentRound()

    //The operator commits to the new roots
    await setBalancesAndCommitScale(
      aliceAddress,
      [aliceDepositETH, aliceDepositOAX],
      blockchain,
      operator,
      NUMBER_OF_ACCOUNTS
    )

    const NUMBER_OF_APPROVALS = 35
    const NUMBER_OF_FILLS = NUMBER_OF_APPROVALS

    let approvals = generateApprovals(
      NUMBER_OF_APPROVALS,
      blockchain,
      currentRound,
      aliceAddress
    )

    let sigApprovals = await signApprovals(approvals, alice)

    let fills = generateFills(
      NUMBER_OF_FILLS,
      blockchain,
      currentRound,
      aliceAddress
    )

    let sigFills = await signFills(fills, operator)

    const proofs = [proofETH, proofOAX]
    const authorizationMessage = await operator.getDummyAuthorizationMessage()

    await contractUsedByAlice.openDispute(
      proofs,
      fills,
      sigFills,
      authorizationMessage
    )

    let proofETHRound2 = operator.computeProof(
      ALICE_INDEX,
      blockchain.WETHContract.address,
      currentRound
    )

    let proofOAXRound2 = operator.computeProof(
      ALICE_INDEX,
      blockchain.OAXContract.address,
      currentRound
    )

    const txInfo = await contractUsedByOperator.closeDispute(
      [proofETHRound2, proofOAXRound2],
      approvals,
      sigApprovals,
      fills,
      sigFills,
      aliceAddress
    )

    const gasUsed = txInfo.gasUsed!.toNumber()

    expect(gasUsed).toBeGreaterThan(1500000)
  })

  it('evaluates the performance of Mediator.recoverAllfunds.', async () => {
    /////////////////////////////// Round 2 begins  //////////////////////////////

    //The operator commits to the new roots
    await setBalancesAndCommitScale(
      aliceAddress,
      [aliceDepositETH, aliceDepositOAX],
      blockchain,
      operator,
      NUMBER_OF_ACCOUNTS
    )

    await blockchain.skipToNextRound()

    /////////////////////////////// Round 3 begins  //////////////////////////////

    //The operator commits to the new roots
    await setBalancesAndCommitScale(
      aliceAddress,
      [aliceDepositETH, aliceDepositOAX],
      blockchain,
      operator,
      NUMBER_OF_ACCOUNTS
    )

    await contractUsedByOperator.halt()

    await contractUsedByAlice.recoverAllFunds(proofETH)
  })
})
