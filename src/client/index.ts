// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
export { version } from './package.json'

export { L2Client } from './operator/L2Client'
export { ExchangeClient } from './exchange/ExchangeClient'
export { HTTPClient } from './common/HTTPClient'

export { PrivateKeyIdentity } from '@oax/common/identity/PrivateKeyIdentity'
export { AssetRegistry } from '@oax/common/AssetRegistry'

export { getContract } from '@oax/common/ContractUtils'
