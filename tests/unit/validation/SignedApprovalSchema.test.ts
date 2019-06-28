// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import R from 'ramda'
import { Validation } from '../../../src/common/Validation'
import { approvalFixtures } from '../../libs/fixtures/Approval.fixture'
import { D } from '../../../src/common/BigNumberUtils'

describe('Signed Approval validation', () => {
  const validate = Validation.validateSignedApproval
  const validObj = approvalFixtures.signedApproval

  describe('Given a valid signed approval message', () => {
    it('validation passes', () => {
      expect(() => validate(validObj)).not.toThrow()
    })
  })

  describe('Given an invalid signed approval message', () => {
    it('when buy amount is > 1e38, validation fails', () => {
      const invalidObj = R.clone(validObj)
      invalidObj.params.buy.amount = D('1e39')

      expect(() => validate(invalidObj)).toThrow(
        `params.buy.amount should be ` +
          `less than or equal to 100000000000000000000000000000000000000. ` +
          `Given 1000000000000000000000000000000000000000.`
      )
    })

    it('when sell amount is > 1e38, validation fails', () => {
      const invalidObj = R.clone(validObj)
      invalidObj.params.sell.amount = D('1e39')

      expect(() => validate(invalidObj)).toThrow(
        `params.sell.amount should be ` +
          `less than or equal to 100000000000000000000000000000000000000. ` +
          `Given 1000000000000000000000000000000000000000.`
      )
    })

    it('when buy amount is 0, validation fails', () => {
      const invalidObj = R.clone(validObj)
      invalidObj.params.buy.amount = D('0')

      expect(() => validate(invalidObj)).toThrow(
        `params.buy.amount should be positive. Given 0`
      )
    })

    it('when sell amount is 0, validation fails', () => {
      const invalidObj = R.clone(validObj)
      invalidObj.params.sell.amount = D('0')

      expect(() => validate(invalidObj)).toThrow(
        `params.sell.amount should be positive. Given 0`
      )
    })

    it('when message is empty, validation fails', () => {
      // @ts-ignore
      expect(() => validate({})).toThrow(
        [
          "data should have required property 'params'",
          "data should have required property 'ownerSig'"
        ].join(', ')
      )
    })
  })
})
