// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import { BigNumber } from 'bignumber.js'
import {
  safeBigNumberToString,
  ethersBNToBigNumber
} from '../src/common/ContractUtils'
import { D } from '../src/common/BigNumberUtils'
// import {Contract} from 'ethers'
import { bigNumberify } from 'ethers/utils'

describe('safeBigNumberToString', () => {
  it('works on BigNumber instance', () => {
    const n = D('1')
    const convertedN = safeBigNumberToString(n)

    expect(convertedN).toStrictEqual('1')
  })

  it('ignores ethers.js BigNumber', () => {
    const n = bigNumberify('1')
    const convertedN = safeBigNumberToString(n)

    expect(convertedN).toStrictEqual(n)
  })

  it('ignores date', () => {
    const obj = Date.now()
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores maps', () => {
    const obj = new Map([[1, 2], [3, 4]])
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores sets', () => {
    const obj = new Set([1, 2, '3'])
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores buffers', () => {
    const obj = Buffer.from([1, 2, 3])
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores ArrayBuffer', () => {
    const obj = new ArrayBuffer(8)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Float32Array', () => {
    const obj = new Float32Array(3)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Float64Array', () => {
    const obj = new Float64Array(3)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Int8Array', () => {
    const obj = new Int8Array(1)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Int16Array', () => {
    const obj = new Int16Array(1)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Int32Array', () => {
    const obj = new Uint32Array(1)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores UInt8Array', () => {
    const obj = new Uint8Array(1)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores UInt16Array', () => {
    const obj = new Uint16Array(1)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores UInt32Array', () => {
    const obj = new Uint32Array(1)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Regex', () => {
    const obj = /some_regex/
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Error', () => {
    const obj = new Error()
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores symbols', () => {
    const obj = Symbol()
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores number', () => {
    const n = 1
    const convertedN = safeBigNumberToString(n)

    expect(convertedN).toStrictEqual(n)
  })

  it('ignores boxed number', () => {
    const obj = new Number(42)
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores string', () => {
    const n = '1'
    const convertedN = safeBigNumberToString(n)

    expect(convertedN).toStrictEqual(n)
  })

  it('ignores null', () => {
    const obj = null
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toBeNull()
  })

  it('ignores NaN', () => {
    const obj = NaN
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toBeNaN()
  })

  it('converts array', () => {
    const obj = [D('1'), D('2'), { level1: D('1') }]
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(['1', '2', { level1: '1' }])
  })

  it('converts tuples', () => {
    const obj: [BigNumber, number, string] = [D('1'), 2, '3']
    const convertedObj = safeBigNumberToString(obj)

    expect(convertedObj).toStrictEqual(['1', 2, '3'])
  })

  it('converts nested object', () => {
    const n = {
      level1BigNumber: D('1'),
      level2: {
        level2BigNumber: D('2'),
        otherLevel2Prop: 'should be ignored',
        level3: {
          level3BigNumber: D('3'),
          otherLevel3Prop: 3,
          arrayOfBigNumbers: [D('4'), D('5')]
        }
      }
    }
    const convertedN = safeBigNumberToString(n)

    expect(convertedN).toStrictEqual({
      level1BigNumber: '1',
      level2: {
        level2BigNumber: '2',
        otherLevel2Prop: 'should be ignored',
        level3: {
          level3BigNumber: '3',
          otherLevel3Prop: 3,
          arrayOfBigNumbers: ['4', '5']
        }
      }
    })
  })

  it('prototype information is untouched', () => {
    class DummyClass {}

    const k = new DummyClass()
    const clonedK = safeBigNumberToString(k)

    const kPrototype = Reflect.getPrototypeOf(k)
    const clonedKPrototype = Reflect.getPrototypeOf(clonedK)

    expect(clonedK).toEqual(k)
    expect(clonedKPrototype).toEqual(kPrototype)
  })
})

describe('ethersBNToBigNumber', () => {
  it('works on ethers.js BigNumber', () => {
    const n = bigNumberify('1')
    const convertedN = ethersBNToBigNumber(n)

    expect(convertedN).toStrictEqual(D('1'))
  })

  it('ignores BigNumber.js instance', () => {
    const n = D('1')
    const convertedN = ethersBNToBigNumber(n)

    expect(convertedN).toStrictEqual(n)
  })

  it('ignores date', () => {
    const obj = Date.now()
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores maps', () => {
    const obj = new Map([[1, 2], [3, 4]])
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores sets', () => {
    const obj = new Set([1, 2, '3'])
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores buffers', () => {
    const obj = Buffer.from([1, 2, 3])
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores ArrayBuffer', () => {
    const obj = new ArrayBuffer(8)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Float32Array', () => {
    const obj = new Float32Array(3)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Float64Array', () => {
    const obj = new Float64Array(3)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Int8Array', () => {
    const obj = new Int8Array(1)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Int16Array', () => {
    const obj = new Int16Array(1)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Int32Array', () => {
    const obj = new Uint32Array(1)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores UInt8Array', () => {
    const obj = new Uint8Array(1)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores UInt16Array', () => {
    const obj = new Uint16Array(1)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores UInt32Array', () => {
    const obj = new Uint32Array(1)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Regex', () => {
    const obj = /some_regex/
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores Error', () => {
    const obj = new Error()
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores symbols', () => {
    const obj = Symbol()
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores number', () => {
    const n = 1
    const convertedN = ethersBNToBigNumber(n)

    expect(convertedN).toStrictEqual(n)
  })

  it('ignores boxed number', () => {
    const obj = new Number(42)
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual(obj)
  })

  it('ignores string', () => {
    const n = '1'
    const convertedN = ethersBNToBigNumber(n)

    expect(convertedN).toStrictEqual(n)
  })

  it('ignores null', () => {
    const obj = null
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toBeNull()
  })

  it('ignores NaN', () => {
    const obj = NaN
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toBeNaN()
  })

  it('converts array', () => {
    const obj = [bigNumberify('1'), '2', { level1: bigNumberify('1') }]
    const convertedObj = ethersBNToBigNumber(obj)

    expect(convertedObj).toStrictEqual([D('1'), '2', { level1: D('1') }])
  })

  it('converts nested object', () => {
    const n = {
      level1BigNumber: bigNumberify('1'),
      level2: {
        level2BigNumber: bigNumberify('2'),
        otherLevel2Prop: 'should be ignored',
        level3: {
          level3BigNumber: bigNumberify('3'),
          otherLevel3Prop: 3,
          arrayOfBigNumbers: [bigNumberify('4'), bigNumberify('5')]
        }
      }
    }
    const convertedN = ethersBNToBigNumber(n)

    expect(convertedN).toStrictEqual({
      level1BigNumber: D('1'),
      level2: {
        level2BigNumber: D('2'),
        otherLevel2Prop: 'should be ignored',
        level3: {
          level3BigNumber: D('3'),
          otherLevel3Prop: 3,
          arrayOfBigNumbers: [D('4'), D('5')]
        }
      }
    })
  })

  it('prototype information is untouched', () => {
    class DummyClass {}

    const k = new DummyClass()
    const clonedK = ethersBNToBigNumber(k)

    const kPrototype = Reflect.getPrototypeOf(k)
    const clonedKPrototype = Reflect.getPrototypeOf(clonedK)

    expect(clonedK).toEqual(k)
    expect(clonedKPrototype).toEqual(kPrototype)
  })
})
