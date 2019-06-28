import crypto from 'crypto'

export function mkRandomHash() {
  return `0x${crypto.randomBytes(32).toString('hex')}`
}
