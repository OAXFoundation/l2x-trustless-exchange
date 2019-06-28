// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import 'jest'

import { EthereumBlockchain } from '../../libs/EthereumBlockchain'
import { D } from '../../../src/common/BigNumberUtils'
import { SolvencyTree } from '../../../src/common/accounting/SolvencyTree'
import { MediatorMock } from '../../../src/contracts/wrappers/MediatorMock'

describe('validate function checks a proof against a root', () => {
  let contract: MediatorMock
  let blockchain: EthereumBlockchain
  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()
    contract = blockchain.contract
  })

  it('validateMerkle function checks a proof against a root provided as input', async () => {
    const round = 1

    const accounts = [
      {
        address: '0x3c3330d71d212b2b782508d70fff9271cdc12f60',
        sum: D('1'),
        round: round
      },
      {
        address: '0x28f79858ad6f46ea8b0e022b77bd4a031087adcd',
        sum: D('2'),
        round: round
      },
      {
        address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
        sum: D('3'),
        round: round
      },
      {
        address: '0x408e05ee6c7051509dca1875829b57486ef29b26',
        sum: D('4'),
        round: round
      }
    ]

    const tree = new SolvencyTree(accounts)

    const hashes = tree.getLiabilities(accounts[0]).map(n => n.hash)
    const sums = tree.getLiabilities(accounts[0]).map(n => n.sum.toString())

    const rootWithPadding = tree.getRootWithPadding()

    const leaf = tree.hash(accounts[0]).hash
    const sum = accounts[0].sum.toString()

    const height = tree.getHeight()
    const width = tree.getWidth()

    const result = await contract.functions.isMerkleProofValid(
      hashes,
      sums,
      rootWithPadding,
      leaf,
      sum,
      height.toString(10),
      width.toString(10)
    )
    expect(result).toBeTruthy()
  })

  it('protects against overflow', async () => {
    const MAX_INT_256 = D('2')
      .pow(256)
      .minus(D('1'))
      .toString(10)

    const proof = [
      '0x29273633f642bbc775c0d85e33e560905e32fcce967d477a0ae5f76258da6e06',
      '0x0069c4e89d9c086ac88de205a556eae6dc34c830267b69e8508cc7b457476674'
    ]

    const sums = ['1', '2']

    const root =
      '0xff4801ad46e24917a0eb3069b3fb7f7593e1cb2432bc812d290d6c69b07f5e72'
    const leaf =
      '0x341f4a2bb22ca916b8eb9a69cb334260a1af03c87f9e3dd7fe39aa0c2339ac12'

    await expect(
      contract.functions.isMerkleProofValid(
        proof,
        sums,
        root,
        leaf,
        MAX_INT_256,
        1,
        2
      )
    ).rejects.toThrow(`call exception`)
  })
})
