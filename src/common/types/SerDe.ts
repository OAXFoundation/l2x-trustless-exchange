// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { mergeDeepLeft, mergeDeepRight } from 'ramda'
import BigNumber from 'bignumber.js'
import {
  Address,
  ITransacted,
  ITransactedJson,
  JSONAPIObject
} from './BasicTypes'

import {
  BidAsk,
  IOrder,
  IOrderBook,
  IOrderJson,
  ITradeExternal,
  ITradeJson,
  ITradeInternal,
  ITradeInternalJson,
  IExchangeBalances,
  IExchangeBalancesJson,
  JsonBidAsk,
  IOrderBookJson,
  IL2Order,
  IL2OrderJson
} from './ExchangeTypes'

import { ILedgerAccount, ILedgerAccountJson } from './OperatorAndClientTypes'

import { ISignedApproval, ISignedApprovalJson } from './Approvals'
import { ISignedFill, ISignedFillJson } from './Fills'
import { D } from '../BigNumberUtils'
import {
  IAuthorizationMessage,
  IAuthorizationMessageJson,
  IProof,
  IProofJson
} from './SmartContractTypes'
import {
  Deserializer as JSONAPIDeserializer,
  Serializer as JSONAPISerializer
} from 'jsonapi-serializer'

export const OrderSerDe = {
  toJSON(order: IOrder): IOrderJson {
    const json: IOrderJson = {
      ...order,
      price: order.price.toString(10),
      amount: order.amount.toString(10),
      filled: order.filled.toString(10),
      remaining: order.remaining.toString(10)
    }

    return json
  },

  fromJSON(json: IOrderJson): IOrder {
    const order: IOrder = {
      ...json,
      price: D(json.price),
      amount: D(json.amount),
      filled: D(json.filled),
      remaining: D(json.remaining)
    }

    return order
  },

  toAPIRecord(order: IOrder): JSONAPIObject {
    return OrderSerDe.toAPIRecords([order])
  },

  async fromAPIRecord(orderRecord: JSONAPIObject): Promise<IOrderJson> {
    const records = await OrderSerDe.fromAPIRecords(orderRecord)
    return records[0]
  },

  toAPIRecords(orders: IOrder[]): JSONAPIObject {
    const serializer = new JSONAPISerializer('orders', {
      attributes: [
        'datetime',
        'order',
        'timestamp',
        'status',
        'symbol',
        'type',
        'side',
        'price',
        'amount',
        'filled',
        'remaining',
        'trades',
        'fee'
      ],
      keyForAttribute: 'camelCase'
    })

    const jsonOrders = orders.map(OrderSerDe.toJSON)

    return serializer.serialize(jsonOrders)
  },

  async fromAPIRecords(orderRecords: JSONAPIObject): Promise<IOrderJson[]> {
    return new JSONAPIDeserializer({
      keyForAttribute: 'camelCase'
    }).deserialize(orderRecords)
  }
}

export const TradeSerDe = {
  toJSON(trade: ITradeExternal): ITradeJson {
    return {
      ...trade,
      price: trade.price.toString(10),
      amount: trade.amount.toString(10)
    }
  },
  fromJSON(json: ITradeJson): ITradeExternal {
    return {
      ...json,
      price: D(json.price),
      amount: D(json.amount)
    }
  },

  toAPIRecords(trades: ITradeExternal[]): JSONAPIObject {
    const serializer = new JSONAPISerializer('trades', {
      attributes: [
        'info',
        'timestamp',
        'datetime',
        'symbol',
        'order',
        'type',
        'side',
        'price',
        'amount',
        'cost'
      ],
      keyForAttribute: 'camelCase'
    })

    const tradeJsons = trades.map(TradeSerDe.toJSON)
    return serializer.serialize(tradeJsons)
  },

  async fromAPIRecords(tradeRecords: JSONAPIObject): Promise<ITradeJson[]> {
    const deserializer = new JSONAPIDeserializer({
      keyForAttribute: 'camelCase'
    })

    return deserializer.deserialize(tradeRecords)
  }
}

export const TradeInternalSerDe = {
  toJSON(trade: ITradeInternal): ITradeInternalJson {
    return mergeDeepRight(trade, {
      left: { sell: trade.left.sell.toString(10) },
      right: { sell: trade.right.sell.toString(10) }
    })
  },
  fromJSON(json: ITradeInternalJson): ITradeInternal {
    return mergeDeepRight(json, {
      left: { sell: D(json.left.sell) },
      right: { sell: D(json.right.sell) }
    })
  }
}

export const BalancesSerDe = {
  toJSON(balances: IExchangeBalances): IExchangeBalancesJson {
    let json: IExchangeBalancesJson = {}

    for (let key of Object.keys(balances)) {
      const b = balances[key]
      const item: { free: string; locked: string } = {
        free: b.free.toString(10),
        locked: b.locked.toString(10)
      }
      json[key] = item
    }

    return json
  },

  fromJSON(json: IExchangeBalancesJson): IExchangeBalances {
    let balances: IExchangeBalances = {}

    for (let key of Object.keys(json)) {
      const b = json[key]
      const item: { free: BigNumber; locked: BigNumber } = {
        free: D(b.free),
        locked: D(b.locked)
      }

      balances[key] = item
    }

    return balances
  },

  toAPIRecords(address: Address, balances: IExchangeBalances): JSONAPIObject {
    const serializer = new JSONAPISerializer('balances', {
      attributes: ['asset', 'free', 'locked'],
      keyForAttribute: 'camelCase'
    })

    const records = Object.entries(balances).map(([asset, amounts]) => {
      return {
        id: `${address}.${asset}`,
        asset,
        free: amounts.free,
        locked: amounts.locked
      }
    })

    return serializer.serialize(records)
  },

  async fromAPIRecords(
    balanceRecords: JSONAPIObject
  ): Promise<IExchangeBalancesJson> {
    const deserializer = new JSONAPIDeserializer({
      keyForAttribute: 'camelCase'
    })

    const deserializedRecords = await deserializer.deserialize(balanceRecords)

    let balances: IExchangeBalancesJson = {}

    for (const record of deserializedRecords) {
      balances[record.asset] = {
        free: record.free,
        locked: record.locked
      }
    }

    return balances
  }
}

export const OrderBookSerDe = {
  toJSON(orderBook: IOrderBook): IOrderBookJson {
    const toStr = (bidAsk: BidAsk) => ({
      price: bidAsk.price.toString(10),
      amount: bidAsk.amount.toString(10)
    })

    const bids = orderBook.bids.map(toStr)
    const asks = orderBook.asks.map(toStr)

    return { ...orderBook, bids, asks }
  },

  fromJSON(json: IOrderBookJson): IOrderBook {
    const toBigNumber = (bidAsk: JsonBidAsk) => ({
      price: D(bidAsk.price),
      amount: D(bidAsk.amount)
    })

    const bids = json.bids.map(toBigNumber)
    const asks = json.asks.map(toBigNumber)

    return { ...json, bids, asks }
  },

  toAPIRecord(orderBook: IOrderBook): JSONAPIObject {
    const serializer = new JSONAPISerializer('orderbooks', {
      id: 'symbol',
      attributes: ['symbol', 'level', 'bids', 'asks', 'timestamp', 'datetime'],
      keyForAttribute: 'camelCase'
    })

    return serializer.serialize(OrderBookSerDe.toJSON(orderBook))
  },

  async fromAPIRecord(orderBookRecord: JSONAPIObject): Promise<IOrderBookJson> {
    const deserializer = new JSONAPIDeserializer({
      id: 'symbol',
      keyForAttribute: 'camelCase'
    })
    return deserializer.deserialize(orderBookRecord)
  }
}

export const SignedApprovalSerDe = {
  fromJSON(json: ISignedApprovalJson): ISignedApproval {
    let res: ISignedApproval = {
      params: {
        approvalId: json.params.approvalId,
        intent: json.params.intent,
        buy: {
          asset: json.params.buy.asset,
          amount: D(json.params.buy.amount)
        },
        sell: {
          asset: json.params.sell.asset,
          amount: D(json.params.sell.amount)
        },
        owner: json.params.owner,
        round: json.params.round,

        instanceId: json.params.instanceId
      },
      ownerSig: json.ownerSig
    }

    return res
  },

  toJSON(signedApproval: ISignedApproval): ISignedApprovalJson {
    let res: ISignedApprovalJson = {
      params: {
        approvalId: signedApproval.params.approvalId.toString(),
        intent: signedApproval.params.intent,
        buy: {
          asset: signedApproval.params.buy.asset,
          amount: signedApproval.params.buy.amount.toString(10)
        },
        sell: {
          asset: signedApproval.params.sell.asset,
          amount: signedApproval.params.sell.amount.toString(10)
        },
        owner: signedApproval.params.owner,
        round: signedApproval.params.round,

        instanceId: signedApproval.params.instanceId
      },
      ownerSig: signedApproval.ownerSig
    }

    return res
  }
}

export const L2OrderSerDe = {
  fromJSON(json: IL2OrderJson): IL2Order {
    const res: IL2Order = {
      orderApproval: SignedApprovalSerDe.fromJSON(json.orderApproval),
      feeApproval: SignedApprovalSerDe.fromJSON(json.feeApproval)
    }
    return res
  },

  toJSON(l2order: IL2Order): IL2OrderJson {
    return {
      orderApproval: SignedApprovalSerDe.toJSON(l2order.orderApproval),
      feeApproval: SignedApprovalSerDe.toJSON(l2order.feeApproval)
    }
  },

  toAPIRecord(l2order: IL2OrderJson): JSONAPIObject {
    const serializer = new JSONAPISerializer('orders', {
      attributes: ['orderApproval', 'feeApproval'],
      keyForAttribute: 'camelCase'
    })

    return serializer.serialize(l2order)
  },

  async fromAPIRecord(l2orderRecord: JSONAPIObject): Promise<IL2OrderJson> {
    const deserializer = new JSONAPIDeserializer({
      keyForAttribute: 'camelCase'
    })

    return deserializer.deserialize(l2orderRecord)
  }
}

export const SignedFillSerDe = {
  toJSON(fill: ISignedFill): ISignedFillJson {
    return mergeDeepRight(fill, {
      params: {
        buyAmount: fill.params.buyAmount.toString(10),
        sellAmount: fill.params.sellAmount.toString(10)
      }
    })
  },

  fromJSON(json: ISignedFillJson): ISignedFill {
    return mergeDeepLeft(
      {
        params: {
          buyAmount: D(json.params.buyAmount),
          sellAmount: D(json.params.sellAmount)
        }
      },
      json
    )
  },

  toAPIRecords(signedFills: ISignedFill[]): JSONAPIObject {
    const serializer = new JSONAPISerializer('fills', {
      id: 'fillId',
      attributes: ['params', 'signature'],
      keyForAttribute: 'camelCase'
    })

    const fillJsons = signedFills.map(SignedFillSerDe.toJSON)

    return serializer.serialize(fillJsons)
  },

  async fromAPIRecords(records: JSONAPIObject): Promise<ISignedFillJson[]> {
    const deserializer = new JSONAPIDeserializer({
      id: 'fillId',
      keyForAttribute: 'camelCase'
    })

    return deserializer.deserialize(records)
  }
}

export const TransactedSerDe = {
  fromJSON(json: ITransactedJson): ITransacted {
    return {
      bought: D(json.bought),
      sold: D(json.sold)
    }
  }
}

export namespace ProofSerDe {
  export function toJSON(proof: IProof): IProofJson {
    return mergeDeepRight(proof, {
      clientOpeningBalance: proof.clientOpeningBalance.toString(10),
      sums: proof.sums.map(s => s.toString(10)),
      height: proof.height.toString(10),
      width: proof.width.toString(10),
      round: proof.round.toString(10)
    })
  }

  export function fromJSON(json: IProofJson): IProof {
    return mergeDeepLeft(
      {
        clientOpeningBalance: D(json.clientOpeningBalance),
        sums: json.sums.map(s => D(s)),
        height: D(json.height),
        width: D(json.width),
        round: D(json.round).toNumber()
      },
      json
    )
  }

  const apiSerializer = new JSONAPISerializer('proofs', {
    attributes: [
      'clientOpeningBalance',
      'clientAddress',
      'hashes',
      'sums',
      'tokenAddress',
      'height',
      'width',
      'round'
    ],
    keyForAttribute: 'camelCase',
    transform: (proof: IProof) => {
      const json: any = ProofSerDe.toJSON(proof)
      json.id = `${proof.clientAddress}.${proof.tokenAddress}`
      return json
    }
  })

  const apiDeserializer = new JSONAPIDeserializer({
    keyForAttribute: 'camelCase',
    transform: record => {
      delete record.id
      return record
    }
  })

  export function toAPIRecords(proofs: IProof[]): JSONAPIObject {
    return apiSerializer.serialize(proofs)
  }

  export async function fromAPIRecords(
    proofRecords: JSONAPIObject
  ): Promise<IProofJson[]> {
    return apiDeserializer.deserialize(proofRecords)
  }
}

export namespace AuthSerDe {
  const apiSerializer = new JSONAPISerializer('authorizations', {
    attributes: ['clientAddress', 'sig', 'round'],
    keyForAttribute: 'camelCase',
    transform: (authorizationMessage: IAuthorizationMessage) => {
      const json: any = {
        clientAddress: authorizationMessage.clientAddress,
        round: authorizationMessage.round,
        sig: authorizationMessage.sig
      }
      return json
    }
  })

  const apiDeserializer = new JSONAPIDeserializer({
    keyForAttribute: 'camelCase'
  })

  export function toAPIRecord(
    authorizationMessage: IAuthorizationMessage
  ): JSONAPIObject {
    return apiSerializer.serialize(authorizationMessage)
  }

  export async function fromAPIRecord(
    authRecord: JSONAPIObject
  ): Promise<IAuthorizationMessageJson> {
    return apiDeserializer.deserialize(authRecord)
  }
}

export const LedgerAccountSerDe = {
  toJSON(account: ILedgerAccount): ILedgerAccountJson {
    return {
      ...account,
      deposited: account.deposited.toString(10),
      withdrawn: account.withdrawn.toString(10),
      bought: account.bought.toString(10),
      sold: account.sold.toString(10),
      locked: account.locked.toString(10)
    }
  },

  fromJSON(json: ILedgerAccountJson): ILedgerAccount {
    return {
      ...json,
      deposited: D(json.deposited),
      withdrawn: D(json.withdrawn),
      bought: D(json.bought),
      sold: D(json.sold),
      locked: D(json.locked)
    }
  }
}
