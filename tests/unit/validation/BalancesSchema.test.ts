// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import { D } from '../../../src/common/BigNumberUtils'
import { Validation } from '../../../src/common/Validation'

describe('Balances validator', () => {
  const validate = Validation.validateBalances

  describe('Given a valid balances object', () => {
    it('validation passes', () => {
      const validObj = {
        '0x0Cb77134d98E5509B19e24B486B1C1D38bccD44E': {
          free: D('10000000000000000000'),
          locked: D('1000000000000000000')
        },
        '0x607cd6aA9Ecd82fb7fD85D6F017e0A5292CD55Ab': {
          free: D('31415926535'),
          locked: D('299792458')
        }
      }

      expect(() => validate(validObj)).not.toThrow()
    })
  })

  describe('Given an invalid balances object', () => {
    it('when `free` property is missing, validation fails', () => {
      const invalidObj = {
        '0x607cd6aA9Ecd82fb7fD85D6F017e0A5292CD55Ab': {
          free: D('31415926535'),
          locked: D('299792458')
        }
      }

      delete invalidObj['0x607cd6aA9Ecd82fb7fD85D6F017e0A5292CD55Ab'].free

      expect(() => validate(invalidObj)).toThrow()
    })

    it('when `locked` property is missing, validation fails', () => {
      const invalidObj = {
        '0x607cd6aA9Ecd82fb7fD85D6F017e0A5292CD55Ab': {
          free: D('31415926535'),
          locked: D('299792458')
        }
      }

      delete invalidObj['0x607cd6aA9Ecd82fb7fD85D6F017e0A5292CD55Ab'].locked

      expect(() => validate(invalidObj)).toThrow()
    })
  })
})
