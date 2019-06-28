// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import EventEmitter from 'events'

export class Mutex {
  private readonly _buffer: SharedArrayBuffer
  private readonly _lock: Int32Array
  private readonly _eventEmitter: EventEmitter

  static LOCK_POS = 0
  static LOCKED = 1
  static UNLOCKED = 0

  constructor() {
    const bufferSize = Int32Array.BYTES_PER_ELEMENT
    this._buffer = new SharedArrayBuffer(bufferSize)
    this._lock = new Int32Array(this._buffer)
    this._eventEmitter = new EventEmitter()
    this._eventEmitter.setMaxListeners(Infinity)
  }

  async lockAsync(): Promise<void> {
    const expected = Mutex.UNLOCKED
    const newVal = Mutex.LOCKED

    while (true) {
      const oldVal = this.compareExchange(expected, newVal)

      if (oldVal === Mutex.UNLOCKED) {
        return
      }

      await this.wait()
    }
  }

  unlock() {
    const expected = Mutex.LOCKED
    const newVal = Mutex.UNLOCKED

    const oldVal = this.compareExchange(expected, newVal)

    if (oldVal === Mutex.UNLOCKED) {
      throw Error('Failed to unlock Mutex: Not already locked.')
    }

    this.notifyUnlocked()
  }

  isLocked() {
    return this.loadValue() === Mutex.LOCKED
  }

  async wait(): Promise<void> {
    return new Promise(resolve => {
      this._eventEmitter.once('unlocked', resolve)
    })
  }

  private compareExchange(expected: number, replacement: number): number {
    return Atomics.compareExchange(
      this._lock,
      Mutex.LOCK_POS,
      expected,
      replacement
    )
  }

  private notifyUnlocked(): void {
    this._eventEmitter.emit('unlocked')
  }

  private loadValue(): number {
    return Atomics.load(this._lock, Mutex.LOCK_POS)
  }
}
