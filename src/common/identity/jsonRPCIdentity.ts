// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

import { id, arrayify, Arrayish } from 'ethers/utils'
import {
  JsonRpcProvider,
  JsonRpcSigner,
  AsyncSendable,
  Web3Provider,
  Provider,
  TransactionRequest,
  TransactionResponse
} from 'ethers/providers'
import { setType } from 'ethers/utils/properties'
import { Identity } from './Identity'
import { Address, Digest, Signature } from '../types/BasicTypes'

import { IApproval, ISignedApproval } from '../types/Approvals'

export class JsonRPCIdentity implements Identity {
  readonly provider?: Provider
  readonly address: Address
  public readonly signer: JsonRpcSigner

  constructor(provider: JsonRpcProvider, address: Address) {
    this.signer = provider.getSigner(address)
    this.address = address
    this.provider = provider
    // Signal to Ethers that we implement their Signer interface
    setType(this, 'Signer')
  }

  signHash(messageHash: Digest): Promise<Signature> {
    const digestBytes = arrayify(messageHash)
    return this.signer.signMessage(digestBytes)
  }

  hashAndSign(message: string): Promise<Signature> {
    const digest = id(message)
    const digestBytes = arrayify(digest)
    return this.signer.signMessage(digestBytes)
  }

  async getAddress(): Promise<string> {
    return this.address
  }

  async signMessage(message: Arrayish | string): Promise<string> {
    return this.signer.signMessage(message)
  }

  async sendTransaction(
    transaction: TransactionRequest
  ): Promise<TransactionResponse> {
    return this.signer.sendTransaction(transaction)
  }

  async signApprov(_approvParams: IApproval): Promise<Signature> {
    throw Error('Method signApprov not implemented.')
  }

  async makeSignedApproval(_approvParams: IApproval): Promise<ISignedApproval> {
    throw Error('Method makeSignedApproval not implemented.')
  }
}

/**
 * MetaMask Identity takes a JsonRpc compatible provider (such as Web3), takes
 * the first available account, and return the identity for that account
 *
 * @param provider A provider compatible with JsonRpcProvider
 */
export async function metaMaskIdentity(
  provider: AsyncSendable
): Promise<JsonRPCIdentity> {
  if (!isWeb3Provider(provider)) {
    throw Error('Invalid Web3Provider')
  }

  const jsonProvider = new Web3Provider(provider)
  const address = (await jsonProvider.listAccounts())[0]

  return new JsonRPCIdentity(jsonProvider, address)
}

function isWeb3Provider(obj: any): boolean {
  return Reflect.has(obj, 'send') || Reflect.has(obj, 'sendAsync')
}
