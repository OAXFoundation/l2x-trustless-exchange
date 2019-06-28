// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import ProviderEngine from 'web3-provider-engine'
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc.js')
import 'jest'
import { JsonRpcProvider } from 'ethers/providers'
import { utils as EthersUtils } from 'ethers'
import {
  Identity,
  recoverAddress,
  verifyMessageSig,
  verifySig
} from '../src/common/identity/Identity'
import { PrivateKeyIdentity } from '../src/common/identity/PrivateKeyIdentity'
import {
  JsonRPCIdentity,
  metaMaskIdentity
} from '../src/common/identity/jsonRPCIdentity'
import { GETH_RPC_URL } from '../config/environment'

describe('Identity', () => {
  const KNOWN_PRIVATEKEY =
    '0xb851e8887870145402b15c9da5360710040b1ca497bb63de5b6101afb6fc2358'

  const KNOWN_ADDRESS = '0x2CE1c7CaF0d7876A9f041DdB0FE62DC4A4789351'
  const MSG = 'hello, world'

  // keccak256(MSG)
  const MSG_HASH =
    '0x29bf7021020ea89dbd91ef52022b5a654b55ed418c9e7aba71ef3b43a51669f2'

  const KNOWN_SIG =
    '0xebd9280a9a7ebb8358ec6f4e359257778f2457f7edee9f96637bb7293f5245ab119238457a8f2340d08e827d260092dd2bd6b2c5874fde6bec9f73c45b5f165b1b'

  describe('Identity verification functions', () => {
    it('verifySig works', () => {
      const result = verifySig(MSG_HASH, KNOWN_SIG, KNOWN_ADDRESS)

      expect(result).toBeTruthy()
    })

    it('verifyMessageSig works', () => {
      const result = verifyMessageSig(MSG, KNOWN_SIG, KNOWN_ADDRESS)
      expect(result).toBeTruthy()
    })

    it('recoverAddress works', () => {
      const result = EthersUtils.getAddress(recoverAddress(MSG_HASH, KNOWN_SIG))
      expect(result).toEqual(KNOWN_ADDRESS)
    })
  })

  describe('PrivateKeyIdentity', () => {
    const id = new PrivateKeyIdentity(KNOWN_PRIVATEKEY)

    it('has an address', async () => {
      expect(id.address).toBe(KNOWN_ADDRESS)
    })

    it('.signHash works', async () => {
      await expect(id.signHash(MSG_HASH)).resolves.toEqual(KNOWN_SIG)
    })

    it('.hashAndSign works', async () => {
      await expect(id.hashAndSign(MSG)).resolves.toEqual(KNOWN_SIG)
    })
  })

  describe('JSON RPC Identity', () => {
    let id: Identity

    beforeAll(async () => {
      const httpProvider = new JsonRpcProvider(GETH_RPC_URL)
      const address = (await httpProvider.listAccounts())[0]
      id = new JsonRPCIdentity(httpProvider, address)
    })

    it('has an address', async () => {
      expect(id.address).toBeDefined()
    })

    it('.signHash works', async () => {
      const sig = await id.signHash(MSG_HASH)
      expect(verifySig(MSG_HASH, sig, id.address)).toBeTruthy()
    })

    it('.hashAndSign works', async () => {
      const sig = await id.hashAndSign(MSG)
      expect(verifyMessageSig(MSG, sig, id.address)).toBeTruthy()
    })

    it('metaMaskIdentity factory works', async () => {
      const provider = makeWeb3ProviderEngineWithRpc(GETH_RPC_URL)

      const id = await metaMaskIdentity(provider)

      expect(id).toBeInstanceOf(JsonRPCIdentity)
    })
  })
})

function makeWeb3ProviderEngineWithRpc(rpcUrl: string) {
  const engine = new ProviderEngine()
  engine.addProvider(new RpcSubprovider({ rpcUrl }))
  engine.start()

  return engine
}
