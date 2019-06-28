// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

const TestLib = require('../libs/BlockchainTestLib.js')
const Utils   = require('../libs/MediatorTestUtils.js')

// ----------------------------------------------------------------------------
// Tests Summary
// ----------------------------------------------------------------------------
// GENERAL
// isProofValid
// isMerkleProofValid
// checkApproval
// checkApprovalsAreUnique
//

const ROUND_SIZE = 4


describe('Mediator Utility Functions', () => {

   var o = null

   var mediator = null
   var oaxToken = null
   var ethToken = null

   var accounts = null
   var deployer = null
   var operator = null
   var client1  = null

   var deployment = null


   before(async () => {
      accounts = await web3.eth.getAccounts()
      deployer = accounts[0]
      operator = accounts[1]
      client1  = accounts[2]

      /*
      deployment = await TestLib.deploy('OAXToken', [ ], { from: deployer })
      oaxToken = deployment.instance
      deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
      ethToken = deployment.instance
      deployment = await TestLib.deploy('Mediator', [ ROUND_SIZE, operator ], { from: deployer })
      mediator = deployment.instance
      */
      //await mediator.methods.registerToken(oaxToken._address).send({ from: operator })
      //await oaxToken.methods.transfer(client1, 1000000).send({ from: deployer })
      //await oaxToken.methods.approve(mediator._address, 10).send({ from: client1 })
      //assert.equal(await mediator.methods.depositTokens(oaxToken._address, 10).call({ from: client1 }), true)
      //Utils.checkDepositTokens(await mediator.methods.depositTokens(oaxToken._address, 10).send({ from: client1 }), 0, oaxToken._address, client1, 10)
   })


   it('commit something', async () => {

   })
})

