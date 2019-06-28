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
// commit
//    - commit null root
//    - commit root with content 0, width and height != 0
//    - commit root with height 0
//    - commit root with width 0
//    - commit root with height smaller than last commit
//    - commit root with width smaller than last commit
//    - commit with tokenAddress 0
//    - commit with unknown token
//    - commit with mediator as token address
//    - commit root as operator
//    - commit root as operator again (already committed)
//    - commit root as normal user
//    - commit at quarter [ 0, 1, ..., 9 ]
//    - commit at quarter 4 and then 12 (missing 1 quarter)
//    - commit only 1 of the tokens registered
//    - commit only n - 1 of the tokens registered
//    x commit with 2nd token added quarter 3
//    x commit with 2nd token added quarter 4
//    x commit with 2nd token added quarter 5
//    x commit with tokens added each (valid) quarter
//
// commit with deposit/withdrawal
//    * see Mediator_DepositWithdrawal
//
// commit with dispute
//    * see Mediator_Dispute
//
// Events
//    - CommitCompleted
//    * Covered by testing each function of the contract.
//

describe('Mediator Commit', () => {

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
      await oaxToken.methods.transfer(client1, 1000000).send({ from: deployer })
      */
      deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
      ethToken = deployment.instance

      await web3.eth.sendTransaction({ from: client1, to: ethToken.options.address, value: 1000000 })
   })


   it('commit null root', async () => {
      deployment = await TestLib.deploy('Mediator', [ 8, operator ], { from: deployer })
      mediator = deployment.instance

      assert.equal(await mediator.methods.registerToken(ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkRegisterToken(await mediator.methods.registerToken(ADDRESS_RANDOM).send({ from: operator }), ADDRESS_RANDOM)

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      o = { content : '0x0000000000000000000000000000000000000000000000000000000000000000',
            height  : '0',
            width   : '0' }

      assert.equal(await mediator.methods.commit(o, ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkCommit(await mediator.methods.commit(o, ADDRESS_RANDOM).send({ from: operator }), 1, ADDRESS_RANDOM)

      const expectedRoot = Utils.calculateRootHashFromInfo(o, 0)
      const actualRoot = await mediator.methods.commits(1, ADDRESS_RANDOM).call()
      assert.equal(actualRoot, expectedRoot, 'Roots do not match.')
   })

   it('commit root with content 0, but width and height != 0', async () => {
      deployment = await TestLib.deploy('Mediator', [ 8, operator ], { from: deployer })
      mediator = deployment.instance

      assert.equal(await mediator.methods.registerToken(ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkRegisterToken(await mediator.methods.registerToken(ADDRESS_RANDOM).send({ from: operator }), ADDRESS_RANDOM)

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      o = { content : '0x0000000000000000000000000000000000000000000000000000000000000000',
            height  : '1',
            width   : '1' }

      assert.equal(await mediator.methods.commit(o, ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkCommit(await mediator.methods.commit(o, ADDRESS_RANDOM).send({ from: operator }), 1, ADDRESS_RANDOM)

      const expectedRoot = Utils.calculateRootHashFromInfo(o, 0)
      const actualRoot = await mediator.methods.commits(1, ADDRESS_RANDOM).call()
      assert.equal(actualRoot, expectedRoot, 'Roots do not match.')
   })

   it('commit root with height 0', async () => {
      deployment = await TestLib.deploy('Mediator', [ 8, operator ], { from: deployer })
      mediator = deployment.instance

      assert.equal(await mediator.methods.registerToken(ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkRegisterToken(await mediator.methods.registerToken(ADDRESS_RANDOM).send({ from: operator }), ADDRESS_RANDOM)

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      const accounts = [
         { address : operator, sum : new BigNumber(0) }
      ]

      var rootInfo = Utils.getSolidityRootForAccounts(accounts)
      rootInfo.height = '0'

      assert.equal(await mediator.methods.commit(rootInfo, ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkCommit(await mediator.methods.commit(rootInfo, ADDRESS_RANDOM).send({ from: operator }), 1, ADDRESS_RANDOM)

      const expectedRoot = Utils.calculateRootHashFromInfo(rootInfo, 0)
      const actualRoot = await mediator.methods.commits(1, ADDRESS_RANDOM).call()
      assert.equal(actualRoot, expectedRoot, 'Roots do not match.')

      var proof = Utils.getSolidityProofForAccount(accounts, accounts[0], ADDRESS_RANDOM)
      proof.height = '0'

      assert.equal(await mediator.methods.isProofValid(proof, 1).call(), true)
   })

   it('commit root with width 0', async () => {
      deployment = await TestLib.deploy('Mediator', [ 8, operator ], { from: deployer })
      mediator = deployment.instance

      assert.equal(await mediator.methods.registerToken(ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkRegisterToken(await mediator.methods.registerToken(ADDRESS_RANDOM).send({ from: operator }), ADDRESS_RANDOM)

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      const accounts = [
         { address : operator, sum : new BigNumber(0) }
      ]

      var rootInfo = Utils.getSolidityRootForAccounts(accounts)
      rootInfo.width = '0'

      assert.equal(await mediator.methods.commit(rootInfo, ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkCommit(await mediator.methods.commit(rootInfo, ADDRESS_RANDOM).send({ from: operator }), 1, ADDRESS_RANDOM)

      const expectedRoot = Utils.calculateRootHashFromInfo(rootInfo, 0)
      const actualRoot = await mediator.methods.commits(1, ADDRESS_RANDOM).call()
      assert.equal(actualRoot, expectedRoot, 'Roots do not match.')

      var proof = Utils.getSolidityProofForAccount(accounts, accounts[0], ADDRESS_RANDOM)
      proof.width = '0'

      assert.equal(await mediator.methods.isProofValid(proof, 1).call(), true)
   })

   it('commit root with tokenAddress 0', async () => {
      deployment = await TestLib.deploy('Mediator', [ 8, operator ], { from: deployer })
      mediator = deployment.instance

      assert.equal(await mediator.methods.registerToken(ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkRegisterToken(await mediator.methods.registerToken(ADDRESS_RANDOM).send({ from: operator }), ADDRESS_RANDOM)

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      var rootInfo = Utils.getSolidityRootForAccounts([
         { address : operator, sum : new BigNumber(0) }
      ])

      await TestLib.assertCallFails(mediator.methods.commit(rootInfo, ADDRESS_ZERO).call({ from: operator }))
   })

   it('commit with unknown token', async () => {
      deployment = await TestLib.deploy('Mediator', [ 8, operator ], { from: deployer })
      mediator = deployment.instance

      assert.equal(await mediator.methods.registerToken(ADDRESS_RANDOM).call({ from: operator }), true)
      Utils.checkRegisterToken(await mediator.methods.registerToken(ADDRESS_RANDOM).send({ from: operator }), ADDRESS_RANDOM)

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      var rootInfo = Utils.getSolidityRootForAccounts([
         { address : operator, sum : new BigNumber(0) }
      ])

      const UNKNOWN_TOKEN = '0x189df337351cB64e6e276DEf723C2a0916e3b95c'
      await TestLib.assertCallFails(mediator.methods.commit(rootInfo, UNKNOWN_TOKEN).call({ from: operator }))
   })

   it('commit with mediator as token', async () => {
      deployment = await TestLib.deploy('Mediator', [ 8, operator ], { from: deployer })
      mediator = deployment.instance

      await TestLib.assertCallFails(mediator.methods.registerToken(mediator.options.address).call({ from: operator }))
   })

   it('commit root as operator', async () => {
      deployment = await TestLib.deploy('Mediator', [ 8, operator ], { from: deployer })
      mediator = deployment.instance

      assert.equal(await mediator.methods.registerToken(ethToken.options.address).call({ from: operator }), true)
      Utils.checkRegisterToken(await mediator.methods.registerToken(ethToken.options.address).send({ from: operator }), ethToken.options.address)

      await ethToken.methods.approve(mediator.options.address, 10).send({ from: client1 })
      Utils.checkDepositTokens(await mediator.methods.depositTokens(ethToken.options.address, 10).send({ from: client1 }), 0, ethToken.options.address, client1, 10)

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      const accounts = [
         { address : operator, sum : new BigNumber(10) }
      ]

      const rootInfo = Utils.getSolidityRootForAccounts(accounts)

      assert.equal(await mediator.methods.commit(rootInfo, ethToken.options.address).call({ from: operator }), true)
      Utils.checkCommit(await mediator.methods.commit(rootInfo, ethToken.options.address).send({ from: operator }), 1, ethToken.options.address)

      const expectedRoot = Utils.calculateRootHashFromInfo(rootInfo, 10)
      const actualRoot = await mediator.methods.commits(1, ethToken.options.address).call()
      assert.equal(actualRoot, expectedRoot, 'Roots do not match.')

      const proof = Utils.getSolidityProofForAccount(accounts, accounts[0], ethToken.options.address)
      assert.equal(await mediator.methods.isProofValid(proof, 1).call(), true)
   })

   it('commit root as operator (again)', async () => {
      assert.equal(await mediator.methods.getCurrentQuarter().call(), 0)

      const accounts = [
         { address : operator, sum : new BigNumber(10) }
      ]

      const rootInfo = Utils.getSolidityRootForAccounts(accounts)

      await TestLib.assertCallFails(mediator.methods.commit(rootInfo, ethToken.options.address).call({ from: client1 }))
   })

   it('commit root as normal', async () => {
      deployment = await TestLib.deploy('Mediator', [ 8, operator ], { from: deployer })
      mediator = deployment.instance

      assert.equal(await mediator.methods.registerToken(ethToken.options.address).call({ from: operator }), true)
      Utils.checkRegisterToken(await mediator.methods.registerToken(ethToken.options.address).send({ from: operator }), ethToken.options.address)

      await ethToken.methods.approve(mediator.options.address, 10).send({ from: client1 })
      Utils.checkDepositTokens(await mediator.methods.depositTokens(ethToken.options.address, 10).send({ from: client1 }), 0, ethToken.options.address, client1, 10)

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      const accounts = [
         { address : operator, sum : new BigNumber(10) }
      ]

      const rootInfo = Utils.getSolidityRootForAccounts(accounts)

      await TestLib.assertCallFails(mediator.methods.commit(rootInfo, ethToken.options.address).call({ from: client1 }))
   })


   describe('commit at quarter [ 0, ..., 9 ]', () => {
      before(async () => {
         deployment = await TestLib.deploy('Mediator', [ 16, operator ], { from: deployer })
         mediator = deployment.instance

         assert.equal(await mediator.methods.registerToken(ethToken.options.address).call({ from: operator }), true)
         Utils.checkRegisterToken(await mediator.methods.registerToken(ethToken.options.address).send({ from: operator }), ethToken.options.address)

         await ethToken.methods.approve(mediator.options.address, 10).send({ from: client1 })
         Utils.checkDepositTokens(await mediator.methods.depositTokens(ethToken.options.address, 10).send({ from: client1 }), 0, ethToken.options.address, client1, 10)
      })

      const quarters  = [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ]
      const valid     = [ 0, 0, 0, 0, 1, 0, 0, 0, 1, 0 ]

      quarters.forEach((quarter, i) => {
         it('commit at quarter ' + quarter + ' (' + (valid[i] == 1 ? 'should succeed' : 'should fail') + ')', async () => {
            const isValid = (valid[i] === 1)

            await Utils.moveToQuarterIndex(web3, mediator, quarter)

            const accounts = [
               { address : operator, sum : new BigNumber(10) }
            ]

            const rootInfo = Utils.getSolidityRootForAccounts(accounts)

            if (isValid) {
               assert.equal(await mediator.methods.commit(rootInfo, ethToken.options.address).call({ from: operator }), true)
               Utils.checkCommit(await mediator.methods.commit(rootInfo, ethToken.options.address).send({ from: operator }), (quarter / 4), ethToken.options.address)

               const expectedRoot = Utils.calculateRootHashFromInfo(rootInfo, 10)
               const actualRoot = await mediator.methods.commits(1, ethToken.options.address).call()
               assert.equal(actualRoot, expectedRoot, 'Roots do not match.')

               const proof = Utils.getSolidityProofForAccount(accounts, accounts[0], ethToken.options.address)
               assert.equal(await mediator.methods.isProofValid(proof, 1).call(), true)
            } else {
               await TestLib.assertCallFails(mediator.methods.commit(rootInfo, ethToken.options.address).call({ from: operator }))
            }
         })
      })
   })

   describe('commit at quarter 4 and then 12 (missing 1 quarter)', () => {
      before(async () => {
         deployment = await TestLib.deploy('Mediator', [ 16, operator ], { from: deployer })
         mediator = deployment.instance

         assert.equal(await mediator.methods.registerToken(ethToken.options.address).call({ from: operator }), true)
         Utils.checkRegisterToken(await mediator.methods.registerToken(ethToken.options.address).send({ from: operator }), ethToken.options.address)

         await ethToken.methods.approve(mediator.options.address, 10).send({ from: client1 })
         Utils.checkDepositTokens(await mediator.methods.depositTokens(ethToken.options.address, 10).send({ from: client1 }), 0, ethToken.options.address, client1, 10)
      })

      const quarters  = [ 4, 12 ]
      const valid     = [ 1, 0  ]

      quarters.forEach((quarter, i) => {
         it('commit at quarter ' + quarter + ' (' + (valid[i] == 1 ? 'should succeed' : 'should fail') + ')', async () => {
            const isValid = (valid[i] === 1)

            await Utils.moveToQuarterIndex(web3, mediator, quarter)

            const accounts = [
               { address : client1, sum : new BigNumber(10) }
            ]

            const rootInfo = Utils.getSolidityRootForAccounts(accounts)

            if (isValid) {
               assert.equal(await mediator.methods.commit(rootInfo, ethToken.options.address).call({ from: operator }), true)
               Utils.checkCommit(await mediator.methods.commit(rootInfo, ethToken.options.address).send({ from: operator }), (quarter / 4), ethToken.options.address)

               const expectedRoot = Utils.calculateRootHashFromInfo(rootInfo, 10)
               const actualRoot = await mediator.methods.commits(1, ethToken.options.address).call()
               assert.equal(actualRoot, expectedRoot, 'Roots do not match.')

               const proof = Utils.getSolidityProofForAccount(accounts, accounts[0], ethToken.options.address)
               assert.equal(await mediator.methods.isProofValid(proof, 1).call(), true)
            } else {
               await TestLib.assertCallFails(mediator.methods.commit(rootInfo, ethToken.options.address).call({ from: operator }))
            }
         })
      })
   })

   it('commit only 1 of the tokens registered', async () => {
      deployment = await TestLib.deploy('Mediator', [ 12, operator ], { from: deployer })
      mediator = deployment.instance

      var tokens = []
      for (var i = 0; i < 2; i++) {
         deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
         const token = deployment.instance

         assert.equal(await mediator.methods.registerToken(token.options.address).call({ from: operator }), true)
         Utils.checkRegisterToken(await mediator.methods.registerToken(token.options.address).send({ from: operator }), token.options.address)

         tokens.push(token)
      }

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      const accounts = [
         { address : operator, sum : new BigNumber(0) }
      ]

      const rootInfo = Utils.getSolidityRootForAccounts(accounts)

      const token = tokens[0]
      assert.equal(await mediator.methods.commit(rootInfo, token.options.address).call({ from: operator }), true)
      Utils.checkCommit(await mediator.methods.commit(rootInfo, token.options.address).send({ from: operator }), 1, token.options.address)

      const expectedRoot = Utils.calculateRootHashFromInfo(rootInfo, 0)
      const actualRoot = await mediator.methods.commits(1, token.options.address).call()
      assert.equal(actualRoot, expectedRoot, 'Roots do not match.')

      const proof = Utils.getSolidityProofForAccount(accounts, accounts[0], token.options.address)
      assert.equal(await mediator.methods.isProofValid(proof, 1).call(), true)

      await mediator.methods.updateHaltedState().send({ from: client1 })
      assert.equal(await mediator.methods.halted().call(), false)
      await Utils.moveToQuarterIndex(web3, mediator, 5)
      await mediator.methods.updateHaltedState().send({ from: client1 })
      assert.equal(await mediator.methods.halted().call(), true)
   })

   it('commit only n - 1 of the tokens registered', async () => {
      deployment = await TestLib.deploy('Mediator', [ 16, operator ], { from: deployer })
      mediator = deployment.instance

      var tokens = []
      for (var i = 0; i < 3; i++) {
         deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
         const token = deployment.instance

         assert.equal(await mediator.methods.registerToken(token.options.address).call({ from: operator }), true)
         Utils.checkRegisterToken(await mediator.methods.registerToken(token.options.address).send({ from: operator }), token.options.address)

         tokens.push(token)
      }

      await Utils.moveToQuarterIndex(web3, mediator, 4)

      const accounts = [
         { address : operator, sum : new BigNumber(0) }
      ]

      const rootInfo = Utils.getSolidityRootForAccounts(accounts)

      for (var i = 0; i < tokens.length - 1; i++) {
         const token = tokens[i]
         assert.equal(await mediator.methods.commit(rootInfo, token.options.address).call({ from: operator }), true)
         Utils.checkCommit(await mediator.methods.commit(rootInfo, token.options.address).send({ from: operator }), 1, token.options.address)

         const expectedRoot = Utils.calculateRootHashFromInfo(rootInfo, 0)
         const actualRoot = await mediator.methods.commits(1, token.options.address).call()
         assert.equal(actualRoot, expectedRoot, 'Roots do not match.')

         const proof = Utils.getSolidityProofForAccount(accounts, accounts[0], token.options.address)
         assert.equal(await mediator.methods.isProofValid(proof, 1).call(), true)
      }

      await mediator.methods.updateHaltedState().send({ from: client1 })
      assert.equal(await mediator.methods.halted().call(), false)
      await Utils.moveToQuarterIndex(web3, mediator, 5)
      await mediator.methods.updateHaltedState().send({ from: client1 })
      assert.equal(await mediator.methods.halted().call(), true)
   })
})
