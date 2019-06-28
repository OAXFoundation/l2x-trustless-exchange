// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { AssetRegistry } from './AssetRegistry'
import { Amount, ILot } from './types/BasicTypes'
import { IMarket } from './types/ExchangeTypes'
import { D } from './BigNumberUtils'

export const PRECISION = D('1e18')

/**
 * Look up the base and quote symbols of a market in an IAsset Registry and
 * returns the symbol for the market
 *
 * @param registry
 * @param market
 */
export function marketToSymbol(
  registry: AssetRegistry,
  market: IMarket
): string {
  const base = registry.getSymbol(market.base)
  const quote = registry.getSymbol(market.quote)

  return `${base}/${quote}`
}

/**
 * Look up the base and quote addresses of a symbol in an IAsset Registry and
 * returns the IMarket
 *
 * @param registry
 * @param symbol
 */
export function symbolToMarket(
  registry: AssetRegistry,
  symbol: string
): IMarket {
  const [baseSymbol, quoteSymbol] = symbol.split('/')

  const base = registry.getAddress(baseSymbol)
  const quote = registry.getAddress(quoteSymbol)

  if (base === undefined || quote === undefined) {
    throw Error(`No market for symbol '${symbol}'`)
  }

  return { base, quote }
}

export function buy(
  market: IMarket,
  amount: Amount,
  price: Amount
): { buy: ILot; sell: ILot } {
  const amountInBaseUnit = amount.times(PRECISION)

  return {
    buy: {
      asset: market.base,
      amount: amountInBaseUnit
    },
    sell: {
      asset: market.quote,
      amount: price.times(amountInBaseUnit)
    }
  }
}

export function sell(
  market: IMarket,
  amount: Amount,
  price: Amount
): { buy: ILot; sell: ILot } {
  const amountInBaseUnit = amount.times('1e18')

  return {
    buy: {
      asset: market.quote,
      amount: price.times(amountInBaseUnit)
    },
    sell: {
      asset: market.base,
      amount: amountInBaseUnit
    }
  }
}

export default {
  toSymbol: marketToSymbol,
  fromSymbol: symbolToMarket,
  buy,
  sell
}
