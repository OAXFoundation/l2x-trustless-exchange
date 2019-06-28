// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
const dotenv = require('dotenv')
const BigNumber = require('bignumber.js')

// env var should normally be taken from config/environment. But as jest
// currently does not use ts-jest, rather than loading the environment file from
// a build, we load the configs with dotenv again here
loadEnv()


// Configure test timeout
const testTimeout = parseInt(process.env.TEST_TIMEOUT) || 45000
jest.setTimeout(testTimeout)

BigNumber.prototype.inspect = function() {
  return 'D`' + this.toString() + '`'
}

function loadEnv() {
  const config = dotenv.config()

  dotenv.config()

  if (config.error) {
    throw config.error
  }
}
