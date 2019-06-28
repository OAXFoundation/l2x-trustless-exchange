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
// Basic Properties
//    General
//    - operatorAddress
//    - roundSize
//    - quarterSize
//    - blockNumberAtCreation
//    - clientDeposits
//    - totalDeposits
//    - openingBalances
//    - clientRequestedWithdrawals
//    - totalRequestedWithdrawals
//    - activeWithdrawalRounds
//    - commits
//    - committedRounds
//    - commitCounters
//    Tokens
//    - tokenCount
//    - registeredTokens
//    - registeredTokensIndex
//    - registeredTokensAddresses
//    Disputes
//    - halted
//    - haltedRound
//    - haltedQuarter
//    - totalDisputes
//    - openDisputeCounters
//    - disputes
//    - disputeFills
//    - disputeApprovals
//    - recovered
// Construction
//    - with roundSize [ 0, 1, 2, 3, 4, 5+ ]
//    - with operatorAddress [ 0, deployer, random ]
// Default payable function
//    - Does not accept ETH
// Time Utility Functions
//    getCurrentBlockNumber
//    - For a few consecutive blocks
//    x Once halted
//    getCurrentRound
//    getCurrentQuarter
//    - At block index [ 0, 1, 2, 3, 4, 5+ ]
//    x Once halted
//

const ROUND_SIZE     = 16


describe('Mediator Basics', () => {

   var o = null

   var mediator = null

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
   })


   describe('Basic Properties', () => {

      before(async () => {
         deployment = await TestLib.deploy('Mediator', [ ROUND_SIZE, operator ], { from: deployer })
         mediator = deployment.instance
      })


      it('roundSize', async () => {
         assert.equal(await mediator.methods.roundSize().call(), ROUND_SIZE)
      })
      it('quarterSize', async () => {
         assert.equal(await mediator.methods.quarterSize().call(), (new BigNumber(ROUND_SIZE)).div(4).toString())
      })
      it('halted', async () => {
         assert.equal(await mediator.methods.halted().call(), false)
      })
      it('haltedRound', async () => {
         assert.equal(await mediator.methods.haltedRound().call(), 0)
      })
      it('haltedQuarter', async () => {
         assert.equal(await mediator.methods.haltedQuarter().call(), 0)
      })
      it('totalDisputes', async () => {
         assert.equal(await mediator.methods.totalDisputes().call(), 0)
      })
      it('clientDeposits', async () => {
         assert.equal(await mediator.methods.clientDeposits(0, ADDRESS_RANDOM, client1).call(), 0)
      })
      it('totalDeposits', async () => {
         assert.equal(await mediator.methods.totalDeposits(0, ADDRESS_RANDOM).call(), 0)
      })
      it('registeredTokens', async () => {
         assert.equal(await mediator.methods.registeredTokens(ADDRESS_RANDOM).call(), false)
      })
      it('registeredTokensIndex', async () => {
         assert.equal(await mediator.methods.registeredTokensIndex(ADDRESS_ZERO).call(), 0)
      })
      it('registeredTokensAddresses', async () => {
         assert.equal(await mediator.methods.registeredTokensAddresses(0).call(), 0)
      })
      it('openingBalances', async () => {
         assert.equal(await mediator.methods.openingBalances(0, ADDRESS_RANDOM).call(), 0)
      })
      it('clientRequestedWithdrawals', async () => {
         const o = await mediator.methods.clientRequestedWithdrawals(0, ADDRESS_RANDOM, client1).call()
         assert.equal(o.amount, 0)
         assert.equal(o.openingBalance, 0)
      })
      it('totalRequestedWithdrawals', async () => {
         assert.equal(await mediator.methods.totalRequestedWithdrawals(0, ADDRESS_RANDOM).call(), 0)
      })
      it('activeWithdrawalRounds', async () => {
         assert.equal(await mediator.methods.activeWithdrawalRounds(ADDRESS_RANDOM, client1).call(), 0)
      })
      it('recovered', async () => {
         assert.equal(await mediator.methods.recovered(ADDRESS_RANDOM, client1).call(), false)
      })
      it('commits', async () => {
         assert.equal(await mediator.methods.commits(0, ADDRESS_RANDOM).call(), 0)
      })
      it('committedRounds', async () => {
         assert.equal(await mediator.methods.commitCounters(0).call(), 0)
      })
      it('commitCounters', async () => {
         assert.equal(await mediator.methods.commitCounters(0).call(), 0)
      })
      it('tokenCount', async () => {
         assert.equal(await mediator.methods.tokenCount().call(), 0)
      })
      it('operatorAddress', async () => {
         assert.equal(await mediator.methods.operatorAddress().call(), operator)
      })
      it('blockNumberAtCreation', async () => {
         assert.equal(await mediator.methods.blockNumberAtCreation().call(), deployment.receipt.blockNumber)
      })
      it('openDisputeCounters', async () => {
         assert.equal(await mediator.methods.openDisputeCounters(0).call(), 0)
      })
      it('disputes', async () => {
         const o = await mediator.methods.disputes(client1).call()
         assert.equal(o.quarter, 0)
         assert.equal(o.round, 0)
         assert.equal(typeof o.openingBalances, 'undefined')
         assert.equal(typeof o.fillIds, 'undefined')
         assert.equal(o.open, false)
      })
      it('disputeFills', async () => {
         const o = await mediator.methods.disputeFills(0, 0).call()
         assert.equal(o.fillId, 0)
         assert.equal(o.approvalId, 0)
         assert.equal(o.round, 0)
         assert.equal(o.buyAmount, 0)
         assert.equal(o.buyAsset, 0)
         assert.equal(o.sellAmount, 0)
         assert.equal(o.sellAsset, 0)
         assert.equal(o.clientAddress, 0)
         assert.equal(o.instanceId, 0)
      })
      it('disputeApprovals', async () => {
         assert.equal(await mediator.methods.disputeApprovals(0, 0).call(), false)
      })
   })


   describe('Construction', () => {
      const validList   = [ 4, 8, 12, 16, 20 ]
      const invalidList = [ 0, 1, 2, 3, 5, 6, 7, 9, 10 ]

      validList.forEach(i => {
         it('with roundSize of ' + i + ' (should succeed)', async () => {
            assert.isFulfilled(TestLib.deploy('Mediator', [ i, operator ], { from: deployer }))
         })
      })

      invalidList.forEach(i => {
         it('with roundSize of ' + i + ' (should fail)', async () => {
            assert.isRejected(TestLib.deploy('Mediator', [ i, operator ], { from: deployer }))
         })
      })

      it('with operatorAddress 0', async () => {
         assert.isRejected(TestLib.deploy('Mediator', [ ROUND_SIZE, 0 ], { from: deployer }))
      })

      it('with operatorAddress deployer', async () => {
         assert.isFulfilled(TestLib.deploy('Mediator', [ ROUND_SIZE, deployer ], { from: deployer }))
      })

      it('with operatorAddress random', async () => {
         assert.isFulfilled(TestLib.deploy('Mediator', [ ROUND_SIZE, ADDRESS_RANDOM ], { from: deployer }))
      })
   })


   describe('Default Payable Function', () => {

      it('Refuses ETH', async () => {
         assert.isRejected(web3.eth.sendTransaction({ from: deployer, to: deployment.address, value: 1}))
      })
   })


   describe('Time Utility Functions', () => {

      it('getCurrentBlockNumber', async () => {
         Sleep.msleep(1000)
         const block = await web3.eth.getBlock('latest')
         assert.equal((await mediator.methods.getCurrentBlockNumber().call()).toString(), block.number)
         await Utils.moveBy(web3, 1)
         assert.equal((await mediator.methods.getCurrentBlockNumber().call()).toString(), block.number + 1)
      })

      it('getCurrentQuarter and getCurrentRound at block index [ 0, 1, 2, 3, 4, 5+ ]', async () => {
         // NOTE: We use a round size of 8 instead of 4 since with 4, some divisions may yield 1 and not expose some arithmetic bugs.
         const roundSize = 8
         deployment = await TestLib.deploy('Mediator', [ roundSize, operator ], { from: deployer })
         mediator = deployment.instance
         Sleep.msleep(1000)

         const startBlockNumber = (await web3.eth.getBlock('latest')).number
         assert.equal(await mediator.methods.blockNumberAtCreation().call(), startBlockNumber)

         const totalBlocks = 2 * roundSize // We will test for 3 rounds
         for (var i = 0; i < totalBlocks; i++) {
            const blockNumber = (await web3.eth.getBlock('latest')).number
            assert.equal(blockNumber, startBlockNumber + i, "We skipped blocks")

            const blockIndex = blockNumber - startBlockNumber
            assert.isTrue(blockIndex >= 0)

            const round = Math.floor(blockIndex / roundSize)
            const mediatorRound = await mediator.methods.getCurrentRound().call()
            assert.equal(mediatorRound, round, "Round mismatch at block index " + blockIndex + " expected round " + round + ', got ' + mediatorRound)

            const quarterSize = roundSize / 4
            const quarter = Math.floor((blockIndex % roundSize) / quarterSize)
            const mediatorQuarter = await mediator.methods.getCurrentQuarter().call()
            assert.equal(mediatorQuarter, quarter, "Quarter mismatch at block index " + blockIndex + " expected quarter " + quarter + ', got ' + mediatorQuarter)

            await Utils.moveBy(web3, 1)
            Sleep.msleep(1000)
         }
      })

      /* LATER, when we have figured out the whole updateHaltedState etc stuff.
      describe('Halted', () => {

         before(async () => {
            deployment = await TestLib.deploy('MediatorMock', [ ROUND_SIZE, operator ], { from: deployer })
            mediator = deployment.instance

            await mediator.methods.setHalted(true).send({ from: operator })
            assert.equal(await mediator.methods.halted().call(), true)
         })


         it('getCurrentBlockNumber', async () => {
         })
      })
      */
   })
})

