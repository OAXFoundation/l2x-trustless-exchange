// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import 'jest'
import { orderFixtures } from './libs/fixtures/Order.fixture'
import { marketDepth, orderToBidAsk } from '../src/server/exchange/OrderBook'

describe('IOrderBook', () => {
  // sorted best (highest price) to worst (lowest price)
  const bids = orderFixtures.bids

  // sorted best (lowest price) to worst (highest price)
  const asks = orderFixtures.asks

  // put the bids and asks in the wrong order
  const orders = [...bids.slice(0).reverse(), ...asks.slice(0).reverse()]

  describe('level 3', () => {
    it('L3 works', () => {
      const level = marketDepth('L3', orders)

      expect(level).toEqual(orderFixtures.orderBookLevel3)
    })

    it('works with decimals', () => {
      const level = marketDepth('L3', orders, { decimalPlaces: 1 })

      expect(level).toEqual(orderFixtures.orderBookLevel3Dp1)
    })
  })

  describe('level 2', () => {
    it('L2 works', () => {
      const level = marketDepth('L2', orders)

      expect(level).toEqual(orderFixtures.orderBookLevel2)
    })

    it('works with decimals', () => {
      const level = marketDepth('L2', orders, { decimalPlaces: 1 })
      expect(level).toEqual(orderFixtures.orderBookLevel2Dp1)
    })
  })

  describe('level 1', () => {
    it('L1 works', () => {
      const level = marketDepth('L1', orders)

      expect(level).toEqual(orderFixtures.orderBookLevel1)
    })

    it('works with decimals', () => {
      const level = marketDepth('L1', orders, { decimalPlaces: 1 })

      expect(level).toEqual(orderFixtures.orderBookLevel1Dp1)
    })
  })

  describe('orderToBidAsk', () => {
    it('orderToBidAsk works', () => {
      const bid = orderFixtures.partiallyFilledBid

      const bidAsk = orderToBidAsk(bid)

      expect(bidAsk).toEqual({
        price: bid.price,
        amount: bid.remaining
      })
    })
  })
})
