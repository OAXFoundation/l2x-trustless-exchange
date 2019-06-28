// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { BigNumber } from 'bignumber.js'
import R from 'ramda'
import { TOKEN_DECIMALS } from '../../common/Constants'
import { D, floor, ceil } from '../../common/BigNumberUtils'
import {
  Amount,
  IAmounts,
  ApprovalId,
  Id,
  Intent,
  Round
} from '../../common/types/BasicTypes'

import {
  IFillExchange,
  MarketSide,
  IMatchParams,
  ISwapAmounts,
  ITradeInternal
} from '../../common/types/ExchangeTypes'

import { IApproval } from '../../common/types/Approvals'
import { generateUniqueIdentifierTrade } from '../../common/UniqueId'

export function isBuy(intent: Intent): boolean {
  return intent === 'buyAll'
}

export function side(intent: Intent): MarketSide {
  return isBuy(intent) ? 'buy' : 'sell'
}

export function approvalToPrice(offer: IAmounts): Amount {
  return price(offer.buy.amount, offer.sell.amount)
}

export function price(buy: Amount, sell: Amount) {
  return buy.div(sell)
}

function mulByPrice(
  amount: Amount,
  offer: Pick<IMatchParams, 'buy' | 'sell'>
): BigNumber {
  return amount.times(offer.buy.amount).div(offer.sell.amount)
}

function divByPrice(
  amount: Amount,
  offer: Pick<IMatchParams, 'buy' | 'sell'>
): BigNumber {
  return amount.times(offer.sell.amount).div(offer.buy.amount)
}

function checkIntegerAmounts({
  buy,
  sell,
  remaining
}: Pick<IMatchParams, 'buy' | 'sell' | 'remaining'>) {
  for (const amount of [buy.amount, sell.amount, remaining]) {
    if (!floor(amount, TOKEN_DECIMALS).eq(amount)) {
      throw Error(`Matching only works with integer amounts: got ${amount}`)
    }
  }
}

/**
 * Compute amounts to exchange between two Approvals selected for matching.
 *
 * Note: Throws if any amounts are not integers.
 *
 * @param left The params of the approval being matched against existing orders
 * @param right The params of the existing approval in the orderbook.
 * @return The asset amounts to exchange between the two approvals.
 */
export function matchLeftRight<
  T extends Pick<IMatchParams, 'buy' | 'sell' | 'intent' | 'remaining'>
>(left: T, right: T): ISwapAmounts {
  // assume left is buying ETH for USD
  //   - ETH
  //     - left.buy.asset
  //     - right.sell.asset
  //   - USD
  //     - left.sell.asset
  //     - right.buy.asset

  for (const params of [left, right]) {
    checkIntegerAmounts(params)
  }

  // The price is dictated by the existing (maker) order because the taker
  // wants to execute at the best price they can get.
  // const price = computePrice(right) // in USD / ETH
  //
  // In practise we use helper functions `divByPrice` and `mulByPrice` to
  // avoid losing precision in the divison.

  let fromRight, fromLeft

  if (isBuy(left.intent)) {
    const rightSellAvailable = isBuy(right.intent)
      ? divByPrice(right.remaining, right)
      : right.remaining

    fromRight = BigNumber.min(left.remaining, rightSellAvailable) // in ETH
    // Round up to keep honoring the makers price.
    fromLeft = ceil(mulByPrice(fromRight, right), TOKEN_DECIMALS) // in USD
  } else {
    const rightBuyAvailable = isBuy(right.intent)
      ? right.remaining
      : mulByPrice(right.remaining, right)

    fromLeft = BigNumber.min(left.remaining, rightBuyAvailable) // in USD
    // Round down to keep honoring the makers price.
    fromRight = floor(divByPrice(fromLeft, right), TOKEN_DECIMALS) // in ETH
  }

  // We could now be violating the takers (left) price due to the rounding.
  // In practice because our precision will likely be 8 decimals and we have
  // 18 on chain I think it's unlikely this will ever happen. If we were to
  // create such a fill however it could be used to halt the Mediator.
  //
  //  Do not match if
  //
  //               left.sell.amount     fromLeft
  //  matchPrice = ----------------  <  -------- = fillPrice
  //               left.buy.amount      fromRight
  //
  //  But multiply up divisors to be precise.
  const leftHand = left.sell.amount.times(fromRight)
  const rightHand = fromLeft.times(left.buy.amount)

  if (leftHand.lt(rightHand)) {
    fromLeft = D('0')
    fromRight = D('0')
  }

  // We can only have precision up to TOKEN_DECIMALS on-chain.
  if (!floor(fromRight, TOKEN_DECIMALS).eq(fromRight)) {
    throw Error(`fromRight ${fromRight.toString(10)} is fractional.`)
  }
  if (!floor(fromLeft, TOKEN_DECIMALS).eq(fromLeft)) {
    throw Error(`fromLeft ${fromLeft.toString(10)} is fractional.`)
  }

  return { fromLeft, fromRight }
}

/**
 * Match a new taker order against existing maker orders.
 *
 * @param left taker order
 * @param rights maker orders, note: must be sorted by highest priority first
 * @returns array of swap instructions
 */
export function matchLeft<
  T extends Pick<IMatchParams, 'buy' | 'sell' | 'intent' | 'remaining'>
>(left: T, rights: T[]): ISwapAmounts[] {
  const { intent } = left
  const side = isBuy(intent) ? 'buy' : 'sell'
  const totalToFill = left[side].amount

  const { swaps } = R.reduceWhile(
    ({ remaining }, _) => remaining.gt(D('0')),
    ({ swaps, remaining }, right) => {
      const available = { ...left, remaining }
      const swap = matchLeftRight(available, right)
      const filled = isBuy(intent) ? swap.fromRight : swap.fromLeft
      return {
        swaps: [...swaps, swap],
        remaining: remaining.minus(filled)
      }
    },
    { swaps: [] as ISwapAmounts[], remaining: totalToFill },
    rights
  )
  return swaps.filter(
    ({ fromLeft, fromRight }) => fromLeft.gt(D('0')) && fromRight.gt(D('0'))
  )
}

export function isMatchable<
  T extends Pick<IMatchParams, 'owner' | 'buy' | 'sell'>
>(left: T, right: T): boolean {
  return (
    priceMatch(left, right) &&
    left.buy.asset === right.sell.asset &&
    left.sell.asset === right.buy.asset
  )
}

export function filter<
  T extends Pick<IMatchParams, 'owner' | 'buy' | 'sell' | 'remaining'>
>(left: T, rights: T[]): T[] {
  return R.filter(
    right =>
      isMatchable(left, right) &&
      left.remaining.gte(D('1')) &&
      right.remaining.gte(D('1')),
    rights
  )
}

export function comparePrice<T extends Pick<IMatchParams, 'buy' | 'sell'>>(
  a: T,
  b: T
): number {
  const aPrice = approvalToPrice(a)
  const bPrice = approvalToPrice(b)

  return aPrice.comparedTo(bPrice)
}

export function priceMatch<T extends Pick<IMatchParams, 'buy' | 'sell'>>(
  left: T,
  right: T
) {
  /**
   * Done buy multiplying denominators up to maintain precision.
   *
   * We're checking if
   *
   *      leftBuy     rightSell
   *      -------- <= ---------
   *      leftSell     rightBuy
   **/
  return left.buy.amount
    .times(right.buy.amount)
    .lte(left.sell.amount.times(right.sell.amount))
}

function comparePriority<T extends Pick<IMatchParams, 'priority'>>(
  a: T,
  b: T
): number {
  return a.priority - b.priority
}

// Sort by price, then by priority
export function sort<T extends Pick<IMatchParams, 'buy' | 'sell' | 'priority'>>(
  potentialMatches: T[]
): T[] {
  const fns: ((a: T, b: T) => number)[] = [comparePrice, comparePriority]
  return R.sortWith(fns, potentialMatches)
}

function convertUnits(places: number) {
  return {
    toMatchUnit: (n: BigNumber) => {
      return n.shiftedBy(-places)
    },
    toWei: (n: BigNumber) => {
      return n.shiftedBy(places)
    }
  }
}

export function createSwaps<
  T extends Pick<IMatchParams, 'buy' | 'sell' | 'intent' | 'remaining'>
>(left: T, sortedRights: T[], decimalPlaces: number): ISwapAmounts[] {
  const { toMatchUnit, toWei } = convertUnits(TOKEN_DECIMALS - decimalPlaces)

  const paramsToMatchUnit = (matchParams: T) => {
    const { buy, sell, remaining } = matchParams
    return R.mergeDeepRight(R.clone(matchParams), {
      buy: { amount: toMatchUnit(buy.amount) },
      sell: { amount: toMatchUnit(sell.amount) },
      remaining: toMatchUnit(remaining)
    })
  }

  const swapAmountsToWei = (swapAmounts: ISwapAmounts) => ({
    fromLeft: toWei(swapAmounts.fromLeft),
    fromRight: toWei(swapAmounts.fromRight)
  })

  return matchLeft(
    paramsToMatchUnit(left),
    sortedRights.map(paramsToMatchUnit)
  ).map(swapAmountsToWei)
}

export function createTrades<T extends IMatchParams>(
  left: T,
  rights: T[],
  decimalPlaces: number
): ITradeInternal[] {
  const sorted = sort(filter(left, rights))
  const swaps = createSwaps(left, sorted, decimalPlaces)

  return R.map(
    ([swap, right]) =>
      createTrade(left.approvalId, right.approvalId, swap, left.round),
    // R.zip generates an array with length of the shorter argument
    R.zip<ISwapAmounts, T>(swaps, sorted)
  )
}

export function createTrade(
  leftId: ApprovalId,
  rightId: ApprovalId,
  swap: ISwapAmounts,
  round: Round
): ITradeInternal {
  return {
    tradeId: generateUniqueIdentifierTrade(),
    timestamp: Date.now(),
    left: { approvalId: leftId, sell: swap.fromLeft },
    right: { approvalId: rightId, sell: swap.fromRight },
    round
  }
}

export function createFillParams(
  trade: ITradeInternal
): [IFillExchange, IFillExchange] {
  return [
    mkFillParams(
      trade.left.approvalId,
      trade.right.sell,
      trade.left.sell,
      trade.round
    ),
    mkFillParams(
      trade.right.approvalId,
      trade.left.sell,
      trade.right.sell,
      trade.round
    )
  ]
}

function mkFillParams(
  approvalId: Id,
  buy: Amount,
  sell: Amount,
  round: Round
): IFillExchange {
  return {
    approvalId,
    round,
    buy: { amount: buy },
    sell: { amount: sell }
  }
}

export function mkMatch(
  approval: IApproval,
  remaining: Amount,
  priority: number
): IMatchParams {
  return { ...approval, remaining, priority }
}
