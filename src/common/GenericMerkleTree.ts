// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { isNil, splitEvery } from 'ramda'

export type MerkleTree<T> = T[][]

interface NodeIndex {
  level: number
  pos: number
}

export abstract class GenericMerkleTree<U, T> {
  protected readonly levels: MerkleTree<T>
  protected readonly rawLeaves: U[]

  protected constructor(elements: U[]) {
    this.rawLeaves = elements
    const leaves = elements.map(element => this.hash(element))
    this.levels = this.computeLevels(leaves)
  }

  getLiabilities(element: U): T[] {
    const leaf = this.hash(element)
    let idx = this.findLeafIndex(leaf)

    if (idx === -1) {
      throw Error('Element does not exist in Merkle tree')
    }

    const indices = proofIndices(idx, this.levels)
    return indices.map(i => this.getNode(i))
  }

  getRoot(): T {
    return topLevel(this.levels)[0]
  }

  validateProof(proof: T[], root: T, item: U): boolean {
    let leaf = this.hash(item)

    if ([leaf, ...proof].some(n => !this.isValidNode(n))) {
      return false
    }

    const computedRoot = proof.reduce(
      (head, sibling) => this.computeInternalNode(head, sibling),
      leaf
    )

    return this.equals(computedRoot, root)
  }

  isValidNode(_node: T): boolean {
    return true
  }

  abstract hash(preimage: U): T
  abstract combineHash(x: T, y: T): T
  abstract compare(x: T, y: T): number
  abstract equals(x: T, y: T): boolean

  private nextLevel(level: T[]): T[] {
    return splitEvery(2, level).map(([a, b]: T[]) =>
      this.computeInternalNode(a, b)
    )
  }

  private computeLevels(leaves: T[]): MerkleTree<T> {
    if (leaves.length == 0) {
      return [[]]
    }
    const levels = [leaves]

    while (!hasRootLevel(levels)) {
      const currentLevel = topLevel(levels)
      levels.push(this.nextLevel(currentLevel))
    }

    return levels
  }

  private computeInternalNode(a: T, b: T): T {
    const [left, right] = this.sortNodes(a, b)
    return isNil(b) ? a : this.combineHash(left, right)
  }

  private sortNodes(...nodes: T[]): T[] {
    return nodes.sort(this.compare)
  }

  private getNode(i: NodeIndex): T {
    return this.levels[i.level][i.pos]
  }

  private findLeafIndex(node: T) {
    return leaves(this.levels).findIndex((leaf, _idx, _leaves) =>
      this.equals(leaf, node)
    )
  }
}

function hasRootLevel<T>(tree: MerkleTree<T>): boolean {
  return topLevel(tree).length == 1
}

function topLevel<T>(tree: MerkleTree<T>): T[] {
  return tree[tree.length - 1]
}

function siblingIndex(idx: number): number {
  return idx % 2 === 0 ? idx + 1 : idx - 1
}

function parentIndex(idx: number) {
  return Math.trunc(idx / 2)
}

export function leaves<T>(tree: MerkleTree<T>): T[] {
  return tree[0]
}

function proofIndices<T>(idx: number, tree: T[][]): NodeIndex[] {
  const indices = []
  let currentIdx = idx

  for (let level = 0; level < tree.length; level++) {
    const pos = siblingIndex(currentIdx)
    if (pos < tree[level].length) {
      indices.push({ level, pos })
    }
    currentIdx = parentIndex(currentIdx)
  }

  return indices
}
