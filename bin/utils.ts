#!/usr/bin/env ts-node
// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

const fs = require('fs')
const Ethers = require('ethers')
const Promptly = require('promptly')

export async function loadWalletFromFile(
  filePath: string,
  providedPassword?: string
) {
  if (!(await fs.existsSync(filePath))) {
    throw Error('Could not find wallet file ' + filePath)
  }

  const password =
    providedPassword == undefined
      ? await Promptly.prompt(`Enter wallet password for ${filePath}: `)
      : providedPassword

  const fileContent = (await fs.readFileSync(filePath)).toString()

  return await Ethers.Wallet.fromEncryptedJson(fileContent, password)
}
