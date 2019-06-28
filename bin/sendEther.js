#!/usr/bin/env node
// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
const fs = require('fs')
const Ethers = require('ethers')
const Providers = require('ethers/providers')

const providerUrl = 'https://rinkeby.infura.io/v3/<key>'
const walletPath = process.argv[2]
const recipient = process.argv[3]
const amount = process.argv[4]
const password = 'testtest'

if (!walletPath || !recipient || !amount) {
  console.error('Usage: sendEther.js [wallet-path] [recipient] [amount]')
  process.exit(1)
}

const provider = new Providers.JsonRpcProvider(providerUrl)

async function send() {
  const fileContent = fs.readFileSync(walletPath).toString()
  const wallet = await Ethers.Wallet.fromEncryptedJson(fileContent, password)
  const signer = wallet.connect(provider)
  const etherAmount = Ethers.utils.parseEther(amount)

  const tx = await signer.sendTransaction({
    to: recipient,
    value: etherAmount
  })
  await tx.wait()

  console.log(`Sent ${amount} to ${recipient}.`)
}

send().catch(err => {
  console.log(err.message)
  process.exit(1)
})
