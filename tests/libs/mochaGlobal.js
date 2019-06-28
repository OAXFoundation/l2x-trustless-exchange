// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

const dotenv = require('dotenv')

const config = dotenv.config()

dotenv.config()

if (config.error) {
  throw config.error
}

ADDRESS_ZERO   = '0x0000000000000000000000000000000000000000'
ADDRESS_RANDOM = '0xf3494209CBDD4622A8ee6926a1D27C99D046453e'

fs   = require('fs')
Path = require('path')
Web3 = require('web3')
assert = require('assert')
Chai = require('chai')

const chaiPromises = require('chai-as-promised')
Chai.use(chaiPromises)

// GLOBALS
BigNumber = require('bignumber.js')
assert    = Chai.assert
Moment    = require('moment')
web3      = new Web3(new Web3.providers.HttpProvider(process.env.GETH_RPC_URL), null, { transactionConfirmationBlocks : 1 })
Sleep     = require('sleep')


var fn = assert.equal

assert.equal = (a, b, c) => {
   if (a !== null && b !== null && typeof a !== 'undefined' && typeof b !== 'undefined' && a.constructor.name == 'BigNumber' && b.constructor.name == 'BigNumber') {
      assert.isTrue(a.eq(b), "BigNumber " + a.toString() + " is not equal to " + b.toString())
   } else {
      fn(a, b, c)
   }
}


