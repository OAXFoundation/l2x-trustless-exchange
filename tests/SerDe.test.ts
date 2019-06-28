// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import 'jest'
import {
  BalancesSerDe,
  OrderBookSerDe,
  OrderSerDe,
  SignedFillSerDe
} from '../src/common/types/SerDe'

import { exchangeFixtures } from './libs/fixtures/Exchange.fixture'
import { orderFixtures } from './libs/fixtures/Order.fixture'
import { orderBookFixtures } from './libs/fixtures/OrderBook.fixture'
import { ISignedFill, ISignedFillJson } from '../src/common/types/Fills'
import { D } from '../src/common/BigNumberUtils'

describe('SerDe', () => {
  describe('IOrder', () => {
    describe('Without fee', () => {
      const order = orderFixtures.bestBid
      const orderJson = orderFixtures.bestBidJson

      it('toJSON works', () => {
        const result = OrderSerDe.toJSON(order)

        expect(result).toEqual(orderJson)
      })

      it('fromJSON works', () => {
        const result = OrderSerDe.fromJSON(orderJson)

        expect(result).toEqual(order)
      })
    })

    describe('With fee', () => {
      const order = orderFixtures.orderWithFee
      const orderJson = orderFixtures.orderWithFeeJson

      it('toJSON works', () => {
        const result = OrderSerDe.toJSON(order)

        expect(result).toEqual(orderJson)
      })

      it('fromJSON works', () => {
        const result = OrderSerDe.fromJSON(orderJson)

        expect(result).toEqual(order)
      })
    })
  })

  describe('IOrderBook', () => {
    const orderBook = orderBookFixtures.level2OrderBook
    const orderBookJson = orderBookFixtures.level2OrderBookJson

    it('toJSON works', () => {
      const result = OrderBookSerDe.toJSON(orderBook)

      expect(result).toEqual(orderBookJson)
    })

    it('fromJSON works', () => {
      const result = OrderBookSerDe.fromJSON(orderBookJson)

      expect(result).toEqual(orderBook)
    })
  })

  describe('IBalances', () => {
    const balances = exchangeFixtures.balances
    const balancesJson = exchangeFixtures.balancesJson

    it('toJSON works', () => {
      const result = BalancesSerDe.toJSON(balances)

      expect(result).toEqual(balancesJson)
    })

    it('fromJSON works', () => {
      const result = BalancesSerDe.fromJSON(balancesJson)

      expect(result).toEqual(balances)
    })
  })

  describe('SignedFillSerDe', () => {
    const signedFill: ISignedFill = {
      params: {
        fillId: '0',
        approvalId: '0',
        round: 0,
        buyAmount: D('500'),
        buyAsset: '0xD3199000aEE2df27236472539021B7B01674A2cc',
        sellAmount: D('1'),
        sellAsset: '0xD963bE14b8689a212550089fa42d4A011b54Edc2',
        clientAddress: '0x16BDa9f39348c3023fD8A9790C060fa132b5824f',
        instanceId: '0x95248ed41A86000902309254fc93e43aad16626b'
      },
      signature: 'sig'
    }

    const signedFillJson: ISignedFillJson = {
      params: {
        fillId: '0',
        approvalId: '0',
        round: 0,
        buyAmount: '500',
        buyAsset: '0xD3199000aEE2df27236472539021B7B01674A2cc',
        sellAmount: '1',
        sellAsset: '0xD963bE14b8689a212550089fa42d4A011b54Edc2',
        clientAddress: '0x16BDa9f39348c3023fD8A9790C060fa132b5824f',
        instanceId: '0x95248ed41A86000902309254fc93e43aad16626b'
      },
      signature: 'sig'
    }

    it('toJSON works', () => {
      const result = SignedFillSerDe.toJSON(signedFill)
      expect(result).toEqual(signedFillJson)
    })

    it('fromJSON works', () => {
      const result = SignedFillSerDe.fromJSON(signedFillJson)
      expect(result).toEqual(signedFill)
    })
  })
})
