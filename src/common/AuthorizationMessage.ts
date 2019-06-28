// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

import { utils } from 'ethers'

/**
 * Enables to create an authorization message
 * @param clientAddress: address of the client who needs the authorization message
 * @param round: round of creation of the authorization message
 * @param identity: private key of the operator
 */
import { Address, Round } from './types/BasicTypes'
import { IAuthorizationMessage } from './types/SmartContractTypes'
import { Identity, verifySig } from './identity/Identity'

export async function mkAuthorization(
  clientAddress: Address,
  round: Round,
  identity: Identity
): Promise<IAuthorizationMessage> {
  const hash = utils.solidityKeccak256(
    ['address', 'uint256'],
    [clientAddress, round]
  )

  const sig = await identity.signHash(hash)

  const authorizationMessage: IAuthorizationMessage = {
    clientAddress: clientAddress,
    round: round,
    sig: sig
  }
  return authorizationMessage
}

/**
 * Enables to verify the correctness of an authorization message
 * @param authorizationMessage: authorization message to validate
 * @param operatorAddress: address of the operator to validate the signature
 * @param clientAddress: address of the client receiving the authorization message
 * @param round: round of creation of the authorization message
 */
export function vfAuthorization(
  authorizationMessage: IAuthorizationMessage,
  operatorAddress: Address,
  clientAddress: Address,
  round: Round
): boolean {
  if (authorizationMessage.round !== round) {
    return false
  }

  if (authorizationMessage.clientAddress !== clientAddress) {
    return false
  }

  const hash = utils.solidityKeccak256(
    ['address', 'uint256'],
    [authorizationMessage.clientAddress, authorizationMessage.round]
  )

  if (!verifySig(hash, authorizationMessage.sig, operatorAddress)) {
    return false
  }

  return true
}
