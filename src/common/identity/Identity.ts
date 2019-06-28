// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { Address, Digest, Signature } from '../types/BasicTypes'

import { IApproval, ISignedApproval } from '../types/Approvals'

import {
  hashPersonalMessage,
  pubToAddress,
  ecrecover,
  fromRpcSig,
  toBuffer,
  bufferToHex,
  keccak256
} from 'ethereumjs-util'
import { Signer } from 'ethers/abstract-signer'
import { utils as EthersUtils } from 'ethers'

/**
 * A simple API to provide a uniform signing and identity verification
 */
export interface Identity extends Signer {
  readonly address: Address

  /**
   * Produces a signature compatible with eth_sign over the message hash.
   *
   * See https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_sign for the
   * requirement of the message hash
   *
   * @param messageHash A HEX encoded keccak256 hash
   */
  signHash(messageHash: string): Promise<Signature>

  /**
   * Hashes the message in a manner compatible with eth_sign, then signs it
   * with the private key managed by this identity.
   *
   * See: See https://github.com/ethereum/wiki/wiki/JSON-RPC#eth_sign
   *
   * @param message The message to hash and sign
   */
  hashAndSign(message: string): Promise<Signature>

  /**
   * Takes as input approval information and computes the signed approvals
   * @param approvParams raw approval information
   */
  signApprov(approvParams: IApproval): Promise<Signature>

  makeSignedApproval(approvParams: IApproval): Promise<ISignedApproval>
}
/**
 * Verify an eth_sign compatible signature
 *
 * @param hash A hash compatible with eth_sign
 * @param sig A signature compatible with eth_sign
 * @param address The address that should have signed the hash
 */
export function verifySig(
  hash: Digest,
  sig: Signature,
  address: Address
): boolean {
  const signedDigest = hashPersonalMessage(toBuffer(hash))
  const { v, r, s } = fromRpcSig(sig)
  const recoveredPubKey = ecrecover(signedDigest, v, r, s)
  const recoveredAddress = bufferToHex(pubToAddress(recoveredPubKey))
  return (
    EthersUtils.getAddress(recoveredAddress) === EthersUtils.getAddress(address)
  )
}

/**
 * Verify a message with a signature produced in an eth_sign compatible signing
 * process.
 *
 * @param message The original message
 * @param sig The signature produced by an eth_sign compatible process
 * @param address The address that should have signed the hash
 */
export function verifyMessageSig(
  message: string,
  sig: Signature,
  address: Address
): boolean {
  const hash = keccak256(message)
  return verifySig(bufferToHex(hash), sig, address)
}

/**
 * Compute a signing address from a digest and its signature  with ecrecover
 *
 * @param msgHash The digest that was signed
 * @param sig The signature of the digest
 */
export function recoverAddress(msgHash: Digest, sig: string) {
  const digest = hashPersonalMessage(toBuffer(msgHash))
  const { v, r, s } = fromRpcSig(sig)

  const recoveredPubKey = ecrecover(digest, v, r, s)
  const recoveredAddress = pubToAddress(recoveredPubKey)

  return bufferToHex(recoveredAddress)
}
