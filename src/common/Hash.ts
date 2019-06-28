// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { Digest } from './types/BasicTypes'
import { keccak256 as _keccak256, toBuffer, bufferToHex } from 'ethereumjs-util'

export function keccak256(message: any): Digest {
  const serialized = serializeMessage(message)
  return bufferToHex(_keccak256(toBuffer(serialized)))
}

function serializeMessage(message: any): Digest {
  let serialized

  if (typeof message === 'string') {
    serialized = message
  } else {
    serialized = JSON.stringify(message, Object.keys(message).sort())
  }

  return serialized
}
