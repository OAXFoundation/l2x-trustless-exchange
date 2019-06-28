// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import { getContractFactory } from '../../../src/common/ContractUtils'
import { providers, Contract } from 'ethers'

import 'jest'
import { GETH_RPC_URL } from '../../../config/environment'

describe('Passing structs to contracts', () => {
  let contract: Contract
  const obj = { a: '1', b: '2' }

  beforeAll(async () => {
    const provider = new providers.JsonRpcProvider(GETH_RPC_URL)
    const factory = getContractFactory('Struct', provider.getSigner())
    const contractTmp = await factory.deploy()
    contract = await contractTmp.deployed()
  })

  it('accepts structs as input', async () => {
    const res = await contract.functions.acceptStruct(obj)
    expect(res.toString()).toEqual('3')
  })

  it('returns structs as output', async () => {
    const [a, b] = await contract.functions.returnStruct(obj.a, obj.b)
    expect(a.toString()).toEqual(obj.a)
    expect(b.toString()).toEqual(obj.b)
  })
})
