// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { randomBytes } from 'crypto'

const ID_SIZE = 16

/**
 * Returns a random unique identifier in hexadecimal format
 * @param size
 */
export function generateRandomIdentifierHex(size: number): string {
  const uniqueId = '0x' + randomBytes(size).toString('hex')

  return uniqueId
}

/**
 * Returns a unique identifier for trades.
 */
export function generateUniqueIdentifierTrade(): string {
  return generateRandomIdentifierHex(ID_SIZE)
}
