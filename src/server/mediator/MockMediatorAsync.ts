// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { TransactionReceipt } from 'ethers/providers'
import { Contract } from 'ethers'
import BigNumber from 'bignumber.js'

import {
  Address,
  Amount,
  Counter,
  Digest,
  SignatureSol,
  Quarter,
  Round,
  FillId
} from '../../common/types/BasicTypes'

import { D } from '../../common/BigNumberUtils'
import { IRootInfo } from '../../common/types/OperatorAndClientTypes'
import { IApproval } from '../../common/types/Approvals'
import { IFill } from '../../common/types/Fills'
import {
  Proof,
  IOpenDispute,
  IAuthorizationMessage
} from '../../common/types/SmartContractTypes'
import { FillMediator } from '../../common/types/Fills'
import { IMediatorAsync } from '../../common/mediator/IMediatorAsync'
import { SOME_ADDRESS } from '../../../tests/libs/EthereumBlockchain'

export class MockProvider {
  handlers: Map<string, Function> = new Map()
  on(eventName: string, handler: Function) {
    this.handlers.set(eventName, handler)
  }

  removeAllListeners(eventName: string): void {
    this.handlers.delete(eventName)
  }
}

export class MockWrapper {
  handlers: Map<string, Function> = new Map()
  provider: any = new MockProvider()

  on(eventName: string, handler: Function) {
    this.handlers.set(eventName, handler)
  }

  handle(eventName: string, params: any): any {
    const handler = this.handlers.get(eventName)
    if (handler == null) {
      throw Error(`Missing handler for event ${eventName}`)
    }
    return handler!(...params)
  }

  removeAllListeners(eventName: string) {
    this.handlers.delete(eventName)
  }
}

export class MockMediatorAsync implements IMediatorAsync {
  readonly contractAddress: Address

  // To be able to attach callbacks
  private _wrapper: any = new MockWrapper()
  readonly provider = new MockWrapper()

  getContractWrapper(): Contract {
    return this._wrapper
  }

  constructor(address?: string) {
    this.contractAddress = address || SOME_ADDRESS
  }

  getBalance(): Promise<Amount> {
    throw Error('Method getBalance not implemented.')
  }

  commit(
    _rootInfo: IRootInfo,
    _tokenAddress: Address
  ): Promise<TransactionReceipt> {
    throw Error('Method commit not implemented.')
  }

  initiateWithdrawal(
    _proof: Proof,
    _withdrawalAmount: Amount
  ): Promise<TransactionReceipt> {
    throw Error('Method initiateWithdrawal not implemented.')
  }

  requestedWithdrawalAmount(
    _round: Round,
    _tokenAddress: Address,
    _clientAddress: Address
  ): Promise<Amount> {
    throw Error('Method requestedWithdrawalAmount not implemented.')
  }

  getActiveWithdrawalRound(
    _tokenAddress: Address,
    _clientAddress: Address
  ): Promise<number> {
    throw Error('Method getActiveWithdrawalRound not implemented.')
  }

  depositsToken(
    _tokenAddress: Address,
    _amount: Amount | number
  ): Promise<TransactionReceipt> {
    throw Error('Method depositsToken not implemented.')
  }

  registerToken(_tokenAddress: Address): Promise<TransactionReceipt> {
    throw Error('Method registerToken not implemented.')
  }

  unregisterToken(_tokenAddress: Address): Promise<TransactionReceipt> {
    throw Error('Method unregisterToken not implemented.')
  }

  getCurrentRound(): Promise<Round> {
    return Promise.resolve(0)
  }

  getCurrentQuarter(): Promise<Quarter> {
    return Promise.resolve(0 as Quarter)
  }

  skipToNextQuarter(): Promise<TransactionReceipt> {
    throw Error('Method skipToNextQuarter no implemented.')
  }

  skipToNextRound(): Promise<TransactionReceipt> {
    throw Error('Method skipToNextRound no implemented.')
  }

  pendingWithdrawals(
    _round: Round,
    _tokenAddress: Address,
    _clientAddress: Address
  ): Promise<Amount> {
    throw Error('Method pendingWithdrawals not implemented.')
  }

  isHalted(): Promise<boolean> {
    throw Error('Method isHalted not implemented.')
  }

  getBlockNumberAtCreation(): Promise<number> {
    throw Error('Method getBlockNumberAtCreation not implemented.')
  }

  getCommit(_round: number, _tokenAddress: Address): Promise<Digest> {
    throw Error('Method getCommit not implemented.')
  }

  updateHaltedState(): Promise<boolean> {
    throw Error('Method updateHaltedState not implemented.')
  }

  setNewOperatorAddress(
    _newOperatorAddress: Address
  ): Promise<TransactionReceipt> {
    throw Error('Method setNewOperatorAddress not implemented.')
  }

  cancelWithdrawal(
    _approvals: IApproval[],
    _sigs: SignatureSol[],
    _tokenAddress: Address,
    _clientAddress: Address
  ): Promise<TransactionReceipt> {
    throw Error('Method cancelWithdrawal not implemented.')
  }

  deposits(
    _round: Round,
    _tokenAddress: Address,
    _clientAddress: Address
  ): Promise<Amount> {
    throw Error('Method deposits not implemented.')
  }

  getSortedListOfregisteredTokensAddresses(): Promise<Address[]> {
    throw Error(
      'Method getSortedListOfregisteredTokensAddresses not implemented.'
    )
  }

  totalDeposits(_round: Round, _tokenAddress: Address): Promise<Amount> {
    throw Error('Method totalDeposits not implemented.')
  }

  totalRequestedWithdrawals(
    _round: Round,
    _tokenAddress: Address
  ): Promise<Amount> {
    throw Error('Method totalRequestedWithdrawals not implemented.')
  }

  confirmWithdrawal(_tokenAddress: Address): Promise<TransactionReceipt> {
    throw Error('Method confirmWithdrawal not implemented.')
  }

  disputes(_clientAddress: Address): Promise<IOpenDispute> {
    throw Error('Method disputes not implemented.')
  }

  openDispute(
    _proofs: Proof[],
    _fills: FillMediator[],
    _sigFills: SignatureSol[],
    _authorizationMessage: IAuthorizationMessage
  ): Promise<TransactionReceipt> {
    throw Error('Method openDispute not implemented.')
  }

  closeDispute(
    _proofs: Proof[],
    _approvals: IApproval[],
    _sigApprovals: SignatureSol[],
    _fills: FillMediator[],
    _sigFills: SignatureSol[],
    _clientAddress: Address
  ): Promise<TransactionReceipt> {
    throw Error('Method closeDispute not implemented.')
  }

  recoverAllFunds(_proof: Proof): Promise<TransactionReceipt> {
    throw Error('Method recoverAllFunds not implemented.')
  }
  recoverOnChainFundsOnly(_tokenAddress: Address): Promise<TransactionReceipt> {
    throw Error('Method recoverOnChainFundsOnly not implemented.')
  }
  isProofValid(_proof: Proof, _round: Round): Promise<boolean> {
    throw Error('Method isProofValid not implemented.')
  }

  totalDisputes(): Promise<BigNumber> {
    throw Error('Method totalDisputes not implemented.')
  }

  setOpenDisputeCounter(_n: number): Promise<TransactionReceipt> {
    throw Error('Method setOpenDisputeCounter not implemented.')
  }

  openDisputeCounters(_round: Round): Promise<number> {
    throw Error('Method openDisputeCounters not implemented.')
  }
  /*
  closeDisputeCounter(_clientAddress: Address): Promise<TransactionReceipt> {
    throw Error('Method closeDisputeCounter not implemented.')
  }
*/
  destroyDispute(_clientAddress: Address): Promise<TransactionReceipt> {
    throw Error('Method destroyDispute not implemented.')
  }

  computeBalancesInducedByFills(_fills: FillMediator[]): Promise<BigNumber[]> {
    throw Error('Method computeBalancesInducedByFills not implemented.')
  }

  setDisputeSummaryCounter(
    _clientAddress: Address,
    _counter: Counter
  ): Promise<TransactionReceipt> {
    throw Error('Method setDisputeSummaryCounter not implemented.')
  }

  setPreviousOpeningBalanceClient(
    _clientAddress: Address,
    _openingBalance: Amount,
    _pos: number
  ): Promise<TransactionReceipt> {
    throw Error('Method setPreviousOpeningBalanceClient not implemented.')
  }

  getFillFromDispute(_clientAddress: Address, _fillId: FillId): Promise<IFill> {
    throw Error('Method getFillFromDispute not implemented.')
  }

  getBalanceFromDispute(
    _clientAddress: Address,
    _index: Number
  ): Promise<BigNumber> {
    throw Error('Method getBalanceFromDispute not implemented.')
  }

  setTotalWithdrawalAmount(
    _round: Round,
    _tokenAddress: Address,
    _amount: Amount
  ): Promise<TransactionReceipt> {
    throw Error('Method setTotalWithdrawalAmount not implemented.')
  }

  halt(): Promise<TransactionReceipt> {
    throw Error('Method halt not implemented.')
  }

  roundSize(): Promise<Amount> {
    return Promise.resolve(D('16'))
  }
}
