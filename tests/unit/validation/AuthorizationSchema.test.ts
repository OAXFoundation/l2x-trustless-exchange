// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import R from 'ramda'
import { Validation } from '../../../src/common/Validation'
import { IAuthorizationMessage } from '../../../src/common/types/SmartContractTypes'

import { SOME_SIGNATURE } from '../../libs/SystemFixture'

describe('Authorization validator', () => {
  const validate = Validation.validateAuthorization
  const validObj: IAuthorizationMessage = {
    clientAddress: '0xC22114c423b31E5876AfE8176f240F3c916edB52',
    round: 0,
    sig: SOME_SIGNATURE
  }

  describe('Given a valid authorization message', () => {
    it('validation passes', () => {
      expect(() => validate(validObj)).not.toThrow()
    })
  })

  describe('Given an invalid authorization message', () => {
    it('with missing `wallet` field, validation fails', () => {
      const invalidObj = R.clone(validObj)
      delete invalidObj.round

      expect(() => validate(invalidObj)).toThrow(
        `should have required property 'round'`
      )
    })

    it('with missing `signature` field, validation fails', () => {
      const invalidObj = R.clone(validObj)
      delete invalidObj.sig

      expect(() => validate(invalidObj)).toThrow(
        `data should have required property 'sig'`
      )
    })
  })
})
