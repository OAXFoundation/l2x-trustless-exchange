// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import { Address, Amount, AssetAddress, Digest, Round } from './BasicTypes'
import { BigNumber } from 'bignumber.js'
import { IAuthorizationMessage } from './SmartContractTypes'

export interface IRootInfo {
  content: Digest
  height: BigNumber
  width: BigNumber
}

export interface IWithdrawalRequest {
  round: Round
  amount: Amount
  asset: AssetAddress
  wallet: Address
}

export interface IBalanceDispute {
  round: Round
  wallet: Address
  status: 'open' | 'closed'
}

export interface IWithdrawal extends IWithdrawalRequest {
  txHash: string
  id: number
  status: 'unchecked' | 'pending' | 'confirmed' | 'canceled'
}

export interface IWalletRegistryEntry {
  wallet: Address
  roundJoined: Round
  lastFillRound: Round
  lastAuditRound: number
  authorization?: IAuthorizationMessage
}

export interface ILedgerAccount {
  round: Round
  asset: AssetAddress
  wallet: Address
  deposited: Amount
  withdrawn: Amount
  bought: Amount
  sold: Amount
  locked: Amount
}

export interface ILedgerAccountJson {
  round: number
  asset: string
  wallet: string
  deposited: string
  withdrawn: string
  bought: string
  sold: string
  locked: string
}
