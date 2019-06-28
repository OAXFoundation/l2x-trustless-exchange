// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import BigNumber from 'bignumber.js'
import { path, mergeDeepRight } from 'ramda'
import { DeepPartial } from 'ts-essentials'

import {
  IApproval,
  ISignedApproval,
  ISignedApprovalJson
} from '../../../src/common/types/Approvals'
import { D } from '../../../src/common/BigNumberUtils'
import { exchangeFixtures } from './Exchange.fixture'
import {
  L2OrderSerDe,
  SignedApprovalSerDe
} from '../../../src/common/types/SerDe'
import { SOME_ADDRESS } from '../SystemFixture'
import { IL2Order, IL2OrderJson } from '../../../src/common/types/ExchangeTypes'

const ownerSig =
  '0xbe8cf4d300ffeb658ee72d4b5acf165e02e83d9b0ca3ed98da6cf457497b63fa1dba8ac0cc6543ab13fd460c496ee15b56bc8d63794cb170fa6abadc23f9a5541c'
/**
 * The "canonical" sample approval
 */
export const sampleApproval: ISignedApproval = {
  params: {
    approvalId: 'right',
    buy: { asset: 'USD', amount: D('2e10') },
    sell: { asset: 'BTC', amount: D('2e10') },
    round: 0,
    intent: 'buyAll',
    owner: 'bob',
    instanceId: SOME_ADDRESS
  },
  ownerSig
}

/**
 * Typesafe way to parameterize sampleApproval
 *
 * @param partials The partial parameters to customize the approval
 */
export function makeApprovalFixture(
  partials: DeepPartial<ISignedApproval> = {},
  template: ISignedApproval = sampleApproval
): ISignedApproval {
  const cloned = mergeDeepRight(template, partials)

  const getAmount = (
    side: string,
    approval: DeepPartial<ISignedApproval>
  ): BigNumber | undefined => path(['params', side, 'amount'], approval)

  if (getAmount('buy', partials) !== undefined) {
    cloned.params.buy.amount = D(<BigNumber>getAmount('buy', partials))
  }

  if (getAmount('sell', partials) !== undefined) {
    cloned.params.sell.amount = D(<BigNumber>getAmount('sell', partials))
  }

  return cloned
}

const approval: IApproval = {
  approvalId:
    '0x864bfd1ac60568dda6ec808ef2a4cbf0aec4f560fbb997cec037f58a37927bbe',
  round: 0,
  buy: {
    asset: exchangeFixtures.BTC,
    amount: D('1e18')
  },
  sell: {
    asset: exchangeFixtures.USD,
    amount: D('4.7868e20')
  },
  intent: 'buyAll',
  owner: '0xe46C1F986C0030B902c590D4617f6006A2113f55',
  instanceId: SOME_ADDRESS
}

const signedApproval: ISignedApproval = {
  params: approval,
  ownerSig:
    '0xea4c2717aacd2a9f46eb96d367767e597d5833fad1d09d86555c7f6e8449085863eda6e59f2a66bf42606a83b6f515ed7fdf4d179b98708a13b5718490930a811b'
}

const feeApproval: IApproval = {
  approvalId:
    '0x5dd31ced72e82cdf3edd7864555a90416b798b7a0fc1cc3ca7d1f060e6b70f45',
  round: approval.round,
  buy: {
    asset: exchangeFixtures.OAX,
    amount: D('0')
  },
  sell: {
    asset: exchangeFixtures.OAX,
    amount: D('10')
  },
  intent: 'sellAll',
  owner: approval.owner,
  instanceId: approval.instanceId
}

const signedFeeApproval: ISignedApproval = {
  params: feeApproval,
  ownerSig:
    '0x0a194091ce75b097e786c75940096b007586e6bc2aa835676b04b43b20911b74217c29640c376ca17b413b61a3f91b69f591f6f2b66db744f73b0386f71cd9001b'
}

const signedApprovalNegativeBuy: ISignedApproval = {
  params: {
    approvalId:
      '0x864bfd1ac60568dda6ec808ef2a4cbf0aec4f560fbb997cec037f58a37927bbe',
    round: 0,
    buy: {
      asset: '0x3F8B7c08CC8d604b1761De1314db9C0240fc7cD6',
      amount: D('-1000000000000000000')
    },
    sell: {
      asset: '0x9971C4453F59373D7cd8B49ec08a7bF2E793F760',
      amount: D('4.7868e20')
    },
    intent: 'buyAll',
    owner: '0xe46C1F986C0030B902c590D4617f6006A2113f55',
    instanceId: SOME_ADDRESS
  },
  ownerSig:
    '0x94933cb2c7eec1bba981210a12391051a46b9d53d3518d98c081f1cbef8ab8102630539de856b38bf2f5d11c29d4bddca848ea4615d3e167c99f533dd4a35efb1b'
}

const signedApprovalNegativeSell: ISignedApproval = {
  params: {
    approvalId:
      '0x864bfd1ac60568dda6ec808ef2a4cbf0aec4f560fbb997cec037f58a37927bbe',
    round: 0,
    buy: {
      asset: '0x3F8B7c08CC8d604b1761De1314db9C0240fc7cD6',
      amount: D('1e18')
    },
    sell: {
      asset: '0x9971C4453F59373D7cd8B49ec08a7bF2E793F760',
      amount: D('-478680000000000000000')
    },
    intent: 'buyAll',
    owner: '0xe46C1F986C0030B902c590D4617f6006A2113f55',
    instanceId: SOME_ADDRESS
  },
  ownerSig
}

const signedApprovalJson: ISignedApprovalJson = SignedApprovalSerDe.toJSON(
  signedApproval
)

const l2order: IL2Order = {
  orderApproval: signedApproval,
  feeApproval: signedFeeApproval
}

const l2orderNegativeBuy: IL2Order = {
  orderApproval: signedApprovalNegativeBuy,
  feeApproval: signedFeeApproval
}

const l2orderNegativeSell: IL2Order = {
  orderApproval: signedApprovalNegativeSell,
  feeApproval: signedFeeApproval
}

const l2orderJson: IL2OrderJson = L2OrderSerDe.toJSON(l2order)

export const approvalFixtures = {
  approval,
  signedApproval,
  signedApprovalJson,
  signedApprovalNegativeBuy,
  signedApprovalNegativeSell,
  signedFeeApproval,
  l2orderJson,
  l2order,
  l2orderNegativeBuy,
  l2orderNegativeSell
}
