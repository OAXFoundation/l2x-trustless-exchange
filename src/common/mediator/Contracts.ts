// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { safeBigNumberToString, waitForMining } from '../ContractUtils'
import { Signer, Contract, providers } from 'ethers'
import { TransactionReceipt } from 'ethers/providers'
import { D } from '../BigNumberUtils'
import { BigNumber } from 'bignumber.js'

import winston from 'winston'

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
  private readonly logger?: winston.LoggerInstance
  private methodGasLimit = {
    commit: 200000
  }
  private gasLimit: number = 0
  private gasPrice: number = 0

  constructor(
    signer: Signer,
    contract: MediatorMock | Mediator,
    logger?: winston.LoggerInstance
  ) {
    this.contractWithSigner = contract.connect(signer)
    this.contractAddress = this.contractWithSigner.address
    this.logger = logger
  }

  private async waitForMiningAndLog(
    txPromise: Promise<providers.TransactionResponse>
  ): Promise<providers.TransactionReceipt> {
    const tx = await txPromise

    if (this.logger) {
      this.logger.info('Transaction sent:', {
        gasPrice: tx.gasPrice.toString(),
        gasLimit: tx.gasLimit.toString(),
        txHash: tx.hash
      })
    }

    return tx.wait()
  }

  public setGasLimit(gasLimit: number) {
    this.gasLimit = gasLimit
  }

  public setGasPrice(gasPrice: number) {
    this.gasPrice = gasPrice
  }

  private getGasLimitParams() {
    let opts: any = {}

    if (this.gasLimit !== 0) {
      opts.gasLimit = this.gasLimit
    }

    if (this.gasPrice !== 0) {
      opts.gasPrice = this.gasPrice
    }

    return opts
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

    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.commit(rootInfoSol, tokenAddress, {
        ...this.getGasLimitParams(),
        gasLimit: this.methodGasLimit.commit
      })
    )
  }

  async initiateWithdrawal(proof: Proof, withdrawalAmount: Amount) {
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.initiateWithdrawal(
        proof.toSol(),
        withdrawalAmount.toString(10),
        this.getGasLimitParams()
      )
    )
  }

  async depositsToken(tokenAddress: Address, amount: Amount | number) {
    const formattedAmount = BigNumber.isBigNumber(amount)
      ? amount.toString(10)
      : amount.toString()

    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.depositTokens(
        tokenAddress,
        formattedAmount,
        this.getGasLimitParams()
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
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.registerToken(
        tokenAddress,
        this.getGasLimitParams()
      )
    )
  }

  async unregisterToken(tokenAddress: Address) {
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.unregisterToken(
        tokenAddress,
        this.getGasLimitParams()
      )
    )
  }

  async getCurrentRound() {
    return (await this.contractWithSigner.functions.getCurrentRound()).toNumber()
  }

  async getCurrentQuarter() {
    return (await this.contractWithSigner.functions.getCurrentQuarter()).toNumber()
  }

  async skipToNextRound() {
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.skipToNextRound(
        this.getGasLimitParams()
      )
    )
  }

  async skipToNextQuarter() {
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.skipToNextQuarter(
        this.getGasLimitParams()
      )
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
    await this.waitForMiningAndLog(
      this.contractWithSigner.functions.updateHaltedState(
        this.getGasLimitParams()
      )
    )

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
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.cancelWithdrawal(
        approvals.map(a => new Approval(a).toSol()),
        sigs,
        tokenAddress,
        clientAddress,
        this.getGasLimitParams()
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
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.confirmWithdrawal(
        tokenAddress,
        this.getGasLimitParams()
      )
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
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.openDispute(
        proofs.map(p => p.toSol()),
        fills.map(f => f.toSol()),
        sigFills,
        authorizationMessage,
        this.getGasLimitParams()
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
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.closeDispute(
        proofs.map(p => p.toSol()),
        approvals.map(a => a.toSol()),
        sigApprovals,
        fills.map(f => f.toSol()),
        sigFills,
        clientAddress,
        this.getGasLimitParams()
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
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.recoverAllFunds(
        proof.toSol(),
        this.getGasLimitParams()
      )
    )
  }

  async recoverOnChainFundsOnly(tokenAddress: Address) {
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.recoverOnChainFundsOnly(
        tokenAddress,
        this.getGasLimitParams()
      )
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
    return await this.waitForMiningAndLog(
      this.contractWithSigner.setOpenDisputeCounter(
        round,
        n,
        this.getGasLimitParams()
      )
    )
  }

  async openDisputeCounters(round: Round): Promise<number> {
    const res = await this.contractWithSigner.functions.openDisputeCounters(
      round
    )

    return res.toNumber()
  }

  async setDisputeSummaryCounter(clientAddress: Address, counter: Counter) {
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.setDisputeSummaryCounter(
        clientAddress,
        counter,
        this.getGasLimitParams()
      )
    )
  }

  async setPreviousOpeningBalanceClient(
    clientAddress: Address,
    openingBalance: Amount,
    pos: number
  ) {
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.setPreviousOpeningBalanceClient(
        clientAddress,
        safeBigNumberToString(openingBalance),
        pos,
        this.getGasLimitParams()
      )
    )
  }

  async setTotalWithdrawalAmount(
    round: Round,
    tokenAddress: Address,
    amount: Amount
  ) {
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.setTotalWithdrawalAmount(
        round,
        tokenAddress,
        safeBigNumberToString(amount),
        this.getGasLimitParams()
      )
    )
  }

  async halt() {
    return await this.waitForMiningAndLog(
      this.contractWithSigner.functions.halt(this.getGasLimitParams())
    )
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
