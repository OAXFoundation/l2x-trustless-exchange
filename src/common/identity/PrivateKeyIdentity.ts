// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { Wallet } from 'ethers/wallet'
import { Provider } from 'ethers/providers'
import { randomBytes } from 'crypto'
const {
  hashPersonalMessage,
  secp256k1,
  ecsign,
  toRpcSig,
  toBuffer,
  bufferToHex
} = require('ethereumjs-util')
import { Identity } from './Identity'
import { Signature, Digest } from '../types/BasicTypes'

import { keccak256 } from '../Hash'

import { Approval, IApproval, ISignedApproval } from '../types/Approvals'

export class PrivateKeyIdentity extends Wallet implements Identity {
  constructor(privateKey?: string, provider?: Provider) {
    let pk = privateKey || randomPrivateKey()
    super(pk, provider)
  }

  async signHash(messageHash: Digest): Promise<Signature> {
    const messageDigest = hashPersonalMessage(toBuffer(messageHash))
    const { v, r, s } = ecsign(messageDigest, toBuffer(this.privateKey))
    return Promise.resolve(toRpcSig(v, r, s))
  }

  async hashAndSign(message: string): Promise<Signature> {
    const hash = keccak256(message)
    return Promise.resolve(this.signHash(bufferToHex(hash)))
  }

  async signApprov(approvParams: IApproval): Promise<Signature> {
    let approvParamsObj = new Approval(approvParams)

    const hash = approvParamsObj.createDigest()

    const sig = await this.signHash(hash)
    return sig
  }

  async makeSignedApproval(approval: IApproval): Promise<ISignedApproval> {
    const sig = await this.signApprov(approval)
    const signedApproval: ISignedApproval = {
      params: approval,
      ownerSig: sig
    }
    return signedApproval
  }
}

export function randomPrivateKey() {
  let privateKey
  do {
    privateKey = randomBytes(32)
  } while (!secp256k1.privateKeyVerify(privateKey))
  return privateKey
}
