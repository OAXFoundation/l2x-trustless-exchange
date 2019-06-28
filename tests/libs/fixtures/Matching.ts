// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import BigNumber from 'bignumber.js'
import { Intent } from '../../../src/common/types/BasicTypes'
import { IMatchParams } from '../../../src/common/types/ExchangeTypes'
import { D } from '../../../src/common/BigNumberUtils'
import { isBuy } from '../../../src/server/exchange/Matching'

export function mkTestMatch(
  buy: number | string | BigNumber,
  sell: number | string | BigNumber,
  intent: Intent = 'buyAll'
): Pick<IMatchParams, 'buy' | 'sell' | 'intent' | 'remaining'> {
  return {
    buy: { amount: D(buy.toString(10)), asset: 'btc' },
    sell: { amount: D(sell.toString(10)), asset: 'usd' },
    intent,
    remaining: isBuy(intent) ? D(buy.toString(10)) : D(sell.toString(10))
  }
}
