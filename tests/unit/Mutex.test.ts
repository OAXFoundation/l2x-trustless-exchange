// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import { Mutex } from '../../src/common/Mutex'

describe('Mutex', () => {
  let mutex: Mutex
  let sharedCounter = 0

  async function asyncOp(lock: boolean): Promise<void> {
    return new Promise(async resolve => {
      if (lock) {
        await mutex.lockAsync()
      }
      let localCounter = sharedCounter

      setTimeout(() => {
        localCounter += 1
        sharedCounter = localCounter
        if (lock) {
          mutex.unlock()
        }
        resolve()
      }, 0)
    })
  }

  beforeEach(() => {
    mutex = new Mutex()
    sharedCounter = 0
  })

  describe('When not locked', () => {
    it('a lock can be acquired', async () => {
      expect(mutex.isLocked()).toBe(false)

      await mutex.lockAsync()

      expect(mutex.isLocked()).toBe(true)
    })

    it('unlocking throws an exception', async () => {
      await expect(() => mutex.unlock()).toThrow(
        'Failed to unlock Mutex: Not already locked.'
      )
    })

    it('Does not prevent data race', async () => {
      const locked = false
      const asyncOps: Promise<void>[] = []

      for (let i = 0; i < 10; i++) {
        asyncOps.push(asyncOp(locked))
      }

      await Promise.all(asyncOps)
      expect(sharedCounter).toEqual(1)
    })
  })

  describe('When locked', () => {
    it('prevents data race', async () => {
      const locked = true
      const asyncOps: Promise<void>[] = []

      for (let i = 0; i < 10; i++) {
        asyncOps.push(asyncOp(locked))
      }

      await Promise.all(asyncOps)
      expect(sharedCounter).toEqual(asyncOps.length)
    })
  })
})
