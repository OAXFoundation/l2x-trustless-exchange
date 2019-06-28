// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
const ethers = require('ethers')

process.env.NODE_ENV = 'test'

async function globalSetup(globalConfig) {
  await createAccountsIfNotExist(5)
}

async function createAccountsIfNotExist(numberOfAccounts) {
  console.info(`\nChecking if accounts need to be created...`)
  const provider = new ethers.providers.JsonRpcProvider()

  const passphrase = ''
  const ACCOUNT_UNLOCK_DURATION = 0 // duration 0 => unlocked until geth closes

  for (let i = 0; i < numberOfAccounts; i++) {
    // skipping the first account, which is the default dev account
    let signer = provider.getSigner(i + 1)

    try {
      await signer.getAddress()
    } catch (err) {
      await provider.send('personal_newAccount', [passphrase])
      signer = provider.getSigner(i + 1)
      const address = await signer.getAddress()

      console.info(`Created account ${address}`)

      await provider.send('personal_unlockAccount', [
        address,
        passphrase,
        ACCOUNT_UNLOCK_DURATION
      ])
    }
  }
}

module.exports = globalSetup
