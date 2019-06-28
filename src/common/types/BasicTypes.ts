// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { BigNumber } from 'bignumber.js'
import { BigNumber as EthersBigNumber } from 'ethers/utils/bignumber'

export type Id = string
export type Digest = string
export type Address = string
export type AuditResult = 'ok' | 'fail'
export type Amount = BigNumber
export type Signature = string
export type SignatureSol = string[]
export type Round = number
export type Counter = number
export type AssetAddress = Address
export type Intent = 'buyAll' | 'sellAll'
export type ApprovalId = Id
export type FillId = Id
export type TradeId = Id
export type DisputeId = Id

export interface IAsset {
  symbol: string
  address: Address
}

export type Quarter = 0 | 1 | 2 | 3

// A partial proof contains the information of a proof
// but without the leaf corresponding to the client's opening balance
export interface IPartialProof {
  liabilities: ILiability[] | undefined
  height: BigNumber | undefined
  width: BigNumber | undefined
  round: Round | undefined
}

export interface ITransacted {
  sold: Amount
  bought: Amount
}

export interface ITransactedJson {
  sold: string
  bought: string
}

export interface ILiability {
  hash: Digest
  sum: Amount
}

export interface IAccount {
  address: Address
  sum: Amount
  round: Round
}

export interface ILot {
  asset: AssetAddress
  amount: Amount
}

export interface ILotJson {
  asset: AssetAddress
  amount: string
}

export interface IAmounts {
  buy: {
    amount: Amount
  }
  sell: {
    amount: Amount
  }
}

export interface IHttpTransportOptions {
  port?: number
  host?: string
  backlog?: number
}

export interface IComparator<T> {
  (a: T, b: T): number
}

type PersonalTransactionEvent = [
  EthersBigNumber,
  AssetAddress,
  Address,
  EthersBigNumber,
  { transactionHash: string }
]

export type DepositEvent = PersonalTransactionEvent

export type WithdrawalEvent = PersonalTransactionEvent

export type ConfirmWithdrawalEvent = PersonalTransactionEvent

export type ContractDisputeEvent = [
  DisputeId,
  EthersBigNumber,
  Address,
  { transactionHash: string }
]

export interface IBalances {
  [symbol: string]: Amount
}

export interface JSONAPIObject {
  data?: any
  errors?: any
  meta?: any
}

export type DeepPartial<T> = { [P in keyof T]?: DeepPartial<T[P]> }

export type Omit<T, K> = Pick<T, Exclude<keyof T, K>>

export type Status = 'open' | 'closed' | 'canceled'
