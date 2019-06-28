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

describe('Signed fee validation', () => {
  const validate = Validation.validateSignedFee
  const validObj = approvalFixtures.l2order.feeApproval

  describe('Given a valid signed fee', () => {
    it('validation passes', () => {
      expect(() => validate(validObj)).not.toThrow()
    })
  })

  describe('Given an invalid signed fee', () => {
    it('when signed fee is empty, validation fails', () => {
      // @ts-ignore`
      expect(() => validate({})).toThrow()
    })

    it('when buy amount is not 0, validation fails', () => {
      const invalidObj = R.clone(validObj)
      invalidObj.params.buy.amount = D('1')

      expect(() => validate(invalidObj)).toThrow(
        'params.buy.amount should be equal to 0. Given 1'
      )
    })
  })
})
