// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import * as dotenv from 'dotenv'
import { D, etherToWei } from '../src/common/BigNumberUtils'

const config = dotenv.config()

dotenv.config()

if (config.error) {
  throw config.error
}

// Helper function

function ensureConfigExist(configName: string) {
  if (process.env[configName] === undefined) {
    const msg = `Mandatory environment variable ${configName} is missing`
    throw Error(msg)
  }
}

////////////////////////////////////////////////////////////////////////////////
// Operator's execution
////////////////////////////////////////////////////////////////////////////////

ensureConfigExist('GETH_RPC_URL')
ensureConfigExist('OPERATOR_URL')
ensureConfigExist('STORAGE_DIR')
ensureConfigExist('FEE_AMOUNT_ETHER')
ensureConfigExist('GAS_LIMIT')
ensureConfigExist('GAS_PRICE')

export const GETH_RPC_URL = process.env.GETH_RPC_URL!
export const OPERATOR_URL = process.env.OPERATOR_URL!
export const STORAGE_DIR = process.env.STORAGE_DIR!
export const CONTRACTS: { [name: string]: string | undefined } = {
  OAXToken: process.env.CONTRACT_OAXToken,
  ETHToken: process.env.CONTRACT_ETHToken,
  Mediator: process.env.CONTRACT_Mediator
}
export const FEE_AMOUNT_WEI = etherToWei(D(process.env.FEE_AMOUNT_ETHER!))

export const GAS_PRICE = D(process.env.GAS_PRICE!).toNumber()
export const GAS_LIMIT = D(process.env.GAS_LIMIT!).toNumber()

export const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL

export const OPERATOR_WALLET_FILEPATH = process.env.OPERATOR_WALLET_FILEPATH
export const OPERATOR_WALLET_PASSWORD = process.env.OPERATOR_WALLET_PASSWORD

export const OPERATOR_PORT = parseInt(OPERATOR_URL.split(':').slice(-1)[0])
if (!OPERATOR_PORT) {
  throw Error(
    `Could not determine operator port, check OPERATOR_URL: ${OPERATOR_URL}`
  )
}

export const USE_GETH_SIGNER = !OPERATOR_WALLET_FILEPATH
