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

ensureConfigExist('GETH_RPC_URL')
ensureConfigExist('STORAGE_DIR')
ensureConfigExist('FEE_AMOUNT_ETHER')

export const GETH_RPC_URL = process.env.GETH_RPC_URL!
export const STORAGE_DIR = process.env.STORAGE_DIR!
export const CONTRACTS: { [name: string]: string | undefined } = {
  OAXToken: process.env.CONTRACT_OAXToken,
  ETHToken: process.env.CONTRACT_ETHToken,
  Mediator: process.env.CONTRACT_Mediator
}
export const FEE_AMOUNT_WEI = etherToWei(D(process.env.FEE_AMOUNT_ETHER!))

export const WALLET_ADDRESS = process.env.WALLET_ADDRESS
export const WALLET_FILEPATH = process.env.WALLET_FILEPATH
export const WALLET_PASSWORD = process.env.WALLET_PASSWORD

export const GAS_LIMIT = Number(process.env.GAS_LIMIT || '6800000')
export const GAS_PRICE = parseInt(process.env.GAS_PRICE || '10000000000')

export const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL

function ensureConfigExist(configName: string) {
  if (process.env[configName] === undefined) {
    const msg = `Mandatory environment variable ${configName} is missing`
    throw Error(msg)
  }
}
