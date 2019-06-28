// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import { normalizeAddress } from '../src/common/ContractUtils'

describe('How to handle ethereum addresses', () => {
  it('raises an exception if the raw address string does not correspond to an ethereum address.', async () => {
    await expect(() => {
      normalizeAddress('xkjdksy76767/*')
    }).toThrow()
  })

  it('normalizes a raw address into a checksum address', () => {
    expect(
      normalizeAddress('0xcd2a3d9f938e13cd947ec05abc7fe734df8dd826')
    ).toEqual('0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826')
  })
})
