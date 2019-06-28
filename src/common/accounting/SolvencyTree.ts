// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { utils } from 'ethers'
import {
  IAccount,
  Digest,
  ILiability,
  IPartialProof,
  Round
} from '../types/BasicTypes'

import { IRootInfo } from '../types/OperatorAndClientTypes'

import { GenericMerkleTree } from '../GenericMerkleTree'
import { D } from '../BigNumberUtils'

import { BigNumber } from 'bignumber.js'

export class SolvencyTree extends GenericMerkleTree<IAccount, ILiability> {
  constructor(accounts: IAccount[]) {
    super(accounts)
  }

  hash(account: IAccount): ILiability {
    const { sum, address, round } = account
    const data = [sum.toString(10), address, round]
    const hash = utils.solidityKeccak256(
      ['uint256', 'address', 'uint256'],
      data
    )
    return { hash, sum }
  }

  combineHash(a: ILiability, b: ILiability): ILiability {
    const sum = a.sum.plus(b.sum)
    const data = [sum.toString(10), a.hash, b.hash]
    const hash = utils.solidityKeccak256(
      ['uint256', 'bytes32', 'bytes32'],
      data
    )
    return {
      hash,
      sum
    }
  }

  isValidNode(node: ILiability): boolean {
    return node.sum.gte(D('0'))
  }

  compare(a: ILiability, b: ILiability): number {
    return a.hash.localeCompare(b.hash)
  }

  equals(x: ILiability, y: ILiability): boolean {
    return x.hash === y.hash && x.sum.isEqualTo(y.sum)
  }

  getHeight(): BigNumber {
    return new BigNumber(this.levels.length)
  }

  getWidth(): BigNumber {
    return new BigNumber(this.rawLeaves.length)
  }

  getRootWithPadding(): Digest {
    const rootContent = this.getRoot()
    const height = this.getHeight().toString()
    const width = this.getWidth().toString()

    const rootWithSum = utils.solidityKeccak256(
      ['bytes32', 'uint256'],
      [rootContent.hash, rootContent.sum.toString(10)]
    )

    const rootWithPadding = utils.solidityKeccak256(
      ['bytes32', 'uint256', 'uint256'],
      [rootWithSum, height, width]
    )
    return rootWithPadding
  }

  public getRootInfo(): IRootInfo {
    const rootInfo = {
      content: this.getRoot().hash,
      height: this.getHeight(),
      width: this.getWidth()
    }

    return rootInfo
  }

  getProof(account: IAccount, round: Round): IPartialProof {
    const liabilities = this.getLiabilities(account)
    const height = this.getHeight()
    const width = this.getWidth()

    const res = {
      liabilities: liabilities,
      height: height,
      width: width,
      round: round
    }

    return res
  }
}

export function verifyProof(
  proof: ILiability[],
  root: ILiability,
  account: IAccount
): boolean {
  const tree = new SolvencyTree([])
  return tree.validateProof(proof, root, account)
}
