// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import { D } from '../../../src/common/BigNumberUtils'
import { IOrder } from '../../../src/common/types/ExchangeTypes'
import { Validation } from '../../../src/common/Validation'

describe('Order validator', () => {
  const validate = Validation.validateOrder

  const validObj: IOrder = {
    id: 'orderId',
    datetime: '2019-05-29T04:18:22.403Z',
    timestamp: 1559103502403,
    status: 'open',
    symbol: 'WETH/OAX',
    type: 'limit',
    side: 'sell',
    price: D('450'),
    amount: D('1'),
    filled: D('0.5'),
    remaining: D('0.5'),
    // a list of order trades/executions
    trades: [
      {
        info: null,
        id: 'tradeId',
        timestamp: 1559103639877,
        datetime: '2019-05-29T04:20:39.877Z',
        symbol: 'WETH/OAX',
        order: 'orderId',
        type: 'limit',
        side: 'sell',
        price: D('450'),
        amount: D('0.5'),
        cost: 225
      }
    ]
  }

  describe('Given a valid order object', () => {
    it('validation passes', () => {
      expect(() => validate(validObj)).not.toThrow()
    })
  })

  describe('Given an empty object', () => {
    it('validation fails', () => {
      // @ts-ignore
      expect(() => validate({})).toThrow()
    })
  })
})
