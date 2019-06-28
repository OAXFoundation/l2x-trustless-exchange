// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import {
  generateRandomIdentifierHex,
  generateUniqueIdentifierTrade
} from '../src/common/UniqueId'

describe('How unique identifiers are generated', () => {
  it('works for random identifiers', async () => {
    const size = 64
    const randomId = generateRandomIdentifierHex(size)
    expect(randomId.length).toEqual(2 * size + 2)
    expect(randomId.toString().slice(0, 2)).toEqual('0x')
  })

  it('works for random trade identifiers', async () => {
    const size = 16
    const randomId = generateUniqueIdentifierTrade()
    expect(randomId.length).toEqual(2 * size + 2)
    expect(randomId.toString().slice(0, 2)).toEqual('0x')
  })
})
