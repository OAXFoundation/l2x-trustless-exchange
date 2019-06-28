#!/usr/bin/env node
// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
const fs = require('fs')
const Ethers = require('ethers')
const Moment = require('moment')
const Prompt = require('promptly')

async function createWallet() {
  const password = await Prompt.prompt('Enter wallet password: ', {
    silent: true
  })
  const password2 = await Prompt.prompt('Verify wallet password: ', {
    silent: true
  })

  if (password !== password2) {
    console.log('Passwords do not match')
    process.exit(1)
  }

  const wallet = Ethers.Wallet.createRandom()
  const encrypted = await wallet.encrypt(password)

  const m = Moment().utc()
  const timePart = m.format('YYYY-MM-DDTHH-mm-ss.SSS') + 'Z'
  const address = wallet.address.replace('0x', '')
  const fileName = 'UTC--' + timePart + '--' + address

  fs.writeFileSync(fileName, encrypted)
  console.log('Wallet ' + wallet.address + ' created successfully.')
  console.log(`Keystore file saved to ${fileName}`)
}

createWallet().catch(e => console.log(e))
