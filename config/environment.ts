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
ensureConfigExist('STORAGE_DIR')
ensureConfigExist('FEE_AMOUNT_ETHER')
ensureConfigExist('GAS_LIMIT')
ensureConfigExist('GAS_PRICE')

export const GETH_RPC_URL = process.env.GETH_RPC_URL!
export const STORAGE_DIR = process.env.STORAGE_DIR!
export const CONTRACTS: { [name: string]: string | undefined } = {
  OAXToken: process.env.CONTRACT_OAXToken,
  ETHToken: process.env.CONTRACT_ETHToken,
  Mediator: process.env.CONTRACT_Mediator
}
export const FEE_AMOUNT_WEI = etherToWei(D(process.env.FEE_AMOUNT_ETHER!))
export const OPERATOR_HTTP_PORT = parseInt(
  process.env.OPERATOR_HTTP_PORT || '8899'
)

export const GAS_PRICE = parseInt(process.env.GAS_PRICE!)
export const GAS_LIMIT = parseInt(process.env.GAS_LIMIT!)

export const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL

export const INDEX_DEPLOYER_SIGNER_LOCAL = 1
export const INDEX_OPERATOR_SIGNER_LOCAL = 2

export const OPERATOR_WALLET_FILEPATH = process.env.OPERATOR_WALLET_FILEPATH
export const OPERATOR_WALLET_PASSWORD = process.env.OPERATOR_WALLET_PASSWORD

export const RUN_ON_LOCALHOST: boolean =
  GETH_RPC_URL.indexOf('127.0.0.1') >= 0 ||
  GETH_RPC_URL.indexOf('localhost') >= 0

////////////////////////////////////////////////////////////////////////////////
// Deployment
////////////////////////////////////////////////////////////////////////////////

ensureConfigExist('DEPLOYMENT_ROUND_SIZE')
ensureConfigExist('DEPLOYMENT_GAS_LIMIT')
ensureConfigExist('DEPLOYMENT_GAS_PRICE')

export const DEPLOYMENT_GAS_LIMIT = parseInt(process.env.DEPLOYMENT_GAS_LIMIT!)
export const DEPLOYMENT_GAS_PRICE = parseInt(process.env.DEPLOYMENT_GAS_PRICE!)

export const DEPLOYMENT_WALLET_FILEPATH = process.env.DEPLOYMENT_WALLET_FILEPATH
export const DEPLOYMENT_WALLET_PASSWORD = process.env.DEPLOYMENT_WALLET_PASSWORD
export const DEPLOYMENT_ROUND_SIZE = parseInt(
  process.env.DEPLOYMENT_ROUND_SIZE!
)

////////////////////////////////////////////////////////////////////////////////
// Chaos testing
////////////////////////////////////////////////////////////////////////////////

export const DEPLOYMENT_MOCK_MEDIATOR =
  process.env.DEPLOYMENT_MOCK_MEDIATOR == 'true' ? true : false
