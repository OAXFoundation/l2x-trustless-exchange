// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { BigNumber } from 'bignumber.js'
import {
  IAccount,
  Address,
  Amount,
  Digest,
  Round,
  IPartialProof,
  AssetAddress,
  Quarter,
  Signature
} from './BasicTypes'

import { IRootInfo } from './OperatorAndClientTypes'
import { D } from '../BigNumberUtils'

////////////// Proof ////////////////////////

export interface IProof {
  clientOpeningBalance: Amount
  clientAddress: Address
  hashes: Digest[]
  sums: Amount[]
  tokenAddress: Address
  height: BigNumber
  width: BigNumber
  round: Round
}

export interface IProofJson {
  clientOpeningBalance: string
  clientAddress: string
  hashes: string[]
  sums: string[]
  tokenAddress: string
  height: string
  width: string
  round: string
}

export interface IProofSol {
  clientOpeningBalance: string
  clientAddress: Address
  hashes: Digest[]
  sums: string[]
  tokenAddress: Address
  height: string
  width: string
  round: string
}

// CONSIDER: Add round to Proof object
export class Proof {
  constructor(
    public clientOpeningBalance: Amount,
    public clientAddress: Address,
    public hashes: Digest[],
    public sums: Amount[],
    public tokenAddress: Address,
    public height: BigNumber,
    public width: BigNumber,
    public round: Round
  ) {}

  public toSol(): IProofSol {
    const proof = {
      clientOpeningBalance: this.clientOpeningBalance.toString(10),
      clientAddress: this.clientAddress,
      hashes: this.hashes,
      sums: this.sums.map(v => v.toString(10)),
      tokenAddress: this.tokenAddress,
      height: this.height.toString(10),
      width: this.width.toString(10),
      round: this.round.toString(10)
    }

    return proof
  }

  toJSON(): IProofJson {
    const res = {
      clientOpeningBalance: this.clientOpeningBalance.toString(10),
      clientAddress: this.clientAddress,
      hashes: this.hashes,
      sums: this.sums.map(s => s.toString(10)),
      tokenAddress: this.tokenAddress,
      height: this.height.toString(10),
      width: this.width.toString(10),
      round: this.round.toString(10)
    }

    return res
  }

  static fromProofOfLiability(
    proof: IPartialProof,
    leaf: IAccount,
    asset: AssetAddress
  ): Proof {
    return new this(
      leaf.sum,
      leaf.address,
      proof.liabilities!.map(p => p.hash),
      proof.liabilities!.map(p => p.sum),
      asset,
      proof.height!,
      proof.width!,
      proof.round!
    )
  }

  static fromJson(json: IProofJson) {
    let proof = new Proof(
      D(json.clientOpeningBalance),
      json.clientAddress,
      json.hashes,
      json.sums.map(sum => D(sum)),
      json.tokenAddress,
      D(json.height),
      D(json.width),
      D(json.round).toNumber()
    )
    return proof
  }
}

////////////// Disputes ////////////////////////

export interface IOpenDispute {
  quarter: Quarter
  round: Round
  openingBalances: string[]
  fillCount: Number
  open: boolean
}

export interface IAuthorizationMessage {
  round: Round
  clientAddress: Address
  sig: Signature
}

export interface IAuthorizationMessageJson {
  round: number
  clientAddress: string
  sig: string
}

////////////// Root    ////////////////////////

export class RootInfoParams implements IRootInfo {
  constructor(
    public content: Digest,
    public height: BigNumber,
    public width: BigNumber
  ) {}

  public toSol(): IRootInfoSol {
    const rootInfo = {
      content: this.content.toString(),
      height: this.height.toString(10),
      width: this.width.toString(10)
    }

    return rootInfo
  }
}

export interface IRootInfoSol {
  content: string
  width: string
  height: string
}
