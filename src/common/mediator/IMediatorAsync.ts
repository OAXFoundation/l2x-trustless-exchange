// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { TransactionReceipt } from 'ethers/providers'
import { Contract } from 'ethers'
import { BigNumber } from 'bignumber.js'

import {
  Address,
  Amount,
  Counter,
  Digest,
  SignatureSol,
  Quarter,
  Round,
  FillId
} from '../types/BasicTypes'

import { IRootInfo } from '../types/OperatorAndClientTypes'

import { IApproval } from '../types/Approvals'

import {
  Proof,
  IOpenDispute,
  IAuthorizationMessage
} from '../types/SmartContractTypes'

import { FillMediator, IFill } from '../types/Fills'

export interface IMediatorAsync {
  readonly contractAddress: Address

  getContractWrapper(): Contract

  getBalance(): Promise<Amount>
  commit(
    rootInfo: IRootInfo,
    tokenAddress: Address
  ): Promise<TransactionReceipt>

  initiateWithdrawal(
    proof: Proof,
    withdrawalAmount: Amount
  ): Promise<TransactionReceipt>

  getBlockNumberAtCreation(): Promise<number>

  getCommit(round: number, tokenAddress: Address): Promise<Digest>

  depositsToken(
    tokenAddress: Address,
    amount: Amount | number
  ): Promise<TransactionReceipt>

  getCurrentRound(): Promise<Round>

  getCurrentQuarter(): Promise<Quarter>

  skipToNextRound(): Promise<TransactionReceipt>

  skipToNextQuarter(): Promise<TransactionReceipt>

  totalRequestedWithdrawals(
    round: Round,
    tokenAddress: Address
  ): Promise<Amount>

  isHalted(): Promise<boolean>

  updateHaltedState(): Promise<boolean>

  cancelWithdrawal(
    approvals: IApproval[],
    sigs: SignatureSol[],
    tokenAddress: Address,
    clientAddress: Address
  ): Promise<TransactionReceipt>

  deposits(
    round: Round,
    tokenAddress: Address,
    clientAddress: Address
  ): Promise<Amount>

  registerToken(tokenAddress: Address): Promise<TransactionReceipt>
  unregisterToken(tokenAddress: Address): Promise<TransactionReceipt>

  totalDeposits(round: Round, tokenAddress: Address): Promise<Amount>

  confirmWithdrawal(tokenAddress: Address): Promise<TransactionReceipt>

  requestedWithdrawalAmount(
    round: Round,
    tokenAddress: Address,
    clientAddress: Address
  ): Promise<Amount>

  getActiveWithdrawalRound(
    tokenAddress: Address,
    clientAddress: Address
  ): Promise<number>

  totalDisputes(): Promise<BigNumber>

  disputes(clientAddress: Address): Promise<IOpenDispute>

  getSortedListOfregisteredTokensAddresses(): Promise<Address[]>

  getFillFromDispute(clientAddress: Address, fillId: FillId): Promise<IFill>

  getBalanceFromDispute(
    _clientAddress: Address,
    _index: number
  ): Promise<BigNumber>

  openDispute(
    proofs: Proof[],
    fills: FillMediator[],
    sigFills: SignatureSol[],
    authorizationMessage: IAuthorizationMessage
  ): Promise<TransactionReceipt>

  closeDispute(
    proofs: Proof[],
    approvals: IApproval[],
    sigApprovals: SignatureSol[],
    fills: FillMediator[],
    sigFills: SignatureSol[],
    clientAddress: Address
  ): Promise<TransactionReceipt>

  recoverAllFunds(proof: Proof): Promise<TransactionReceipt>
  recoverOnChainFundsOnly(tokenAddress: Address): Promise<TransactionReceipt>
  isProofValid(proof: Proof, round: Round): Promise<boolean>
  setOpenDisputeCounter(round: Round, n: number): Promise<TransactionReceipt>

  openDisputeCounters(round: Round): Promise<number>

  computeBalancesInducedByFills(fills: FillMediator[]): Promise<BigNumber[]>

  setDisputeSummaryCounter(
    clientAddress: Address,
    counter: Counter
  ): Promise<TransactionReceipt>

  setPreviousOpeningBalanceClient(
    clientAddress: Address,
    openingBalance: Amount,
    pos: number
  ): Promise<TransactionReceipt>

  setTotalWithdrawalAmount(
    round: Round,
    tokenAddress: Address,
    amount: Amount
  ): Promise<TransactionReceipt>

  halt(): Promise<TransactionReceipt>

  roundSize(): Promise<BigNumber>
}
