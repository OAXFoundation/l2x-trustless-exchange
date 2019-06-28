// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { isValidAddress } from 'ethereumjs-util'
import { Address } from './types/BasicTypes'

export class AssetRegistry {
  private symbolAddresses: Map<string, Address> = new Map()
  private addressSymbols: Map<Address, string> = new Map()

  add(symbol: string, address: Address): void {
    const symbolError = verifySymbol(symbol)

    if (symbolError) {
      throw symbolError
    }

    const addressError = verifyAddress(address)

    if (addressError) {
      throw addressError
    }

    this.symbolAddresses.set(symbol, address)
    this.addressSymbols.set(address, symbol)
  }

  getAddress(name: string): Address | undefined {
    return this.symbolAddresses.get(name)
  }

  getSymbol(address: Address): string | undefined {
    return this.addressSymbols.get(address)
  }
}

export function verifySymbol(symbol: string): Error | null {
  if (!isString(symbol) || symbol.length === 0 || !isAlphaNumeric(symbol)) {
    return Error(
      `'${symbol}' is not a valid symbol. Alphanumeric string expected.`
    )
  }

  return null
}

function isString(s: string): boolean {
  return typeof s === 'string'
}

function isAlphaNumeric(s: string): boolean {
  return /^[0-9a-zA-Z]*$/.test(s)
}

function verifyAddress(address: Address): Error | null {
  if (!isValidAddress(address)) {
    return Error(`'${address}' is not a valid address.`)
  }

  return null
}
