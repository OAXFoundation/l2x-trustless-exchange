// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import { Validation } from '../../../src/common/Validation'
import { ISignedFill } from '../../../src/common/types/Fills'
import { D } from '../../../src/common/BigNumberUtils'

describe('Signed Fill validation', () => {
  const validate = Validation.validateSignedFill
  const validObj: ISignedFill = {
    params: {
      fillId: '0',
      approvalId: '0',
      round: 0,
      buyAmount: D('500'),
      buyAsset: '0x334aC8c04538F9d6DFBC0454C77B844a4433a405',
      sellAmount: D('1'),
      sellAsset: '0x2334AA407a0227e1cD16F8Fc7499c96732248577',
      clientAddress: '0xdb0B572bc49c3d68d721AE498745cDb2ACdCF12F',
      instanceId: '0x3440389C565bA390BE5605413Ae3126850e2c2a4'
    },
    signature:
      '0x6c69d85a26b601fd2ccebc674de3b664a81b83e70058fce7d53e5377e81f51cd1a43103150d68bff1b3b9491333ca98c9c85dcca70a1f1f2148016414534c8eb1b'
  }

  describe('Given a valid signed fill message', () => {
    it('validation passes', () => {
      expect(() => validate(validObj)).not.toThrow()
    })
  })

  describe('Given an empty signed fill message', () => {
    it('validation fails', () => {
      // @ts-ignore`
      expect(() => validate({})).toThrow()
    })
  })
})
