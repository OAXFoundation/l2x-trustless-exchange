// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

// /* eslint-env jest */

import 'jest'
import {
  Address,
  Amount,
  AssetAddress,
  Intent,
  Round
} from '../src/common/types/BasicTypes'
import { D } from '../src/common/BigNumberUtils'
import { ApprovalsFunctions } from '../src/common/types/Approvals'

describe('How smart contracts types are used', () => {
  const OAXContractAddress: Address =
    '0xcb03c51785af5db269FF7b9bD2ABf257058692B3'
  const WETHContractAddress: Address =
    '0xb5807D769f4587331C3689bfbFF9c39F6F995A8D'

  it('shows how to create a unique identifier for an approval', () => {
    const round: Round = 2
    const buyAsset: AssetAddress = OAXContractAddress
    const buyAmount: Amount = D('60')
    const sellAsset: AssetAddress = WETHContractAddress
    const sellAmount: Amount = D('15')
    const intent: Intent = 'buyAll'

    //Deterministic approval identifier generation
    const nonce =
      '0xee1ec5e5520792dfeb9fe6356b1520bfd16706f27f17a3e0945aa678106155cc'
    let uniqueIdentifier = ApprovalsFunctions.generateUniqueIdentifier(
      round,
      buyAsset,
      buyAmount,
      sellAsset,
      sellAmount,
      intent,
      nonce
    )
    expect(uniqueIdentifier).toEqual(
      '0x663eb1e2de3c8707a9572e12defca4bdc1e6a0d2ef5890c0013ddd5544b2a6f9'
    )

    //Random nonce generated inside the function
    uniqueIdentifier = ApprovalsFunctions.generateUniqueIdentifier(
      round,
      buyAsset,
      buyAmount,
      sellAsset,
      sellAmount,
      intent
    )
    expect(uniqueIdentifier.length).toEqual(66)
  })
})
