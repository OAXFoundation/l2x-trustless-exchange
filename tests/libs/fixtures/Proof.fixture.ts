// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { D } from '../../../src/common/BigNumberUtils'
import { Proof } from '../../../src/common/types/SmartContractTypes'

const client = '0x4D1C697F9ca52d0D8fbCee8017E048cc1b8514D3'
const sum = D('3000000000000000000')
const round = 1

export const sampleProof = new Proof(
  sum,
  client,
  [
    '0x5ef6424dad23a4614031cefb4f57c6966b41c96b4ff75f5890a9b3c16ad7a8f6',
    '0x0cebcdc5b5a1bbf313ceab906ad34bb03f2a45f0bd38f8dce3b6b8e3f5759b5e'
  ],
  [D('4000000000000000000'), D('0')],
  '0x30f70AA88040da7BfBD0317E7fc121361C6AbB9B',
  D('3'),
  D('4'),
  round
)
