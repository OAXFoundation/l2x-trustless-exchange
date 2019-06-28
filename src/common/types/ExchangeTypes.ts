// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

// Everything required to peform order matching
import {
  Amount,
  ApprovalId,
  AssetAddress,
  IAmounts,
  Id,
  Round,
  Status,
  TradeId
} from './BasicTypes'
import { IApproval, ISignedApproval, ISignedApprovalJson } from './Approvals'

export interface IMatchParams extends IApproval {
  remaining: Amount
  priority: number
}

export interface ISwapAmounts {
  fromLeft: Amount
  fromRight: Amount
}

// Internal to operator, hence not signed.
export interface ITradeInternal {
  tradeId: TradeId
  timestamp: number
  left: {
    approvalId: ApprovalId
    sell: Amount
  }
  right: {
    approvalId: ApprovalId
    sell: Amount
  }
  round: Round
}

// Internal to operator, hence not signed.
export interface ITradeInternalJson {
  tradeId: TradeId
  timestamp: number
  left: {
    approvalId: ApprovalId
    sell: string
  }
  right: {
    approvalId: ApprovalId
    sell: string
  }
  round: Round
}

export interface IFillExchange extends IAmounts {
  approvalId: ApprovalId
  round: Round
}

/**
 * Information sent from client to exchange and
 * then forwarded to the operator.
 */
export interface IL2Order {
  orderApproval: ISignedApproval
  feeApproval: ISignedApproval
}

export interface IL2OrderJson {
  orderApproval: ISignedApprovalJson
  feeApproval: ISignedApprovalJson
}

export type OrderStatus = 'open' | 'closed' | 'canceled'
export type MarketSide = 'buy' | 'sell'

/**
 * Fields in IOrder that measures quantity
 */
export type OrderQuantityFields = Extract<
  keyof IOrder,
  'price' | 'amount' | 'filled' | 'remaining'
>

export interface IOrder {
  id: string
  // ISO8601 datetime of 'timestamp' with milliseconds
  datetime: string
  // order placing/opening Unix timestamp in milliseconds
  timestamp: number
  status: OrderStatus
  // symbol e.g. 'WETH/OAX'
  symbol: string
  type: 'limit'
  side: MarketSide
  // float price in quote currency
  price: Amount
  // ordered amount of base currency
  amount: Amount
  // filled amount of base currency
  filled: Amount
  // remaining amount to fill
  remaining: Amount
  // a list of order trades/executions
  trades: ITradeExternal[]
}

export interface IOrderJson
  extends Pick<
    IOrder,
    Exclude<keyof IOrder, 'price' | 'amount' | 'filled' | 'remaining'>
  > {
  price: string
  amount: string
  filled: string
  remaining: string
}

// Interface of CCXT Trade
export interface ITradeExternal {
  info: any // the original decoded JSON as is
  id: Id // string trade id
  timestamp: number // Unix timestamp in milliseconds
  datetime: string // ISO8601 datetime with milliseconds
  symbol: string // symbol
  order: Id // string order id or undefined/None/null
  type: 'limit' // order type, 'market', 'limit' or undefined/None/null
  side: 'buy' | 'sell' // direction of the trade, 'buy' or 'sell'
  price: Amount // float price in quote currency
  amount: Amount // amount of base currency
  cost?: number // total cost  `price * amount`
}

export interface ITradeJson
  extends Pick<
    ITradeExternal,
    Exclude<keyof ITradeExternal, 'price' | 'amount'>
  > {
  price: string
  amount: string
}

export type MarketDepthLevel =
  | 'L1' // Only has the price and volume of best bid and offer
  | 'L2' // IOrder volumes are aggregated by price
  | 'L3' // IOrder information is shown without aggregation

export type BidAsk = Pick<IOrder, 'price' | 'amount'>

export type JsonBidAsk = {
  price: string
  amount: string
}

export interface IOrderBook {
  symbol: string // symbol for the market
  level: MarketDepthLevel
  bids: BidAsk[] // Open buy orders price and volume
  asks: BidAsk[] // Open sell orders price and volume
  timestamp: number //Unix timestamp in milliseconds
  datetime: string // ISO8601 datetime with milliseconds
}

export interface IOrderBookJson
  extends Pick<IOrderBook, Exclude<keyof IOrderBook, 'bids' | 'asks'>> {
  bids: JsonBidAsk[]
  asks: JsonBidAsk[]
}

export type MarketDepth = Pick<IOrderBook, 'bids' | 'asks'>

// The symbol is "base/quote".
export interface IMarket {
  base: AssetAddress
  quote: AssetAddress
}

export type TradingPair = string

export interface IExchangeBalance {
  free: Amount
  locked: Amount
}

export interface IExchangeBalances {
  [symbol: string]: IExchangeBalance
}

export interface IExchangeBalancesJson {
  [symbol: string]: {
    free: string
    locked: string
  }
}

export interface ApprovalWithMeta {
  approval: ISignedApproval
  timestamp: number
  id: number
  filledBuy: Amount
  filledSell: Amount
  status: Status
}
