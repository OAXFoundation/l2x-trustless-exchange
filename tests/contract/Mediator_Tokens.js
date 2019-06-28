// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

const Keythereum = require('keythereum')
const TestLib = require('../libs/BlockchainTestLib.js')
const Utils   = require('../libs/MediatorTestUtils.js')

// ----------------------------------------------------------------------------
// Tests Summary
// ----------------------------------------------------------------------------
// registerToken
//    - registerToken(0)
//    - registerToken(self)
//    - registerToken not a token
//    - registerToken OAX
//    - registerToken ETH
//    - registerToken already registered
//    - registerToken as normal user
//    - registerToken quarter [ 0, 1, ..., 9 ]
//    x registerToken after dispute initiated
//    x registerToken when halted
// Events
//    - TokenRegistered
//    * Covered by testing each function of the contract.
//

const ROUND_SIZE = 16


describe('Mediator Tokens', () => {

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

      deployment = await TestLib.deploy('OAXToken', [ ], { from: deployer })
      oaxToken = deployment.instance
      deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
      ethToken = deployment.instance
      deployment = await TestLib.deploy('Mediator', [ ROUND_SIZE, operator ], { from: deployer })
      mediator = deployment.instance
   })


   describe('registerToken', () => {

      it('registerToken (0)', async () => {
         await TestLib.assertCallFails(mediator.methods.registerToken(ADDRESS_ZERO).call({ from: operator }))
      })

      it('registerToken (self)', async () => {
         await TestLib.assertCallFails(mediator.methods.registerToken(mediator.options.address).call({ from: operator }))
      })

      it('registerToken (random)', async () => {
         assert.equal(await mediator.methods.registerToken(ADDRESS_RANDOM).call({ from: operator }), true)
         Utils.checkRegisterToken(await mediator.methods.registerToken(ADDRESS_RANDOM).send({ from: operator }), ADDRESS_RANDOM)

         assert.equal(await mediator.methods.tokenCount().call(), 1)
         assert.equal(await mediator.methods.registeredTokens(ADDRESS_RANDOM).call(), true)
         assert.equal(await mediator.methods.registeredTokensIndex(ADDRESS_RANDOM).call(), 0)
         assert.equal(await mediator.methods.registeredTokensAddresses(0).call(), ADDRESS_RANDOM)
      })

      it('registerToken OAX', async () => {
         assert.equal(await mediator.methods.registerToken(oaxToken.options.address).call({ from: operator }), true)
         Utils.checkRegisterToken(await mediator.methods.registerToken(oaxToken.options.address).send({ from: operator }), oaxToken.options.address)

         assert.equal(await mediator.methods.tokenCount().call(), 2)
         assert.equal(await mediator.methods.registeredTokens(oaxToken.options.address).call(), true)
         assert.equal(await mediator.methods.registeredTokensIndex(oaxToken.options.address).call(), 1)
         assert.equal(await mediator.methods.registeredTokensAddresses(1).call(), oaxToken.options.address)
      })

      it('registerToken ETH', async () => {
         assert.equal(await mediator.methods.registerToken(ethToken.options.address).call({ from: operator }), true)
         Utils.checkRegisterToken(await mediator.methods.registerToken(ethToken.options.address).send({ from: operator }), ethToken.options.address)

         assert.equal(await mediator.methods.tokenCount().call(), 3)
         assert.equal(await mediator.methods.registeredTokens(ethToken.options.address).call(), true)
         assert.equal(await mediator.methods.registeredTokensIndex(ethToken.options.address).call(), 2)
         assert.equal(await mediator.methods.registeredTokensAddresses(2).call(), ethToken.options.address)
      })

      it('registerToken already registered', async () => {
         assert.equal(await mediator.methods.registerToken(oaxToken.options.address).call({ from: operator }), false)

         assert.equal(await mediator.methods.tokenCount().call(), 3)
         assert.equal(await mediator.methods.registeredTokens(oaxToken.options.address).call(), true)
         assert.equal(await mediator.methods.registeredTokensIndex(oaxToken.options.address).call(), 1)
         assert.equal(await mediator.methods.registeredTokensAddresses(1).call(), oaxToken.options.address)
      })

      it('registerToken as normal user', async () => {
         await TestLib.assertCallFails(mediator.methods.registerToken(oaxToken.options.address).call({ from: client1 }))

         assert.equal(await mediator.methods.tokenCount().call(), 3)
      })

      describe('registerToken quarter [ 0, 1, ..., 9 ]', () => {
         before(async () => {
            // Here we use a long round size so that the operator can clear all the commits required
            // before the quarter changes, else the mediator will go into HALTED mode.
            deployment = await TestLib.deploy('Mediator', [ 32, operator ], { from: deployer })
            mediator = deployment.instance
         })

         var tokenCount  = 0
         var addresses   = []
         const quarters  = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ]
         const valid     = [ 1, 1, 1, 1, 0, 1, 1, 1, 0, 1 ]

         quarters.forEach((quarter, i) => {
            it.only('registerToken quarter ' + quarter + ' (' + (valid[i] == 1 ? 'should succeed' : 'should fail') + ')', async () => {
               const isValid = (valid[i] === 1)

               await Utils.moveToQuarterIndex(web3, mediator, i)

               if (quarter > 0 && quarter % 4 == 0) {
                  // We first need to commit
                  for (var j = 0; j < addresses.length; j++) {
                     try {
                        await Utils.commit(mediator, operator, addresses[j], [ { address : operator, sum : new BigNumber(0) } ])
                     } catch (error) { assert.fail(error) }
                  }
               }

               const key     = Keythereum.create()
               const address = web3.utils.toChecksumAddress(Keythereum.privateKeyToAddress(key.privateKey))

               if (isValid) {
                  assert.equal(await mediator.methods.registerToken(address).call({ from: operator }), true)
                  Utils.checkRegisterToken(await mediator.methods.registerToken(address).send({ from: operator }), address)
                  tokenCount++

                  assert.equal(await mediator.methods.tokenCount().call(), tokenCount)
                  assert.equal(await mediator.methods.registeredTokens(address).call(), true)
                  assert.equal(await mediator.methods.registeredTokensIndex(address).call(), tokenCount - 1)
                  assert.equal(await mediator.methods.registeredTokensAddresses(tokenCount - 1).call(), address)
                  addresses.push(address)
               } else {
                  await TestLib.assertCallFails(mediator.methods.registerToken(address).call({ from: operator }))
               }
            })
         })
      })
   })
})
