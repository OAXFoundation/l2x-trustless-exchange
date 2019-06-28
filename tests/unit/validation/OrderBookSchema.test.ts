// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import R from 'ramda'

import { orderBookFixtures } from '../../libs/fixtures/OrderBook.fixture'
import { Validation } from '../../../src/common/Validation'

describe('Order book message validator', () => {
  const validate = Validation.validateOrderBook
  const validObj = R.clone(orderBookFixtures.level2OrderBook)

  describe('Given a valid order book message', () => {
    it('validation passes', () => {
      expect(() => validate(validObj)).not.toThrow()
    })
  })

  describe('Given an empty message', () => {
    it('validation fails', () => {
      // @ts-ignore
      expect(() => validate({})).toThrow()
    })
  })
})
