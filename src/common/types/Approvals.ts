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
  Digest,
  ILot,
  ILotJson,
  Intent,
  Round,
  Signature,
  SignatureSol
} from './BasicTypes'

import { IApproval, ISignedApproval } from './Approvals'
import { arrayify, hexlify } from 'ethers/utils'

import { D } from '../BigNumberUtils'
import { AmountError } from '../Errors'

import { utils } from 'ethers'
import { Identity } from '../identity/Identity'
import { generateRandomIdentifierHex } from '../UniqueId'

/**
 * This interface is used to represent the data
 * of an approval without signature.
 */
export interface IApproval {
  approvalId: ApprovalId // Unique identifier of the approval
  round: Round // Round when the approval is created
  buy: ILot // Buy side of the approval
  sell: ILot // Sell side of the approval
  intent: Intent // Intent of the approval
  owner: Address // Address of the creator of the approval
  instanceId: Address //Address of the mediator
}

/**
 * This interface is used to represent
 * an approval in its serialized form (without signature).
 */
export interface IApprovalJson {
  approvalId: ApprovalId
  round: Round
  buy: ILotJson
  sell: ILotJson
  intent: Intent
  owner: Address
  instanceId: Address
}

/**
 * This interface combines the data of an approval
 * and its signature by the owner (client).
 */
export interface ISignedApproval {
  params: IApproval
  ownerSig: Signature
}

/**
 * This interface represents a signed
 * approval in its serialized form.
 */
export interface ISignedApprovalJson {
  params: IApprovalJson
  ownerSig: Signature
}

/**
 * This interface represents a raw approval
 * that can be processed by the mediator smart contract.
 */
export interface IApprovalSol {
  approvalId: string
  round: string
  buyAmount: string
  buyAsset: Address
  sellAmount: string
  sellAsset: Address
  intent: boolean
  instanceId: Address
}

/**
 * This class enables to convert an approval of type IApproval
 * into an approval of type IApprovalSol.
 * It also enables to compute the hash of the approval.
 */
export class Approval implements IApproval {
  public approvalId: ApprovalId
  public round: Round
  public buy: ILot
  public sell: ILot
  public intent: Intent
  public owner: Address
  public instanceId: Address

  constructor(approvalParams: IApproval) {
    this.round = approvalParams.round
    this.buy = approvalParams.buy
    this.sell = approvalParams.sell
    this.intent = approvalParams.intent
    this.owner = approvalParams.owner
    this.approvalId = approvalParams.approvalId
    this.instanceId = approvalParams.instanceId
  }

  /**
   * Exports the approval data to an instance of IApprovalSol.
   */
  public toSol(): IApprovalSol {
    const boolIntent: boolean = this.intent == 'buyAll' ? true : false

    const approvalParams = {
      approvalId: this.approvalId.toString(),
      round: this.round.toString(),
      buyAmount: this.buy.amount.toString(10),
      buyAsset: this.buy.asset,
      sellAmount: this.sell.amount.toString(10),
      sellAsset: this.sell.asset,
      intent: boolIntent,
      instanceId: this.instanceId
    }

    return approvalParams
  }

  /**
   * Computes the hash of the fill.
   * This hash is used in the mediator to verify signatures on the approval.
   */
  public createDigest(): string {
    const a = this.toSol()
    const hash = utils.solidityKeccak256(
      [
        'uint256',
        'uint256',
        'uint256',
        'address',
        'uint256',
        'address',
        'bool',
        'address'
      ],
      [
        a.approvalId,
        a.round,
        a.buyAmount,
        a.buyAsset,
        a.sellAmount,
        a.sellAsset,
        a.intent,
        a.instanceId
      ]
    )
    return hash
  }

  /**
   * Creates an Approval from an IApproval instance
   * @param approval: IApproval instance
   */
  static fromIApproval(approval: IApproval): Approval {
    return new Approval(approval)
  }
}

export namespace ApprovalsFunctions {
  /**
   * Given a signed approval verifies if the amounts are strictly positive.
   * In the case of fee approvals we allow the buy amount to be equal to 0
   * @param approval: approval to be checked
   * @param forceZeroBuyAmount: throws if the buy amount is not equal to 0 (for fees)
   */
  export function validateAmounts(
    approval: ISignedApproval,
    forceZeroBuyAmount: boolean = false
  ): void {
    const buy = approval.params.buy.amount
    const sell = approval.params.sell.amount

    if (forceZeroBuyAmount) {
      if (!buy.isZero()) {
        throw new AmountError('ISignedApproval buy amount cannot be <> 0')
      }
    } else {
      if (D('0').gte(buy)) {
        throw new AmountError('ISignedApproval buy amount cannot be <= 0')
      }
    }

    if (D('0').gt(sell)) {
      throw new AmountError('ISignedApproval sell amount cannot be <= 0')
    }
  }

  /**
   * Generates a unique identifier for an approval
   * @param round round of the approval
   * @param buyAsset asset for buying
   * @param buyAmount amount for buying
   * @param sellAsset asset for selling
   * @param sellAmount amount for selling
   * @param intent intent of the approval
   * @param salt optional salt, will be generated if ommitted
   */
  export function generateUniqueIdentifier(
    round: Round,
    buyAsset: AssetAddress,
    buyAmount: Amount,
    sellAsset: AssetAddress,
    sellAmount: Amount,
    intent: Intent,
    salt?: string
  ): Digest {
    //Generate a random salt
    let randomSalt: string

    if (salt == null) {
      randomSalt = generateRandomIdentifierHex(32)
    } else {
      randomSalt = salt
    }

    const intentBool = intent == 'buyAll' ? true : false

    const res = utils.solidityKeccak256(
      ['bytes', 'uint256', 'address', 'uint256', 'address', 'uint256', 'bool'],
      [
        randomSalt,
        round,
        buyAsset,
        buyAmount.toString(10),
        sellAsset,
        sellAmount.toString(10),
        intentBool
      ]
    )

    return res
  }

  /**
   * Extract the signature of a signed approval so that it
   * can be consumed by the smart contract
   * @param approval signed approval
   * @returns signature of the approval
   */
  export function extractSignatureSol(approval: ISignedApproval): SignatureSol {
    const sigAsString = approval.ownerSig
    const sigAsBytes = [...arrayify(sigAsString)].map(hexlify)
    return sigAsBytes
  }

  /**
   * Takes a raw approval, signs it and retur a signed approval
   * @param approvParams: contains the data of the approval
   * @param identity: identity object used to sign the approval
   */
  export async function makeSignedApproval(
    approvParams: IApproval,
    identity: Identity
  ): Promise<ISignedApproval> {
    const sig = await identity.signApprov(approvParams)
    const signedApproval: ISignedApproval = {
      params: approvParams,
      ownerSig: sig
    }
    return signedApproval
  }
}

/**
 * Given an order approval, compute a fee approval
 * @param approval: approval corresponding to the initial order
 * @param asset: address of the asset used to charge the fee
 * @param fee: fee amount
 * @param salt optional salt, will be generated if ommitted
 * @returns approval corresponding to the fee
 */

export function computeFeeApproval(
  approval: IApproval,
  asset: AssetAddress,
  fee: Amount,
  salt?: string
): IApproval {
  const round: Round = approval.round
  const buyAmount: Amount = D('0')
  const sellAmount: Amount = fee
  const intent: Intent = 'sellAll'
  const owner: Address = approval.owner
  const instanceId: Address = approval.instanceId

  //A new ID needs to be generated
  const approvalId = ApprovalsFunctions.generateUniqueIdentifier(
    round,
    asset,
    buyAmount,
    asset,
    sellAmount,
    intent,
    salt
  )

  const feeApproval: IApproval = {
    approvalId: approvalId,
    round: approval.round,
    buy: { asset: asset, amount: buyAmount },
    sell: { asset: asset, amount: sellAmount },
    intent: intent,
    owner: owner,
    instanceId: instanceId
  }

  return feeApproval
}
