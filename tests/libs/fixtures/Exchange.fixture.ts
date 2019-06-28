// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { mainnet } from '../../../config/asset-registry/assets'
import { D } from '../../../src/common/BigNumberUtils'
import {
  ITradeExternal,
  ITradeJson
} from '../../../src/common/types/ExchangeTypes'

const BTC = '0x3F8B7c08CC8d604b1761De1314db9C0240fc7cD6'
const USD = '0x9971C4453F59373D7cd8B49ec08a7bF2E793F760'
const OAX = '0x783009cCd21d42278edC51B7475ab565eb68Af0D'

const balances = {
  [mainnet.assets.WETH.address]: { free: D('25'), locked: D('10') },
  [mainnet.assets.OAX.address]: { free: D('200'), locked: D('33') }
}

const balancesJson = {
  [mainnet.assets.WETH.address]: { free: '25', locked: '10' },
  [mainnet.assets.OAX.address]: { free: '200', locked: '33' }
}

const trades: ITradeExternal[] = [
  {
    info: null,
    id: 'Id',
    timestamp: 12341234,
    datetime: '2019-01-05T02:02:28+00:00',
    symbol: 'WETH/OAX',
    order: 'Id',
    type: 'limit',
    side: 'buy',
    price: D('1234.23'),
    amount: D('987')
  }
]

const tradesJson: ITradeJson[] = [
  {
    info: {},
    id: 'Id',
    timestamp: 12341234,
    datetime: '2019-01-05T02:02:28+00:00',
    symbol: 'WETH/OAX',
    order: 'Id',
    type: 'limit',
    side: 'buy',
    price: '1234.23',
    amount: '987'
  }
]

export const exchangeFixtures = {
  BTC,
  USD,
  OAX,
  balances,
  balancesJson,
  trades,
  tradesJson
}
