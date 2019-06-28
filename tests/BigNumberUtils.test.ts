// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import { BigNumber } from 'bignumber.js'
import {
  add,
  D,
  etherToD,
  sum,
  representable
} from '../src/common/BigNumberUtils'

describe('BigNumberUtils', function() {
  const zero = D('0')
  const half = D('0.5')
  const one = D('1')

  describe('D convenience factory', () => {
    it('works with strings', () => {
      expect(D('0')).toEqual(zero)
      expect(D('0.5')).toEqual(half)
      expect(D('1')).toEqual(one)
    })
    it('is idempotent / works with BigNumbers', () => {
      expect(D(zero)).toEqual(zero)
      expect(D(half)).toEqual(half)
      expect(D(one)).toEqual(one)
    })

    describe('sum', () => {
      it('sums up array of BigNumbers correctly', () => {
        expect(sum([])).toEqual(zero)
        expect(sum([one])).toEqual(one)
        expect(sum([one, half])).toEqual(D('1.5'))
      })
    })
    describe('add', () => {
      it('adds BigNumbers correctly', () => {
        expect(add(one, half)).toEqual(D('1.5'))
      })
    })

    describe('etherToD', () => {
      it('works for 1 ether', () => {
        expect(etherToD('1')).toEqual(D('1e18'))
      })

      it('works for for big ethers', () => {
        const eth = etherToD(D('1e36').toString(10))
        const wei = D('1e54')
        expect(eth).toEqual(wei)
      })
    })
  })

  describe('Jest equality matcher', () => {
    it('.toEqual works for BigNumber', () => {
      expect(D('1')).toEqual(D('1'))
    })

    it('.not.toEqual works for BigNumber', () => {
      expect(D('1')).not.toEqual(D('10'))
    })

    it('works with unsafe integers', () => {
      // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/MAX_SAFE_INTEGER
      const maxSafeInteger = new BigNumber(Number.MAX_SAFE_INTEGER)

      expect(maxSafeInteger.plus(1)).not.toEqual(maxSafeInteger.plus(2))
    })
  })

  describe('.toEqual custom Jest matcher', () => {
    it('works for equality test', () => {
      expect(D('1')).toEqual(D('1'))
    })

    it('works for inequality test', () => {
      expect(D('1')).toEqual(D('1'))
    })
  })

  describe('representable', () => {
    it('works', () => {
      const eightDecimals = D('1e10')
      expect(representable(eightDecimals, 7)).toBeFalsy()
      expect(representable(eightDecimals, 8)).toBeTruthy()

      const nineDecimals = D('1e9')
      expect(representable(nineDecimals, 8)).toBeFalsy()
      expect(representable(nineDecimals, 9)).toBeTruthy()
    })
  })

  describe('BigNumber safety', () => {
    const one = D('1')
    const two = D('2')

    describe('calling toString()', () => {
      it('does not show maximum 256-bit unsigned integer in exponential notation', () => {
        const MAX_INT_256 = two.pow(256).minus(D('1'))
        expect(MAX_INT_256.toString()).toStrictEqual(
          '115792089237316195423570985008687907853269984665640564039457584007913129639935'
        )
      })
    })

    describe('when used in primitive operations', () => {
      const errMsg = 'Conversion to primitive type is prohibited'

      it('throws when used with +', () => {
        // @ts-ignore
        expect(() => one + two).toThrow(errMsg)
      })

      it('throws when used with -', () => {
        // @ts-ignore
        expect(() => one - two).toThrow(errMsg)
      })

      it('throws when used with *', () => {
        // @ts-ignore
        expect(() => one * two).toThrow(errMsg)
      })

      it('throws when used with /', () => {
        // @ts-ignore
        expect(() => one / two).toThrow(errMsg)
      })

      it('throws when used with >', () => {
        expect(() => one > two).toThrow(errMsg)
      })

      it('throws when used with >=', () => {
        expect(() => one >= two).toThrow(errMsg)
      })

      it('throws when used with <', () => {
        expect(() => one < two).toThrow(errMsg)
      })

      it('throws when used with <=', () => {
        expect(() => one <= two).toThrow(errMsg)
      })
    })
  })
})
