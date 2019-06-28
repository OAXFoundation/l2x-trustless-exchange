// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { safeBigNumberToString, waitForMining } from '../ContractUtils'
import { Signer, Contract } from 'ethers'
import { TransactionReceipt } from 'ethers/providers'
import { D } from '../BigNumberUtils'
import { BigNumber } from 'bignumber.js'

import {
  Address,
  Amount,
  Counter,
  SignatureSol,
  Round,
  FillId,
  DisputeId
} from '../types/BasicTypes'

import { IRootInfo } from '../types/OperatorAndClientTypes'

import { MediatorMock } from '@oax/contracts/wrappers/MediatorMock'
import {
  Proof,
  IOpenDispute,
  RootInfoParams,
  IAuthorizationMessage
} from '../types/SmartContractTypes'

import { FillMediator, IFill } from '../types/Fills'

import { Approval, IApproval } from '../types/Approvals'

import { ETHToken } from '@oax/contracts/wrappers/ETHToken'
import { IMediatorAsync } from './IMediatorAsync'
import { Mediator } from '@oax/contracts/wrappers/Mediator'

export class MediatorAsync implements IMediatorAsync {
  private readonly contractWithSigner: Contract
  readonly contractAddress: Address

  constructor(signer: Signer, contract: MediatorMock | Mediator) {
    this.contractWithSigner = contract.connect(signer)
    this.contractAddress = this.contractWithSigner.address
  }

  getContractWrapper() {
    return this.contractWithSigner
  }

  async getBalance(): Promise<Amount> {
    const contractAddress = await this.contractWithSigner.address
    return D(await this.contractWithSigner.provider.getBalance(contractAddress))
  }

  async commit(rootInfo: IRootInfo, tokenAddress: Address) {
    const rootInfoSol = new RootInfoParams(
      rootInfo.content,
      rootInfo.height,
      rootInfo.width
    ).toSol()

    return await waitForMining(
      this.contractWithSigner.functions.commit(rootInfoSol, tokenAddress)
    )
  }

  async initiateWithdrawal(proof: Proof, withdrawalAmount: Amount) {
    return await waitForMining(
      this.contractWithSigner.functions.initiateWithdrawal(
        proof.toSol(),
        withdrawalAmount.toString(10)
      )
    )
  }

  async depositsToken(tokenAddress: Address, amount: Amount | number) {
    const formattedAmount = BigNumber.isBigNumber(amount)
      ? amount.toString(10)
      : amount.toString()

    return await waitForMining(
      this.contractWithSigner.functions.depositTokens(
        tokenAddress,
        formattedAmount
      )
    )
  }

  async getBlockNumberAtCreation(): Promise<number> {
    return (await this.contractWithSigner.functions.blockNumberAtCreation()).toNumber()
  }

  async getCommit(round: number, tokenAddress: Address) {
    return this.contractWithSigner.functions.commits(round, tokenAddress)
  }

  async registerToken(tokenAddress: Address) {
    return await waitForMining(
      this.contractWithSigner.functions.registerToken(tokenAddress)
    )
  }

  async unregisterToken(tokenAddress: Address) {
    return await waitForMining(
      this.contractWithSigner.functions.unregisterToken(tokenAddress)
    )
  }

  async getCurrentRound() {
    return (await this.contractWithSigner.functions.getCurrentRound()).toNumber()
  }

  async getCurrentQuarter() {
    return (await this.contractWithSigner.functions.getCurrentQuarter()).toNumber()
  }

  async skipToNextRound() {
    return await waitForMining(
      this.contractWithSigner.functions.skipToNextRound()
    )
  }

  async skipToNextQuarter() {
    return await waitForMining(
      this.contractWithSigner.functions.skipToNextQuarter()
    )
  }

  async getActiveWithdrawalRound(
    tokenAddress: Address,
    clientAddress: Address
  ): Promise<number> {
    const res = await this.contractWithSigner.functions.activeWithdrawalRounds(
      tokenAddress,
      clientAddress
    )
    return res.toNumber()
  }

  async computeBalancesInducedByFills(
    fills: FillMediator[]
  ): Promise<BigNumber[]> {
    const res = await this.contractWithSigner.functions.computeBalancesInducedByFills(
      fills.map(f => f.toSol())
    )

    return res
  }

  async updateHaltedState(): Promise<boolean> {
    await waitForMining(this.contractWithSigner.functions.updateHaltedState())

    return this.isHalted()
  }

  async isHalted(): Promise<boolean> {
    const res = await this.contractWithSigner.functions.halted()
    return res
  }

  async cancelWithdrawal(
    approvals: IApproval[],
    sigs: SignatureSol[],
    tokenAddress: Address,
    clientAddress: Address
  ) {
    return await waitForMining(
      this.contractWithSigner.functions.cancelWithdrawal(
        approvals.map(a => new Approval(a).toSol()),
        sigs,
        tokenAddress,
        clientAddress
      )
    )
  }

  async deposits(round: Round, tokenAddress: Address, clientAddress: Address) {
    return await this.contractWithSigner.functions.clientDeposits(
      round,
      tokenAddress,
      clientAddress
    )
  }

  async totalDeposits(round: Round, tokenAddress: Address) {
    return await this.contractWithSigner.functions.totalDeposits(
      round,
      tokenAddress
    )
  }

  async totalRequestedWithdrawals(round: Round, tokenAddress: Address) {
    const res = D(
      await this.contractWithSigner.functions.totalRequestedWithdrawals(
        round,
        tokenAddress
      )
    )
    return res
  }

  async requestedWithdrawalAmount(
    round: Round,
    tokenAddress: Address,
    clientAddress: Address
  ) {
    const res1 = await this.contractWithSigner.functions.clientRequestedWithdrawals(
      round,
      tokenAddress,
      clientAddress
    )

    const res = D(res1[0])
    return res
  }

  async confirmWithdrawal(tokenAddress: Address) {
    return await waitForMining(
      this.contractWithSigner.functions.confirmWithdrawal(tokenAddress)
    )
  }

  async totalDisputes(): Promise<BigNumber> {
    return await this.contractWithSigner.functions.totalDisputes()
  }

  async disputes(clientAddress: Address): Promise<IOpenDispute> {
    //Get the basic information of the dispute (open,round,quarter)
    const partialDispute = await this.contractWithSigner.functions.disputes(
      clientAddress
    )

    //Get the fills of the disputes
    const numberOfFills = await this.contractWithSigner.functions.getNumberOfFillsFromDispute(
      clientAddress
    )

    //Get the opening balances of the dispute
    const lengthOfBalancesArray = await this.contractWithSigner.functions.getBalancesArrayLengthFromDispute(
      clientAddress
    )
    let balancesArray = []

    for (let i = 0; i < lengthOfBalancesArray; i++) {
      let balance = await this.contractWithSigner.functions.getBalanceFromDispute(
        clientAddress,
        i.toString(10)
      )
      balancesArray.push(balance)
    }

    const dispute: IOpenDispute = {
      quarter: partialDispute.quarter,
      round: partialDispute.round,
      open: partialDispute.open,
      fillCount: numberOfFills,
      openingBalances: balancesArray
    }

    return dispute
  }

  async getSortedListOfregisteredTokensAddresses(): Promise<Address[]> {
    let res: Address[] = []

    let index: number = 0
    let token = await this.contractWithSigner.functions.registeredTokensAddresses(
      index
    )

    while (token != 0) {
      res.push(token)
      index++
      token = await this.contractWithSigner.functions.registeredTokensAddresses(
        index
      )
    }

    return res
  }

  async getFillFromDispute(
    disputeId: DisputeId,
    fillId: FillId
  ): Promise<IFill> {
    const res = await this.contractWithSigner.functions.disputeFills(
      disputeId.toString(),
      fillId.toString()
    )

    const fillsParam: IFill = {
      approvalId: res.approvalId.toString(),
      fillId: res.fillId.toString(),
      round: res.round.toNumber(),
      buyAmount: D(res.buyAmount.toString()),
      buyAsset: res.buyAsset.toString(),
      sellAmount: D(res.sellAmount.toString()),
      sellAsset: res.sellAsset.toString(),
      clientAddress: res.clientAddress.toString(),
      instanceId: res.instanceId.toString()
    }

    return fillsParam
  }

  public async getBalanceFromDispute(
    clientAddress: Address,
    index: Number
  ): Promise<BigNumber> {
    const res = await this.contractWithSigner.functions.getBalanceFromDispute(
      clientAddress,
      index
    )

    return D(res)
  }

  async lastActiveRound() {
    let lastActiveRound = await this.contractWithSigner.functions.haltedRound()
    return lastActiveRound.toNumber()
  }

  async lastActiveQuarter() {
    let lastActiveQuarter = await this.contractWithSigner.functions.haltedQuarter()
    return lastActiveQuarter.toNumber()
  }

  async openDispute(
    proofs: Proof[],
    fills: FillMediator[],
    sigFills: SignatureSol[],
    authorizationMessage: IAuthorizationMessage
  ) {
    return await waitForMining(
      this.contractWithSigner.functions.openDispute(
        proofs.map(p => p.toSol()),
        fills.map(f => f.toSol()),
        sigFills,
        authorizationMessage
      )
    )
  }

  async closeDispute(
    proofs: Proof[],
    approvals: Approval[],
    sigApprovals: SignatureSol[],
    fills: FillMediator[],
    sigFills: SignatureSol[],
    clientAddress: Address
  ) {
    return await waitForMining(
      this.contractWithSigner.functions.closeDispute(
        proofs.map(p => p.toSol()),
        approvals.map(a => a.toSol()),
        sigApprovals,
        fills.map(f => f.toSol()),
        sigFills,
        clientAddress
      )
    )
  }

  async checkApproval(
    approvParams: IApproval,
    sig: SignatureSol,
    clientAddress: Address
  ) {
    let approval = new Approval(approvParams)
    await this.contractWithSigner.functions.checkApprovalSig(
      approval.toSol(),
      sig,
      clientAddress
    )
  }

  async recoverAllFunds(proof: Proof) {
    return await waitForMining(
      this.contractWithSigner.functions.recoverAllFunds(proof.toSol())
    )
  }

  async recoverOnChainFundsOnly(tokenAddress: Address) {
    return await waitForMining(
      this.contractWithSigner.functions.recoverOnChainFundsOnly(tokenAddress)
    )
  }

  async isProofValid(proof: Proof, round: Round) {
    return await this.contractWithSigner.functions.isProofValid(
      proof.toSol(),
      round
    )
  }

  // Mock functions
  async setOpenDisputeCounter(
    round: Round,
    n: number
  ): Promise<TransactionReceipt> {
    return await waitForMining(
      this.contractWithSigner.setOpenDisputeCounter(round, n)
    )
  }

  async openDisputeCounters(round: Round): Promise<number> {
    const res = await this.contractWithSigner.functions.openDisputeCounters(
      round
    )

    return res.toNumber()
  }

  async setDisputeSummaryCounter(clientAddress: Address, counter: Counter) {
    return await waitForMining(
      this.contractWithSigner.functions.setDisputeSummaryCounter(
        clientAddress,
        counter
      )
    )
  }

  async setPreviousOpeningBalanceClient(
    clientAddress: Address,
    openingBalance: Amount,
    pos: number
  ) {
    return await waitForMining(
      this.contractWithSigner.functions.setPreviousOpeningBalanceClient(
        clientAddress,
        safeBigNumberToString(openingBalance),
        pos
      )
    )
  }

  async setTotalWithdrawalAmount(
    round: Round,
    tokenAddress: Address,
    amount: Amount
  ) {
    return await waitForMining(
      this.contractWithSigner.functions.setTotalWithdrawalAmount(
        round,
        tokenAddress,
        safeBigNumberToString(amount)
      )
    )
  }

  async halt() {
    return await waitForMining(this.contractWithSigner.functions.halt())
  }

  async roundSize(): Promise<BigNumber> {
    const res = await this.contractWithSigner.functions.roundSize()
    return D(res)
  }
}

export class TokenAsync {
  private contractWithSigner: ETHToken
  contractAddress: Address

  constructor(signer: Signer, contract: Contract) {
    this.contractWithSigner = contract.connect(signer) as ETHToken
    this.contractAddress = this.contractWithSigner.address
  }

  async balanceOf(address: Address): Promise<BigNumber> {
    const res = await this.contractWithSigner.functions.balanceOf(address)
    return D(res)
  }

  async allowance(owner: Address, spender: Address): Promise<BigNumber> {
    const res = await this.contractWithSigner.functions.allowance(
      owner,
      spender
    )
    return D(res)
  }

  async approve(
    to: Address,
    amount: Amount | number
  ): Promise<TransactionReceipt> {
    const formattedAmount = BigNumber.isBigNumber(amount)
      ? amount.toString(10)
      : amount.toString()

    return waitForMining(
      this.contractWithSigner.functions.approve(to, formattedAmount)
    )
  }

  async withdraw(): Promise<number> {
    const txReceipt = await waitForMining(
      this.contractWithSigner.functions.withdraw()
    )

    const gasUsed = txReceipt.gasUsed!.toNumber()
    return gasUsed
  }
}
