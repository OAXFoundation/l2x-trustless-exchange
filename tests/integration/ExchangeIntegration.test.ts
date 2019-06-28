// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import 'jest'
import { JsonRpcProvider } from 'ethers/providers'

import { Exchange } from '../../src/server/exchange/Exchange'
import { PrivateKeyIdentity } from '../../src/common/identity/PrivateKeyIdentity'
import { MockMediatorAsync } from '../../src/server/mediator/MockMediatorAsync'
import { Operator } from '../../src/server/operator/Operator'
import { Identity } from '../../src/common/identity/Identity'
import { Signature } from '../../src/common/types/BasicTypes'
import { MetaLedger } from '../../src/common/accounting/MetaLedger'
import { vfAuthorization } from '../../src/common/AuthorizationMessage'

describe('Exchange Integration', () => {
  let exchange: Exchange
  let operator: Operator
  let ledger: MetaLedger

  beforeEach(async () => {
    const fixtures = await makeFixtures()
    exchange = fixtures.exchange
    operator = fixtures.operator
    ledger = fixtures.ledger
  })

  describe('when admitting user with valid join request', () => {
    let user: Identity
    let address_sig: Signature

    beforeAll(async () => {
      user = new PrivateKeyIdentity()
      address_sig = await user.hashAndSign(user.address)
    })

    it('gets back a valid authorization message', async () => {
      const authMsg = await exchange.admit(user.address, address_sig)

      expect(
        vfAuthorization(
          authMsg,
          operator.identity.address,
          user.address,
          exchange.round
        )
      ).toBe(true)
    })

    it('user is registered into the ledger', async () => {
      await exchange.admit(user.address, address_sig)

      const isRegistered = await ledger.isClientRegistered(user.address)
      expect(isRegistered).toBe(true)
    })
  })
})

async function makeFixtures(): Promise<{
  exchange: Exchange
  operator: Operator
  ledger: MetaLedger
}> {
  const identity = new PrivateKeyIdentity()

  const assets: string[] = []
  const verifier = new MockMediatorAsync()
  const provider = new JsonRpcProvider()
  const ledger = new MetaLedger({
    assets,
    operatorAddress: identity.address,
    mediatorAddress: verifier.contractAddress
  })

  await ledger.start()

  const operator = new Operator(identity, verifier, provider, ledger)
  const exchange = new Exchange(operator, ledger, {})

  return {
    exchange,
    operator,
    ledger
  }
}
