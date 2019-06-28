// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import {
  Address,
  Amount,
  ApprovalId,
  AssetAddress,
  FillId,
  Round,
  Signature
} from './BasicTypes'
import { utils } from 'ethers'

/**
 * Contains all the fields of a fill.
 */
export interface IFill {
  fillId: FillId // Unique identifier of the fill
  approvalId: ApprovalId // Identifier of the approval the fill is computed from
  round: Round // Round at the creation of the fill
  buyAmount: Amount // Amount to be bought
  buyAsset: AssetAddress // Address of the asset for the buy
  sellAmount: Amount // Amount to be sold
  sellAsset: AssetAddress // Address of the asset for the sell
  clientAddress: Address // Address of the client
  instanceId: Address // Address of the mediator smart contract
}

/**
 * Contains fill and its signature by the operator
 */

export interface ISignedFill {
  params: IFill
  signature: Signature
}

export interface ISignedFillJson {
  params: IFillJson
  signature: string
}

export interface IFillJson {
  fillId: string
  approvalId: string
  round: number
  buyAmount: string
  buyAsset: string
  sellAmount: string
  sellAsset: string
  clientAddress: string
  instanceId: string
}

/**
 * This interface contains the types that can be processed by
 * the mediator smart contract.
 */
export interface IFillSol {
  fillId: string
  approvalId: string
  round: string
  buyAmount: string
  buyAsset: string
  sellAmount: string
  sellAsset: string
  clientAddress: string
  instanceId: string
}

/**
 * This class enables to convert a fill (of type IFill)
 * into a fill that can be processed by the mediator smart contract (IFillSol).
 * It also enables to compute the hash of the fill.
 */
export class FillMediator implements IFill {
  constructor(
    public fillId: FillId,
    public approvalId: ApprovalId,
    public round: Round,
    public buyAmount: Amount,
    public buyAsset: AssetAddress,
    public sellAmount: Amount,
    public sellAsset: AssetAddress,
    public clientAddress: Address,
    public instanceId: Address
  ) {}

  /**
   * Exports the fill data to an instance of IFillSol.
   */
  public toSol(): IFillSol {
    const params = {
      fillId: this.fillId.toString(),
      approvalId: this.approvalId.toString(),
      round: this.round.toString(),
      buyAmount: this.buyAmount.toString(10),
      buyAsset: this.buyAsset.toString(),
      sellAmount: this.sellAmount.toString(10),
      sellAsset: this.sellAsset.toString(),
      clientAddress: this.clientAddress.toString(),
      instanceId: this.instanceId.toString()
    }

    return params
  }

  /**
   * Computes the hash of the fill.
   * This hash is used in the mediator to verify signatures on the fill.
   */
  public createDigest(): string {
    const s = this.toSol()
    const hash = utils.solidityKeccak256(
      [
        'uint256',
        'uint256',
        'uint256',
        'uint256',
        'address',
        'uint256',
        'address',
        'address',
        'address'
      ],
      [
        s.fillId,
        s.approvalId,
        s.round,
        s.buyAmount,
        s.buyAsset,
        s.sellAmount,
        s.sellAsset,
        s.clientAddress,
        s.instanceId
      ]
    )
    return hash
  }

  static fromIFill(fill: IFill): FillMediator {
    let fillMediator = new FillMediator(
      fill.fillId,
      fill.approvalId,
      fill.round,
      fill.buyAmount,
      fill.buyAsset,
      fill.sellAmount,
      fill.sellAsset,
      fill.clientAddress,
      fill.instanceId
    )

    return fillMediator
  }
}
