// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import { AssetRegistry } from '../src/common/AssetRegistry'

describe('AssetRegistry', () => {
  let registry: AssetRegistry

  describe('Lifecycle Management', () => {
    it('new works', () => {
      expect(() => new AssetRegistry()).not.toThrow()
    })
  })

  describe('IAsset Management', () => {
    beforeEach(() => {
      registry = new AssetRegistry()
    })

    describe('Add asset', () => {
      it('add works', () => {
        const symbol = 'WETH'
        const address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

        expect(() => registry.add(symbol, address)).not.toThrow()
      })

      it('throws when given a non-string as symbol', () => {
        const symbol = 42
        const address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

        // @ts-ignore
        expect(() => registry.add(symbol, address)).toThrow(
          `'${symbol}' is not a valid symbol. Alphanumeric string expected.`
        )
      })

      it('throws when given an empty string as symbol', () => {
        const symbol = ''
        const address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

        expect(() => registry.add(symbol, address)).toThrow(
          `'${symbol}' is not a valid symbol. Alphanumeric string expected.`
        )
      })

      it('throws when given non-alphanumeric string as symbol', () => {
        const symbol = 'fg#7v'
        const address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

        expect(() => registry.add(symbol, address)).toThrow(
          `'${symbol}' is not a valid symbol. Alphanumeric string expected.`
        )
      })

      it('throws when given invalid address', () => {
        const symbol = 'WETH'
        const address = 'invalid-address'

        expect(() => registry.add(symbol, address)).toThrow(
          `'${address}' is not a valid address.`
        )
      })
    })

    describe('getAddress', () => {
      it('getAddress works', () => {
        const symbol = 'WETH'
        const address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

        registry.add(symbol, address)

        expect(() => registry.getAddress(symbol)).not.toThrow()
      })

      it('returns undefined when given an unknown symbol', () => {
        const symbol = 'WETH'

        const returnedAddress = registry.getAddress(symbol)

        expect(returnedAddress).toBeUndefined()
      })
    })

    describe('getSymbol', () => {
      it('getSymbol works', () => {
        const symbol = 'WETH'
        const address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

        registry.add(symbol, address)

        expect(() => registry.getSymbol(address)).not.toThrow()
      })

      it('returns undefined when given an unknown address', () => {
        const address = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'

        const returnedAddress = registry.getSymbol(address)

        expect(returnedAddress).toBeUndefined()
      })
    })
  })
})
