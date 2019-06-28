// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import R from 'ramda'
import { Address, AssetAddress, Intent } from '../src/common/types/BasicTypes'

import { IMatchParams, ISwapAmounts } from '../src/common/types/ExchangeTypes'

import { TOKEN_DECIMALS } from '../src/common/Constants'
import { D } from '../src/common/BigNumberUtils'
import {
  createTrade,
  createTrades,
  filter,
  matchLeftRight,
  matchLeft,
  sort,
  isBuy
} from '../src/server/exchange/Matching'
import { mkTestMatch } from './libs/fixtures/Matching'
import { SOME_ADDRESS } from './libs/SystemFixture'

function mkPriority(
  buy: number | string,
  sell: number | string,
  priority: number = 0
): Pick<IMatchParams, 'buy' | 'sell' | 'priority'> {
  return { ...mkTestMatch(buy, sell), priority }
}

function mkFilter(owner: Address, buy: AssetAddress, sell: AssetAddress) {
  return {
    owner,
    buy: { asset: buy, amount: D('1') },
    sell: { asset: sell, amount: D('1') },
    remaining: D('1'),
    round: 0
  }
}

function checkLeftRightMatch(
  [leftBuy, leftSell]: [number, number],
  [rightBuy, rightSell]: [number, number],
  [fromLeft, fromRight]: [number, number],
  intent: Intent = 'buyAll'
): ISwapAmounts {
  const taker = {
    ...mkTestMatch(leftBuy, leftSell),
    intent,
    remaining: D((isBuy(intent) ? leftBuy : leftSell).toString(10))
  }

  const maker = {
    ...mkTestMatch(rightBuy, rightSell),
    remaining: D(rightBuy.toString(10)),
    intent: 'buyAll' as Intent
  }

  const changes = matchLeftRight(taker, maker)

  return expect(changes).toEqual({
    fromLeft: D(fromLeft.toString(10)),
    fromRight: D(fromRight.toString(10))
  })
}

describe('IOrder', function() {
  describe('matchLeftRight', () => {
    it('fully fills for exactly matching orders', () => {
      checkLeftRightMatch([1, 2], [2, 1], [2, 1])
    })

    it('fully fills covered taker order', () => {
      checkLeftRightMatch([1, 2], [4, 2], [2, 1])
    })

    it('partially fills covered taker order as much as possible', () => {
      checkLeftRightMatch([2, 4], [2, 1], [2, 1])
    })

    it('with remainders, it rounds correctly', () => {
      checkLeftRightMatch([5, 3], [3, 7], [3, 5])
    })

    it('partially fills at better price if maker offers better price', () => {
      checkLeftRightMatch([4, 4], [1, 2], [1, 2])
    })

    describe('intents', () => {
      const left: [number, number] = [2, 2]
      const right: [number, number] = [2, 4]

      it('for buy intent it fills buy side at best price', () => {
        checkLeftRightMatch(left, right, [1, 2], 'buyAll')
      })

      it('for sell intent it fills sell side at best price', () => {
        checkLeftRightMatch(left, right, [2, 4], 'sellAll')
      })
    })
  })

  describe('compute match amounts', () => {
    // Given an approval and existing approvals to match against.
    // Generate the matching fills until either the order is satisfied
    // or there is nothing left to match.
    it('works for one match', () => {
      const left = mkTestMatch(1, 2, 'buyAll')
      const existing = [mkTestMatch(2, 1)]
      const expected = [{ fromLeft: D('2'), fromRight: D('1') }]
      expect(matchLeft(left, existing)).toEqual(expected)
    })

    it('works for one match against two approvals', () => {
      const left = mkTestMatch(1, 2, 'buyAll')
      const existing = [mkTestMatch(2, 1), mkTestMatch(2, 1)]
      const expected = [{ fromLeft: D('2'), fromRight: D('1') }]
      expect(matchLeft(left, existing)).toEqual(expected)
    })

    it('works for two matches against two approvals for buy intent', () => {
      const left = mkTestMatch(2, 4, 'buyAll')
      const existing = [mkTestMatch(2, 1), mkTestMatch(2, 1)]
      const expected = [
        { fromLeft: D('2'), fromRight: D('1') },
        { fromLeft: D('2'), fromRight: D('1') }
      ]
      expect(matchLeft(left, existing)).toEqual(expected)
    })

    // dupe of above with sellAll
    it('works for two matches against two approvals for sell intent', () => {
      const left = mkTestMatch(2, 4, 'sellAll')
      const existing = [mkTestMatch(2, 1), mkTestMatch(2, 1)]
      const expected = [
        { fromLeft: D('2'), fromRight: D('1') },
        { fromLeft: D('2'), fromRight: D('1') }
      ]
      expect(matchLeft(left, existing)).toEqual(expected)
    })

    it('works for two matches against two approvals if second match is partial', () => {
      const left = mkTestMatch(3, 6, 'sellAll')
      const existing = [mkTestMatch(4, 2), mkTestMatch(4, 2)]
      const expected = [
        { fromLeft: D('4'), fromRight: D('2') },
        { fromLeft: D('2'), fromRight: D('1') }
      ]
      expect(matchLeft(left, existing)).toEqual(expected)
    })
  })

  describe('compute remaining based on fills', () => {
    // Given an approval and a list of fills on the approval
    // compute the remaining amount of the order.
  })

  describe('sorting according to priority', () => {
    const cheap = mkPriority(1, 2)
    const normal = mkPriority(1, 1)
    const expensive = mkPriority(2, 1)
    const sorted = [cheap, normal, expensive]

    it('works on empty array', () => {
      expect(sort([])).toEqual([])
    })

    it('works with one item', () => {
      expect(sort([cheap])).toEqual([cheap])
    })

    it('works for BigNumber comparison edge case', () => {
      // When using comparison operators, BN.toValue() is called and the
      // resulting strings are compared.
      // This doesn't always give correct results:
      //
      //   > (new bn.BigNumber("0.000001")).valueOf()
      //     '0.000001'
      //   > (new bn.BigNumber("0.0000001")).valueOf()
      //     '1e-7'
      //
      // The first character '1' is "greater than" '0'.
      //
      // This test fails if we use comparison operators to compare the prices.
      const cheap = mkPriority('1', '1000000')
      const evenCheaper = mkPriority('1', '10000000')
      expect(sort([cheap, evenCheaper])).toEqual([evenCheaper, cheap])
    })

    describe('by price', () => {
      it('sorts', () => {
        expect(sort([normal, expensive, cheap])).toEqual(sorted)
      })

      it('is idempotent', () => {
        expect(sort(sorted)).toEqual(sorted)
      })

      it('works on equal items', () => {
        expect(sort([cheap, cheap])).toEqual([cheap, cheap])
      })
    })
    describe('by priority', () => {
      const early = { ...cheap, priority: 0 }
      const punctual = { ...cheap, priority: 1 }
      const late = { ...cheap, priority: 2 }
      const sortedByTime = [early, punctual, late]

      it('sorts', () => {
        expect(sort([punctual, late, early])).toEqual(sortedByTime)
      })

      it('is idempotent', () => {
        expect(sort(sortedByTime)).toEqual(sortedByTime)
      })

      it('works on equal items', () => {
        expect(sort([early, early])).toEqual([early, early])
      })
    })
    describe('with price and priority', () => {
      it('gives priority to price', () => {
        const earlyExpensive = { ...expensive, priority: 0 }
        const lateCheap = { ...cheap, priority: 1 }
        expect(sort([earlyExpensive, lateCheap])).toEqual([
          lateCheap,
          earlyExpensive
        ])
      })
    })
  })

  describe('filtering', () => {
    const left = mkFilter('alice', 'btc', 'usd')

    it('works with no items', () => {
      expect(filter(left, [])).toEqual([])
    })

    it('does not remove approvals from the same address', () => {
      const right = mkFilter('alice', 'usd', 'btc')
      expect(filter(left, [right])).toEqual([right])
    })

    it('removes approvals with non-matching left buy asset', () => {
      const right = mkFilter('bob', 'usd', 'eth')
      expect(filter(left, [right])).toEqual([])
    })

    it('removes approvals with non-matching left sell asset', () => {
      const right = mkFilter('bob', 'eur', 'btc')
      expect(filter(left, [right])).toEqual([])
    })

    it('keeps approvals with different owner and matching assets', () => {
      const right = mkFilter('bob', 'usd', 'btc')
      expect(filter(left, [right])).toEqual([right])
    })

    it('removes approvals with zero remaining amounts', () => {
      const right = mkFilter('bob', 'usd', 'btc')
      expect(filter(left, [{ ...right, remaining: D('0') }])).toEqual([])
    })

    it('removes incompatible prices', () => {
      const right = mkFilter('bob', 'usd', 'btc')

      expect(
        filter(left, [
          R.mergeDeepRight(right, {
            buy: { amount: right.buy.amount.plus('1e-10') }
          })
        ])
      ).toEqual([])

      expect(
        filter(left, [
          R.mergeDeepRight(right, {
            sell: { amount: right.sell.amount.minus('1e-10') }
          })
        ])
      ).toEqual([])
    })
  })

  describe('trades', () => {
    it('createTrade works', () => {
      const swap = { fromLeft: D('0'), fromRight: D('1') }
      const trade = createTrade('left', 'right', swap, 0)

      expect(trade.left.sell).toEqual(D('0'))
      expect(trade.right.sell).toEqual(D('1'))
      expect(trade.tradeId).toHaveLength(34)
      expect(trade.tradeId).toMatch(/^(0x)[a-f0-9]+$/i)
    })

    describe('matchApproval', () => {
      it('matchApproval works', () => {
        const left: IMatchParams = {
          approvalId: 'left',
          buy: { asset: 'btc', amount: D('1') },
          sell: { asset: 'usd', amount: D('2') },
          round: 1,
          intent: 'buyAll',
          owner: 'alice',
          priority: 0,
          instanceId: SOME_ADDRESS,
          remaining: D('1')
        }
        const right: IMatchParams = {
          approvalId: 'right',
          buy: { asset: 'usd', amount: D('2') },
          sell: { asset: 'btc', amount: D('1') },
          round: 1,
          intent: 'buyAll',
          owner: 'bob',
          priority: 0,
          instanceId: SOME_ADDRESS,
          remaining: D('2')
        }
        const [trade] = createTrades(left, [right], TOKEN_DECIMALS)
        expect(trade.left.approvalId).toEqual('left')
        expect(trade.right.approvalId).toEqual('right')
        expect(trade.left.sell).toEqual(D('2'))
        expect(trade.right.sell).toEqual(D('1'))
      })
    })
  })
})
