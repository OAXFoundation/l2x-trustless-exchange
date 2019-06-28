// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import { IMarket } from '../src/common/types/ExchangeTypes'
import { AssetRegistry } from '../src/common/AssetRegistry'
import Markets, { marketToSymbol, symbolToMarket } from '../src/common/Markets'
import { exchangeFixtures } from './libs/fixtures/Exchange.fixture'
import { D } from '../src/common/BigNumberUtils'

describe('Markets', () => {
  const BTC = exchangeFixtures.BTC
  const USD = exchangeFixtures.USD

  const symbol = 'USD/BTC'

  const market: IMarket = {
    base: USD,
    quote: BTC
  }

  describe('marketToSymbol', () => {
    it('marketToSymbol works', () => {
      const registry = new AssetRegistry()
      registry.add('USD', USD)
      registry.add('BTC', BTC)

      const symbol = marketToSymbol(registry, market)

      expect(symbol).toEqual('USD/BTC')
    })
  })

  describe('symbolToMarket', () => {
    it('symbolToMarket works', () => {
      const registry = new AssetRegistry()
      registry.add('USD', USD)
      registry.add('BTC', BTC)

      const result = symbolToMarket(registry, symbol)

      expect(result).toEqual(market)
    })
  })

  describe('buy', () => {
    it('buy works', () => {
      const result = Markets.buy(market, D('1'), D('0.0002'))

      expect(result).toEqual({
        buy: {
          asset: market.base,
          amount: D('1e18')
        },
        sell: {
          asset: market.quote,
          amount: D('2e14')
        }
      })
    })
  })

  describe('sell', () => {
    it('sell works', () => {
      const result = Markets.sell(market, D('1'), D('0.0002'))

      expect(result).toEqual({
        buy: {
          asset: market.quote,
          amount: D('2e14')
        },
        sell: {
          asset: market.base,
          amount: D('1e18')
        }
      })
    })
  })
})
