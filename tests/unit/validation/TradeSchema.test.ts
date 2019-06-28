// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import { D } from '../../../src/common/BigNumberUtils'
import { ITradeExternal } from '../../../src/common/types/ExchangeTypes'
import { Validation } from '../../../src/common/Validation'

describe('Trade message validator', () => {
  const validate = Validation.validateTrade

  const validFullObj: ITradeExternal = {
    info: null,
    id: 'tradeId',
    timestamp: 1559039389117,
    datetime: '2019-05-28T10:29:59.628Z',
    symbol: 'WETH/OAX',
    order: 'orderId',
    type: 'limit',
    side: 'buy',
    price: D('450'),
    amount: D('1'),
    cost: 450
  }

  describe('Given a valid trade message', () => {
    it('validation passes', () => {
      expect(() => validate(validFullObj)).not.toThrow()
    })
  })

  describe('Given an empty message', () => {
    it('validation fails', () => {
      // @ts-ignore
      expect(() => validate({})).toThrow()
    })
  })
})
