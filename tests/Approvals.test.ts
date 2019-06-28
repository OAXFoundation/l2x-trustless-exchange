// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import BigNumber from 'bignumber.js'
import { DeepPartial } from 'ts-essentials'
import { mergeDeepRight } from 'ramda'

import {
  makeApprovalFixture,
  sampleApproval
} from './libs/fixtures/Approval.fixture'

import { D } from '../src/common/BigNumberUtils'
import { ISignedApproval } from '../src/common/types/Approvals'

describe('ISignedApproval Fixture', () => {
  describe('makeApprovalFixture', () => {
    it('makeApprovalFixture works', () => {
      const parameters = {}

      expect(() => makeApprovalFixture(parameters)).not.toThrow()
    })

    it('produces sampleApproval when not parameterized', () => {
      const parameters = {}

      const approval = makeApprovalFixture(parameters)

      expect(approval).toEqual(sampleApproval)
    })

    it('allows deep partial customization', () => {
      const parameters: DeepPartial<ISignedApproval> = {
        params: {
          buy: { asset: 'EUR' }
        },
        ownerSig: 'updated-sig'
      }

      const approval = makeApprovalFixture(parameters)
      const expectedApproval = mergeDeepRight(sampleApproval, parameters)

      expect(approval).toEqual(expectedApproval)
    })

    it('preserves unmodified BigNumbers', () => {
      const parameters = {}

      const approval = makeApprovalFixture(parameters)

      expect(BigNumber.isBigNumber(approval.params.buy.amount)).toEqual(true)
      expect(approval.params.buy.amount).toEqual(
        sampleApproval.params.buy.amount
      )

      expect(BigNumber.isBigNumber(approval.params.sell.amount)).toEqual(true)
      expect(approval.params.sell.amount).toEqual(
        sampleApproval.params.sell.amount
      )
    })

    it('allows deep partial customization of BigNumbers', () => {
      const parameters: DeepPartial<ISignedApproval> = {
        params: {
          buy: { amount: D('42') },
          sell: { amount: D('24') }
        }
      }

      const approval = makeApprovalFixture(parameters)

      expect(approval.params.buy.amount).toBeInstanceOf(BigNumber)
      expect(approval.params.buy.amount).toEqual(D('42'))
      expect(approval.params.sell.amount).toBeInstanceOf(BigNumber)
      expect(approval.params.sell.amount).toEqual(D('24'))
    })

    it('works with a template', () => {
      const templateParameters = {
        params: {
          buy: { asset: 'USD', amount: D('1') },
          sell: { asset: 'BTC', amount: D('3') }
        }
      }

      const template = makeApprovalFixture(templateParameters)

      const parameters = {
        params: {
          buy: { amount: D('2') },
          sell: { amount: D('6') }
        }
      }

      const approval = makeApprovalFixture(parameters, template)
      const expectedApproval = mergeDeepRight(sampleApproval, {
        params: {
          buy: { asset: 'USD', amount: D('2') },
          sell: { asset: 'BTC', amount: D('6') }
        }
      })

      expect(approval).toEqual(expectedApproval)
    })
  })
})
