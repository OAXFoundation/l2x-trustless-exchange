// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import { keccak256 } from '../src/common/Hash'

describe('Hash', () => {
  describe('keccak256', () => {
    it('string works', () => {
      const messgae = 'hello, world'
      const digest = keccak256(messgae)
      expect(digest).toEqual(
        '0x29bf7021020ea89dbd91ef52022b5a654b55ed418c9e7aba71ef3b43a51669f2'
      )
    })

    it('serializes an object with lexical order for keys', () => {
      const message = {
        op: 'opcode',
        data: 'hello, world'
      }
      const digest = keccak256(message)
      expect(digest).toEqual(
        '0x2b4cb9d02c77b7c157786e23098d558372611d9ca7bc19a915de31b00d768f4a'
      )
    })
  })
})
