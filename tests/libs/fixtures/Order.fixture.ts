// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { D } from '../../../src/common/BigNumberUtils'
import { IOrder, IOrderJson } from '../../../src/common/types/ExchangeTypes'

const timestamp = 1438197973000
const symbol = 'USD/BTC'

// sorted best (highest price) to worst (lowest price)
const bids: IOrder[] = [
  {
    id: '1',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'buy',
    price: D('3.125'),
    amount: D('27'),
    filled: D('0'),
    remaining: D('27'),
    trades: []
  },

  {
    id: '2',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'buy',
    price: D('3.125'),
    amount: D('3'),
    filled: D('0'),
    remaining: D('3'),
    trades: []
  },

  {
    id: '3',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'buy',
    price: D('2'),
    amount: D('9'),
    filled: D('0'),
    remaining: D('5'),
    trades: []
  },

  {
    id: '4',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'buy',
    price: D('2'),
    amount: D('3'),
    filled: D('0'),
    remaining: D('1'),
    trades: []
  },

  {
    id: '5',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'buy',
    price: D('0.25'),
    amount: D('3'),
    filled: D('0'),
    remaining: D('3'),
    trades: []
  }
]

// sorted best (lowest price) to worst (highest price)
const asks: IOrder[] = [
  {
    id: '6',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'sell',
    price: D('0.2'),
    amount: D('125'),
    filled: D('0'),
    remaining: D('125'),
    trades: []
  },

  {
    id: '7',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'sell',
    price: D('0.2'),
    amount: D('5'),
    filled: D('0'),
    remaining: D('5'),
    trades: []
  },

  {
    id: '8',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'sell',
    price: D('1'),
    amount: D('25'),
    filled: D('0'),
    remaining: D('5'),
    trades: []
  },

  {
    id: '9',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'sell',
    price: D('1'),
    amount: D('5'),
    filled: D('0'),
    remaining: D('5'),
    trades: []
  },

  {
    id: '10',
    datetime: new Date(timestamp).toISOString(),
    timestamp: timestamp,
    status: 'open',
    symbol: symbol,
    type: 'limit',
    side: 'sell',
    price: D('2'),
    amount: D('5'),
    filled: D('0'),
    remaining: D('3'),
    trades: []
  }
]

const bestBid = bids[0]
const bestBidJson: IOrderJson = {
  ...bestBid,
  price: bestBid.price.toString(10),
  amount: bestBid.amount.toString(10),
  filled: bestBid.filled.toString(10),
  remaining: bestBid.remaining.toString(10)
}

const bestAsk = asks[0]
const partiallyFilledBid = bids[bids.length - 1]

const orderBookLevel1 = {
  bids: [{ price: D('3.125'), amount: D('30') }],
  asks: [{ price: D('0.2'), amount: D('130') }]
}

const orderBookLevel1Dp1 = {
  bids: [{ price: D('3.1'), amount: D('30') }],
  asks: [{ price: D('0.2'), amount: D('130') }]
}

const orderBookLevel2 = {
  bids: [
    { price: D('3.125'), amount: D('30') },
    { price: D('2'), amount: D('6') },
    { price: D('0.25'), amount: D('3') }
  ],
  asks: [
    { price: D('0.2'), amount: D('130') },
    { price: D('1'), amount: D('10') },
    { price: D('2'), amount: D('3') }
  ]
}

const orderBookLevel2Dp1 = {
  bids: [
    { price: D('3.1'), amount: D('30') },
    { price: D('2'), amount: D('6') },
    { price: D('0.3'), amount: D('3') }
  ],
  asks: [
    { price: D('0.2'), amount: D('130') },
    { price: D('1'), amount: D('10') },
    { price: D('2'), amount: D('3') }
  ]
}

const orderBookLevel3 = {
  bids: [
    { price: D('3.125'), amount: D('27') },
    { price: D('3.125'), amount: D('3') },
    { price: D('2'), amount: D('5') },
    { price: D('2'), amount: D('1') },
    { price: D('0.25'), amount: D('3') }
  ],
  asks: [
    { price: D('0.2'), amount: D('125') },
    { price: D('0.2'), amount: D('5') },
    { price: D('1'), amount: D('5') },
    { price: D('1'), amount: D('5') },
    { price: D('2'), amount: D('3') }
  ]
}

const orderBookLevel3Dp1 = {
  bids: [
    { price: D('3.1'), amount: D('27') },
    { price: D('3.1'), amount: D('3') },
    { price: D('2'), amount: D('5') },
    { price: D('2'), amount: D('1') },
    { price: D('0.3'), amount: D('3') }
  ],
  asks: [
    { price: D('0.2'), amount: D('125') },
    { price: D('0.2'), amount: D('5') },
    { price: D('1'), amount: D('5') },
    { price: D('1'), amount: D('5') },
    { price: D('2'), amount: D('3') }
  ]
}

const orderWithFee: IOrder = {
  id: '1',
  datetime: new Date(timestamp).toISOString(),
  timestamp: timestamp,
  status: 'open',
  symbol: symbol,
  type: 'limit',
  side: 'buy',
  price: D('3.125'),
  amount: D('27'),
  filled: D('0'),
  remaining: D('27'),
  trades: []
}

const orderWithFeeJson: IOrderJson = {
  ...orderWithFee,
  price: orderWithFee.price.toString(10),
  amount: orderWithFee.amount.toString(10),
  filled: orderWithFee.filled.toString(10),
  remaining: orderWithFee.remaining.toString(10)
}

export const orderFixtures = {
  bids,
  asks,
  bestBid,
  bestBidJson,
  bestAsk,
  partiallyFilledBid,
  orderBookLevel3,
  orderBookLevel2,
  orderBookLevel1,
  orderBookLevel3Dp1,
  orderBookLevel2Dp1,
  orderBookLevel1Dp1,
  orderWithFee,
  orderWithFeeJson
}
