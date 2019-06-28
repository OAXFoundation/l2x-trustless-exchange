// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import R from 'ramda'
import 'jest'
import * as jsc from 'jsverify'

import { itHolds } from './libs/jsverifyJestCompat'
import { price, priceMatch, createSwaps } from '../src/server/exchange/Matching'
import { mkTestMatch } from './libs/fixtures/Matching'
import { TOKEN_DECIMALS } from '../src/common/Constants'
import { D, floor } from '../src/common/BigNumberUtils'

type TestAmounts = {
  leftBuy: number
  leftSell: number
  rightBuy: number
  rightSell: number
}

/**
 * Calculate an amount (integer) by flooring the result of 10^n.
 *
 * This allows us to generate a range of input amounts for the matching
 * from the uniform number ranges that the jsverify generator produces.
 *
 * @param n The exponent
 * @param decimalPlaces Number of decimal places to round to.
 * @return The amount
 */
function toAmount(n: number, decimalPlaces: number) {
  const exact = D(Math.pow(10, n).toString())
  const rounded = floor(exact, decimalPlaces)
  if (rounded.gt(D('1e38'))) {
    throw Error(
      `Exchange only support tokens with supply up to 1e38, this amount is ${rounded}`
    )
  }
  return rounded
}

function recordGen(numGen: jsc.Arbitrary<number>) {
  return jsc.record({
    leftBuy: numGen,
    leftSell: numGen,
    rightBuy: numGen,
    rightSell: numGen
  })
}

function checkMatchingProperties(numbers: TestAmounts, decimalPlaces: number) {
  const { leftBuy, leftSell, rightBuy, rightSell } = R.mapObjIndexed(
    num => toAmount(num, decimalPlaces),
    numbers
  )

  const left = mkTestMatch(leftBuy, leftSell)
  const right = mkTestMatch(rightBuy, rightSell)

  // only test if the prices are compatible
  if (priceMatch(left, right)) {
    const [{ fromLeft, fromRight }] = createSwaps(left, [right], decimalPlaces)

    const requiredZeros = TOKEN_DECIMALS - decimalPlaces
    const minAmount = D('1').shiftedBy(requiredZeros)

    if (fromLeft.lt(minAmount)) {
      throw Error(`fromLeft ${fromLeft} is less than minAmount ${minAmount}`)
    }

    if (fromRight.lt(minAmount)) {
      throw Error(`fromRight ${fromRight} is less than minAmount ${minAmount}`)
    }

    const matchPrice = price(fromRight, fromLeft)
    const leftPrice = price(left.buy.amount, left.sell.amount)
    const rightPrice = price(right.sell.amount, right.buy.amount)

    if (leftPrice.gt(matchPrice)) {
      throw Error(
        `leftPrice ${leftPrice} greater than matchPrice ${matchPrice}`
      )
    }
    if (matchPrice.gt(rightPrice)) {
      throw Error(
        `matchPrice ${matchPrice} greater than rightPrice ${rightPrice}`
      )
    }
  }
}

describe('Order Matching with 18 decimals', () => {
  // Create amounts from 1 to 10^38 (the max amount we might support)
  // 10^x where x is in [0, 38]
  const decimalPlaces = 18
  const requiredZeros = TOKEN_DECIMALS - decimalPlaces
  const natPos = jsc.number(requiredZeros, 38)

  itHolds<TestAmounts>(
    'creates non-zero fill amounts and satisfies price constraints',
    recordGen(natPos),
    numbers => {
      expect(() =>
        checkMatchingProperties(numbers, decimalPlaces)
      ).not.toThrow()
    },
    { tests: 100 }
  )

  /* This test would fail due to a zero fill amount if the result of the price
     division is rounded to zero.
  */
  it('it works with the max representable amount', () => {
    expect(() =>
      checkMatchingProperties(
        { leftBuy: 0, leftSell: 0, rightBuy: 0, rightSell: 38 },
        decimalPlaces
      )
    ).not.toThrow()
  })

  it('it fails with an amount larger than the max representable amount', () => {
    expect(() =>
      checkMatchingProperties(
        { leftBuy: 10, leftSell: 10, rightBuy: 10, rightSell: 38.0000001 },
        decimalPlaces
      )
    ).toThrow()
  })
})

describe('Order Matching with 8 decimals', () => {
  // Create amounts from 10^10 to 10^38 (the max amount we might support)
  // 10^x where x is in [10, 38]
  const decimalPlaces = 8
  const requiredZeros = TOKEN_DECIMALS - decimalPlaces
  const natPos = jsc.number(requiredZeros, 38)

  itHolds<TestAmounts>(
    'creates fill amounts with at least minimum amount that satisfy the price constraints',
    recordGen(natPos),
    numbers => {
      expect(() =>
        checkMatchingProperties(numbers, decimalPlaces)
      ).not.toThrow()
    },
    { tests: 100 }
  )

  it('it works with the max representable amount', () => {
    expect(() =>
      checkMatchingProperties(
        { leftBuy: 10, leftSell: 10, rightBuy: 10, rightSell: 38 },
        decimalPlaces
      )
    ).not.toThrow()
  })
  it('it fails with an amount larger than the max representable amount', () => {
    expect(() =>
      checkMatchingProperties(
        { leftBuy: 10, leftSell: 10, rightBuy: 10, rightSell: 38.0000001 },
        decimalPlaces
      )
    ).toThrow()
  })

  // Our test amount transformation does not work with huge amounts (like 1e381)
  // To prevent hard to understand test failures, we check if it would throw an
  // error in such a case.
  it('it fails with a huge amount', () => {
    expect(() =>
      checkMatchingProperties(
        { leftBuy: 0, leftSell: 0, rightBuy: 0, rightSell: 381 },
        decimalPlaces
      )
    ).toThrow()
  })
})
