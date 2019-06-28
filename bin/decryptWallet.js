#!/usr/bin/env node
// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
const fs = require('fs')
const Ethers = require('ethers')
const Promptly = require('promptly')

const WALLET_FILEPATH = process.argv[2]

async function run() {
  // Load wallet file from disk
  const wallet = await loadWallet(WALLET_FILEPATH)
  console.log(wallet.privateKey.toString('hex'))
}

async function loadWallet(filePath) {
  if (!fs.existsSync(filePath)) {
    throw Error('Could not find wallet file ' + filePath)
  }

  const password = await Promptly.prompt('Enter wallet password: ', {
    silent: true
  })
  console.log('')

  const fileContent = fs.readFileSync(filePath).toString()

  return await Ethers.Wallet.fromEncryptedJson(fileContent, password)
}

run().catch(e => {
  console.log(e)
})
