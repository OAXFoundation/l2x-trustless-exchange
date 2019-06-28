// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { parseEther } from 'ethers/utils'
import { BigNumber as EthersBigNumber } from 'ethers/utils/bignumber'
import { curry } from 'ramda'
import BigNumber from 'bignumber.js'
import { Amount } from './types/BasicTypes'
import { TOKEN_DECIMALS } from './Constants'

BigNumber.config({
  EXPONENTIAL_AT: [-1e9, 1e9],
  /**
   *   We support tokens with 18 decimals and total supply up to 1e20.
   *   We need at least 18 + 20 = 38 decimal places to prevent divisions
   *   from being rounded to zero
   */
  DECIMAL_PLACES: 40
})

// Prevent use in primitive operations.
// See https://mikemcl.github.io/bignumber.js/#type-coercion
BigNumber.prototype.valueOf = function() {
  throw Error('Conversion to primitive type is prohibited')
}

export function D(bnStr: string | BigNumber | EthersBigNumber): BigNumber {
  return new BigNumber(bnStr as string)
}

export function toEthersBn(n: string | BigNumber): EthersBigNumber {
  // Cannot go directly from BigNumber to EthersBigNumber
  const bnStr = typeof n == 'string' ? n.toString() : n.toString(10)
  return new EthersBigNumber(bnStr)
}

export function sum(bigNums: BigNumber[]): BigNumber {
  if (bigNums.length === 0) {
    return D('0')
  }

  return bigNums.reduce((sum, val) => sum.plus(val))
}

export const add = curry<BigNumber, BigNumber, BigNumber>((a, b) => a.plus(b))

export function etherToD(etherString: string): BigNumber {
  return new BigNumber(parseEther(etherString).toString())
}

export function etherToWei(amount: Amount): Amount {
  return etherToD(amount.toString(10))
}

export function weiToEther(amount: Amount): Amount {
  return amount.div(D('1e18'))
}

/**
 * Test if a number is accurately representable with a given number of decimal places.
 *
 * Note: There is hopefully a more concise way to write this.
 *
 * @param n the number
 * @param decimalPlaces the number of decimal places allowed
 * @param baseDecimals the number of implicit decimal places (18 when working in wei)
 */
export function representable(n: BigNumber, decimalPlaces: number): boolean {
  return floor(n, decimalPlaces).eq(n)
}

export function round(
  n: Amount,
  trailingZeros: number,
  roundingMethod: BigNumber.RoundingMode
) {
  return n
    .shiftedBy(-trailingZeros)
    .integerValue(roundingMethod)
    .shiftedBy(trailingZeros)
}

export function floor(n: Amount, decimalPlaces: number) {
  const trailingZeros = TOKEN_DECIMALS - decimalPlaces
  return round(n, trailingZeros, BigNumber.ROUND_FLOOR)
}

export function ceil(n: Amount, decimalPlaces: number) {
  const trailingZeros = TOKEN_DECIMALS - decimalPlaces
  return round(n, trailingZeros, BigNumber.ROUND_CEIL)
}
