// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { IComparator } from '../../common/types/BasicTypes'

import {
  IOrder,
  MarketDepth,
  MarketDepthLevel,
  OrderQuantityFields,
  BidAsk
} from '../../common/types/ExchangeTypes'

import { pipe, map, groupWith, sortWith } from 'ramda'

/**
 * Returns the market depth for a given set of orders from the same market
 *
 * @param level
 * @param orders Orders from the same market
 * @param decimalPlaces Number of decimal places for price
 */
export function marketDepth(
  level: MarketDepthLevel,
  orders: IOrder[],
  { decimalPlaces = 8 } = {}
): MarketDepth {
  const marketDepths = {
    L1: level1BidAsks,
    L2: level2BidAsks,
    L3: level3BidAsks
  }

  if (marketDepths[level] === undefined) {
    throw Error(`Unknown market depth level: ${level}`)
  }

  return marketDepths[level](decimalPlaces, orders)
}

function level1BidAsks(decimalPlaces: number, orders: IOrder[]): MarketDepth {
  const { bids, asks } = level2BidAsks(decimalPlaces, orders)

  const bestBid = bids[0]
  const bestAsk = asks[0]

  return {
    bids: bestBid ? [bestBid] : [],
    asks: bestAsk ? [bestAsk] : []
  }
}

function level2BidAsks(decimalPlaces: number, orders: IOrder[]): MarketDepth {
  const { bids, asks } = level3BidAsks(decimalPlaces, orders)

  const priceLevel = pipe<BidAsk[], Array<BidAsk[]>, BidAsk[]>(
    groupWith((a: BidAsk, b: BidAsk) => a.price.isEqualTo(b.price)),
    map(aggregateBidAsks)
  )

  return {
    bids: priceLevel(bids),
    asks: priceLevel(asks)
  }
}

function level3BidAsks(decimalPlaces: number, orders: IOrder[]): MarketDepth {
  const bids = orders.filter(order => order.side === 'buy')
  const asks = orders.filter(order => order.side === 'sell')

  const toBidAsk = (order: IOrder) => {
    const bidAsk = orderToBidAsk(order)
    return roundBidAskPrice(decimalPlaces, bidAsk)
  }

  return {
    bids: sortBids(bids).map(toBidAsk),
    asks: sortAsks(asks).map(toBidAsk)
  }
}

/**
 * Creates a bidask representation of an IOrder, essentially reducing an order
 * to just price and amount
 *
 * @param order
 */
export function orderToBidAsk(order: IOrder): BidAsk {
  return {
    price: order.price,
    amount: order.remaining
  }
}

/**
 * Aggregate a list of bidask with the same price to a single bidask with the
 * sum of the amounts
 *
 * @param bidAsks
 */
function aggregateBidAsks(bidAsks: BidAsk[]): BidAsk {
  return bidAsks.reduce((acc, bidAsk) => {
    if (!acc.price.isEqualTo(bidAsk.price)) {
      throw Error(
        'Cannot aggregate bidasks of different price. ' +
          `Accumulated=${acc.price} Current=${bidAsk.price}`
      )
    }

    return { price: acc.price, amount: acc.amount.plus(bidAsk.amount) }
  })
}

/**
 * Round the price of a bidask down to a specific number of decimal places
 *
 * @param decimalPlaces
 * @param bidAsk
 */
function roundBidAskPrice(decimalPlaces: number, bidAsk: BidAsk): BidAsk {
  const roundedPrice = bidAsk.price.decimalPlaces(decimalPlaces)
  return {
    price: roundedPrice,
    amount: bidAsk.amount
  }
}

/**
 * Bids are sorted by best (highest) price to worst (lowest) price
 * @param orders
 */
function sortBids(orders: IOrder[]): IOrder[] {
  return sortWith([byDescendingOrder('price'), byDescendingOrder('amount')])(
    orders
  )
}

/**
 * Asks are sorted by best (lowest) price to worst (highest) price
 * @param orders
 */
function sortAsks(orders: IOrder[]): IOrder[] {
  return sortWith([byAscendingOrder('price'), byDescendingOrder('amount')])(
    orders
  )
}

/**
 * Creates an ascending IOrder comparator from a quantity property of the IOrder
 *
 * @param prop One of the quantity fields of IOrder
 */
function byAscendingOrder(prop: OrderQuantityFields): IComparator<IOrder> {
  return (a: IOrder, b: IOrder) => a[prop].comparedTo(b[prop])
}

/**
 * Creates an descending IOrder comparator from a quantity property of the IOrder
 *
 * @param prop One of the quantity fields of IOrder
 */
function byDescendingOrder(prop: OrderQuantityFields): IComparator<IOrder> {
  return (a: IOrder, b: IOrder) => b[prop].comparedTo(a[prop])
}
