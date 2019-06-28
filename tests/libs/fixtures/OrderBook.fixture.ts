// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import {
  IOrderBookJson,
  IOrderBook
} from '../../../src/common/types/ExchangeTypes'
import { D } from '../../../src/common/BigNumberUtils'

const level2OrderBook: IOrderBook = {
  symbol: 'USD/BTC',
  level: 'L2',
  bids: [
    { price: D('4'), amount: D('3') },
    { price: D('0.33333333'), amount: D('3') }
  ],
  asks: [{ price: D('3'), amount: D('1') }],
  timestamp: 0,
  datetime: '1970-01-01T00:00:00.000Z'
}

const level2OrderBookInEther: IOrderBook = {
  symbol: 'USD/BTC',
  level: 'L2',
  bids: [
    { price: D('4'), amount: D('0.000000000000000003') },
    { price: D('0.33333333'), amount: D('0.000000000000000003') }
  ],
  asks: [{ price: D('3'), amount: D('0.000000000000000001') }],
  timestamp: 0,
  datetime: '1970-01-01T00:00:00.000Z'
}

const level2OrderBookJson: IOrderBookJson = {
  symbol: 'USD/BTC',
  level: 'L2',
  bids: [{ price: '4', amount: '3' }, { price: '0.33333333', amount: '3' }],
  asks: [{ price: '3', amount: '1' }],
  timestamp: 0,
  datetime: '1970-01-01T00:00:00.000Z'
}

export const orderBookFixtures = {
  level2OrderBook,
  level2OrderBookInEther,
  level2OrderBookJson
}
