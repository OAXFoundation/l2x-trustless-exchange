// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import 'jest'
import { orderFixtures } from './libs/fixtures/Order.fixture'
import { marketDepth, orderToBidAsk } from '../src/server/exchange/OrderBook'
import { D } from '@oax/common/BigNumberUtils'

describe('IOrderBook', () => {
  // sorted best (highest price) to worst (lowest price)
  const bids = orderFixtures.bids

  // sorted best (lowest price) to worst (highest price)
  const asks = orderFixtures.asks

  // for price level filtering
  const filledBid = {
    ...bids[0],
    price: bids[0].price.times(2),
    remaining: D('0')
  }

  // for price level filtering
  const filledAsk = {
    ...asks[0],
    price: asks[0].price.times(2),
    remaining: D('0')
  }

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

    it('works with no orders', () => {
      const level = marketDepth('L1', [], { decimalPlaces: 1 })

      expect(level).toEqual({
        asks: [],
        bids: []
      })
    })

    it('filters out price level with 0 amount', () => {
      const level = marketDepth('L3', [...orders, filledAsk, filledBid], {
        decimalPlaces: 1
      })

      expect(level).toEqual({
        bids: orderFixtures.orderBookLevel3Dp1.bids,
        asks: orderFixtures.orderBookLevel3Dp1.asks
      })
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

    it('works with no orders', () => {
      const level = marketDepth('L1', [], { decimalPlaces: 1 })

      expect(level).toEqual({
        asks: [],
        bids: []
      })
    })

    it('filters out price level with 0 amount', () => {
      const level = marketDepth('L2', [...orders, filledAsk, filledBid], {
        decimalPlaces: 1
      })

      expect(level).toEqual({
        bids: orderFixtures.orderBookLevel2Dp1.bids,
        asks: orderFixtures.orderBookLevel2Dp1.asks
      })
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

    it('works with no orders', () => {
      const level = marketDepth('L1', [], { decimalPlaces: 1 })

      expect(level).toEqual({
        asks: [],
        bids: []
      })
    })

    it('filters out price level with 0 amount', () => {
      const level = marketDepth('L1', [...orders, filledAsk, filledBid], {
        decimalPlaces: 1
      })

      expect(level).toEqual({
        bids: orderFixtures.orderBookLevel1Dp1.bids,
        asks: orderFixtures.orderBookLevel1Dp1.asks
      })
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
