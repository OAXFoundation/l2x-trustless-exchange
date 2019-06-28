// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'

import {
  SolvencyTree,
  verifyProof
} from '../src/common/accounting/SolvencyTree'
import { D } from '../src/common/BigNumberUtils'

const ROUND = 2

describe('SolvencyTree', () => {
  it('validates for a correct with even number of nodes', () => {
    const leaves = [
      {
        address: '0x3c3330d71d212b2b782508d70fff9271cdc12f60',
        sum: D('1'),
        round: ROUND
      },
      {
        address: '0x28f79858ad6f46ea8b0e022b77bd4a031087adcd',
        sum: D('2'),
        round: ROUND
      },
      {
        address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
        sum: D('3'),
        round: ROUND
      },
      {
        address: '0x408e05ee6c7051509dca1875829b57486ef29b26',
        sum: D('4'),
        round: ROUND
      }
    ]

    const tree = new SolvencyTree(leaves)
    expect(tree.getRoot().sum.toString()).toEqual('10')

    for (const leaf of leaves) {
      const proof = tree.getLiabilities(leaf)
      const root = tree.getRoot()
      const proofResult = tree.validateProof(proof, root, leaf)

      expect(proofResult).toBeTruthy()
    }
  })

  it('validates for a correct with odd number of nodes', () => {
    const leaves = [
      {
        address: '0x3c3330d71d212b2b782508d70fff9271cdc12f60',
        sum: D('1'),
        round: ROUND
      },
      {
        address: '0x28f79858ad6f46ea8b0e022b77bd4a031087adcd',
        sum: D('2'),
        round: ROUND
      },
      {
        address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
        sum: D('3'),
        round: ROUND
      }
    ]

    const tree = new SolvencyTree(leaves)
    expect(tree.getRoot().sum.toString()).toEqual('6')

    for (const leaf of leaves) {
      const proof = tree.getLiabilities(leaf)
      const root = tree.getRoot()
      const proofResult = tree.validateProof(proof, root, leaf)

      expect(proofResult).toBeTruthy()
    }
  })

  it('proof validation fails for negative balances', () => {
    const leaves = [
      {
        address: '0x3c3330d71d212b2b782508d70fff9271cdc12f60',
        sum: D('-1'),
        round: ROUND
      },
      {
        address: '0x28f79858ad6f46ea8b0e022b77bd4a031087adcd',
        sum: D('3'),
        round: ROUND
      },
      {
        address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
        sum: D('5'),
        round: ROUND
      },
      {
        address: '0x408e05ee6c7051509dca1875829b57486ef29b26',
        sum: D('-7'),
        round: ROUND
      }
    ]

    const tree = new SolvencyTree(leaves)
    expect(tree.getRoot().sum.toString()).toEqual('0')

    for (const leaf of leaves) {
      const proof = tree.getLiabilities(leaf)
      const root = tree.getRoot()
      const proofResult = tree.validateProof(proof, root, leaf)

      expect(proofResult).toBeFalsy()
    }
  })

  it('validates correct proof with static method', () => {
    const leaves = [
      {
        address: '0x3c3330d71d212b2b782508d70fff9271cdc12f60',
        sum: D('1'),
        round: ROUND
      },
      {
        address: '0x28f79858ad6f46ea8b0e022b77bd4a031087adcd',
        sum: D('2'),
        round: ROUND
      },
      {
        address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
        sum: D('3'),
        round: ROUND
      },
      {
        address: '0x408e05ee6c7051509dca1875829b57486ef29b26',
        sum: D('4'),
        round: ROUND
      }
    ]

    const tree = new SolvencyTree(leaves)

    const leaf = leaves[0]
    const proof = tree.getLiabilities(leaf)
    const root = tree.getRoot()
    const proofResult = verifyProof(proof, root, leaf)
    expect(proofResult).toBeTruthy()
  })
})
