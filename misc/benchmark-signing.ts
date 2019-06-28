// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import * as crypto from 'crypto'
import { performance } from 'perf_hooks'
import R from 'ramda'
import { Identity, verifySig } from '../src/common/identity/Identity'
import { PrivateKeyIdentity } from '../src/common/identity/PrivateKeyIdentity'

function mkHash(): string {
  return '0x' + crypto.randomBytes(32).toString('hex')
}

async function mkSig(id: Identity) {
  return await id.signHash(mkHash())
}

async function bench(name: string, inputs: any, fun: any): Promise<any> {
  // warmup
  for (const data of inputs) {
    await fun(...data)
  }

  const start = performance.now()
  for (const data of inputs) {
    await fun(...data)
  }
  const end = performance.now()
  const iters = (1000 * inputs.length) / (end - start)
  console.log(`${name}:\t${iters.toFixed(1)} per second`)
}

void (async function() {
  const n = 1e4

  // Create all inputs first, hopefully more than fits into CPU cache.
  // Does it matter? Who knows?
  const signInputs = R.times(() => [new PrivateKeyIdentity(), mkHash()], n)
  await bench('id.signHash', signInputs, async (id: Identity, hash: string) => {
    await id.signHash(hash)
  })

  await bench(
    'id.hashAndSign',
    signInputs,
    async (id: Identity, hash: string) => {
      await id.hashAndSign(hash)
    }
  )

  const verifyInputs = []
  for (const _ of R.range(0, n)) {
    const id = new PrivateKeyIdentity()
    verifyInputs.push([mkHash(), await mkSig(id), id.address])
  }
  await bench('verifySig', verifyInputs, verifySig)
})()
