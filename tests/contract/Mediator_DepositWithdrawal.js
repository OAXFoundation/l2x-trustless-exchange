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
// depositTokens
//    - depositTokens token address 0
//    - depositTokens not registered
//    - depositTokens amount 0
//    - depositTokens once
//    - depositTokens again
//    - depositTokens from other client
//    - depositTokens another registered token
//    - depositTokens at quarter [ 0, 1, ..., 9 ]
//    x depositTokens when there is pending withdrawal same user, same token
//    x depositTokens when there is confirmed withdrawal same user, same token
//    x depositTokens after dispute initiated
//    x depositTokens when halted
// initiateWithdrawal
//    x initiateWithdrawal proof = null
//    - initiateWithdrawal proof with unknown token
//    - initiateWithdrawal proof for different client
//    - initiateWithdrawal proof from earlier round (r - 2)
//    - initiateWithdrawal proof of 0
//    - initiateWithdrawal proof where 0 was committed on chain
//    - initiateWithdrawal proof that doesn't match actual balance
//    - initiateWithdrawal as the operator, for a customer
//    x initiateWithdrawal as the operator, for the operator itself
//    - initiateWithdrawal amount = 0
//    - initiateWithdrawal amount = total deposited by user + 1
//    - initiateWithdrawal amount = 1 (wei)
//    - initiateWithdrawal amount = total deposited by user
//    - initiateWithdrawal amount = total deposited by user - 1
//    x initiateWithdrawal at quarter [ 0, 1, 2, 3, 4, 5 ]
//    x initiateWithdrawal same round as a deposit, quarter [ 0, 1, 2, 3, 4, 5 ]
//    x initiateWithdrawal when already initiated withdrawal
//    x initiateWithdrawal again using same proof
//    x initiateWithdrawal amount = 1 but that 1 is locked in order?
//    x initiateWithdrawal while dispute pending
//    x initiateWithdrawal after halted
// confirmWithdrawal
//    x confirmWithdrawal token address 0
//    x confirmWithdrawal unknown token
//    x confirmWithdrawal different token than the initiateWithdrawal
//    x confirmWithdrawal without prior initiateWithdrawal
//    x confirmWithdrawal at same quarter as initiateWithdrawal [ 0, 1, 2, 3, 4, 5 ]
//    x confirmWithdrawal at initiateWithdrawal round [ +0, +1, +2, +3, +4, +5 ]
//    x confirmWithdrawal when only another person did initiateWithdrawal
//    x confirmWithdrawal when both us and another person did initiateWithdrawal
//    x confirmWithdrawal again
//    x confirmWithdrawal after initiateWithdrawl followed by deposit
//    x confirmWithdrawal as the operator
//    x confirmWithdrawal as different user than initiateWithdrawal
//    x confirmWithdrawal after withdrawal has been canceled by operator
//    x confirmWithdrawal while dispute pending
//    x confirmWithdrawal after halted
// canCancelWithdrawal
//    - with currentQuarter [ 0, 1, ..., 9 ]
//        - canCancelWithdrawal roundOfRequest [ 0, 1, ..., 20 ]
//        * for each commit round (0), check canCancelWithdrawal before and after commit
// cancelWithdrawal
//    x cancelWithdrawal with empty approvals
//    x cancelWithdrawal with empty sigs
//    x cancelWithdrawal with number sigs != approvals
//    x cancelWithdrawal with tokenAddress 0
//    x cancelWithdrawal with tokenAddress unknown
//    x cancelWithdrawal with tokenAddress different from initiateWithdrawal
//    x cancelWithdrawal with clientAddress 0
//    x cancelWithdrawal with clientAddress other
//    x cancelWithdrawal quarter [ 0, 1, ..., 15 ]
//    x cancelWithdrawal initWithdrawal quarter [ +0, +1, ... +5 ]
//    x cancelWithdrawal after confirmWithdrawal already done
//    x cancelWithdrawal after cancelWithrawal already done
//    x cancelWithdrawal while dispute pending
//    x cancelWithdrawal after halted
// various
//    x mix of deposits, withdrawals, cancellations in same and various rounds.
//    x so that previousClosingBalance < previousOpeningBalance
//    x so that previousClosingBalance back to 0
// Events
//    - DepositCompleted
//    - WithdrawalInitiated
//    - WithdrawalConfirmed
//    - WithdrawalCanceled
//    * Covered by testing each function of the contract.
//

const ROUND_SIZE = 16


describe('Mediator Deposits and Withdrawals', () => {

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
      client2  = accounts[3]

      deployment = await TestLib.deploy('OAXToken', [ ], { from: deployer })
      oaxToken = deployment.instance
      deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
      ethToken = deployment.instance

      await web3.eth.sendTransaction({ from: client1, to: ethToken.options.address, value: 1000000 })
      await web3.eth.sendTransaction({ from: client2, to: ethToken.options.address, value: 1000000 })
      TestLib.checkStatus(await oaxToken.methods.transfer(client1, 1000000).send({ from: deployer }))
      TestLib.checkStatus(await oaxToken.methods.transfer(client2, 1000000).send({ from: deployer }))
   })


   describe('depositTokens', () => {

      before(async () => {
         deployment = await TestLib.deploy('Mediator', [ 20, operator ], { from: deployer })
         mediator = deployment.instance

         await mediator.methods.registerToken(oaxToken.options.address).send({ from: operator })

         await Utils.moveToQuarterIndex(web3, mediator, 4)
         await Utils.commit(mediator, operator, oaxToken.options.address, [ { address: operator, sum : new BigNumber(0) } ])
         await Utils.moveToQuarterIndex(web3, mediator, 5)
      })


      it('depositTokens token address 0', async () => {
         TestLib.checkStatus(await oaxToken.methods.approve(mediator.options.address, 1).send({ from: client1 }))
         await TestLib.assertCallFails(mediator.methods.depositTokens(ADDRESS_ZERO, 1).call({ from: client1 }))
      })

      it('depositTokens not registered', async () => {
         TestLib.checkStatus(await ethToken.methods.approve(mediator.options.address, 1).send({ from: client1 }))
         await TestLib.assertCallFails(mediator.methods.depositTokens(ethToken.options.address, 1).call({ from: client1 }))
      })

      it('depositTokens amount 0', async () => {
         TestLib.checkStatus(await oaxToken.methods.approve(mediator.options.address, 1).send({ from: client1 }))
         await TestLib.assertCallFails(mediator.methods.depositTokens(oaxToken.options.address, 0).call({ from: client1 }))
      })

      it('depositTokens once', async () => {
         TestLib.checkStatus(await oaxToken.methods.approve(mediator.options.address, 1).send({ from: client1 }))

         assert.equal(await mediator.methods.depositTokens(oaxToken.options.address, 1).call({ from: client1 }), true)
         Utils.checkDepositTokens(await mediator.methods.depositTokens(oaxToken.options.address, 1).send({ from: client1 }), 1, oaxToken.options.address, client1, 1)

         assert.equal(await mediator.methods.clientDeposits(1, oaxToken.options.address, client1).call(), 1)
         assert.equal(await mediator.methods.totalDeposits(1, oaxToken.options.address).call(), 1)
      })

      it('depositTokens again', async () => {
         await oaxToken.methods.approve(mediator.options.address, 2).send({ from: client1 })
         assert.equal(await mediator.methods.depositTokens(oaxToken.options.address, 2).call({ from: client1 }), true)
         Utils.checkDepositTokens(await mediator.methods.depositTokens(oaxToken.options.address, 2).send({ from: client1 }), 1, oaxToken.options.address, client1, 2)

         assert.equal(await mediator.methods.clientDeposits(1, oaxToken.options.address, client1).call(), 3)
         assert.equal(await mediator.methods.totalDeposits(1, oaxToken.options.address).call(), 3)
      })

      it('depositTokens from other client', async () => {
         await oaxToken.methods.approve(mediator.options.address, 5).send({ from: client2 })
         assert.equal(await mediator.methods.depositTokens(oaxToken.options.address, 5).call({ from: client2 }), true)
         Utils.checkDepositTokens(await mediator.methods.depositTokens(oaxToken.options.address, 5).send({ from: client2 }), 1, oaxToken.options.address, client2, 5)

         assert.equal(await mediator.methods.clientDeposits(1, oaxToken.options.address, client2).call(), 5)
         assert.equal(await mediator.methods.totalDeposits(1, oaxToken.options.address).call(), 8)
      })

      it('depositTokens another registered token', async () => {
         await mediator.methods.registerToken(ethToken.options.address).send({ from: operator })

         await ethToken.methods.approve(mediator.options.address, 7).send({ from: client1 })
         assert.equal(await mediator.methods.depositTokens(ethToken.options.address, 7).call({ from: client1 }), true)
         Utils.checkDepositTokens(await mediator.methods.depositTokens(ethToken.options.address, 7).send({ from: client1 }), 1, ethToken.options.address, client1, 7)

         assert.equal(await mediator.methods.clientDeposits(1, oaxToken.options.address, client1).call(), 3)
         assert.equal(await mediator.methods.clientDeposits(1, oaxToken.options.address, client2).call(), 5)
         assert.equal(await mediator.methods.totalDeposits(1, oaxToken.options.address).call(), 8)
         assert.equal(await mediator.methods.clientDeposits(1, ethToken.options.address, client1).call(), 7)
         assert.equal(await mediator.methods.clientDeposits(1, ethToken.options.address, client2).call(), 0)
         assert.equal(await mediator.methods.totalDeposits(1, ethToken.options.address).call(), 7)
      })
   })

   describe('depositTokens at quarter [ 0, 1, ..., 9 ]', () => {
      before(async () => {
         deployment = await TestLib.deploy('Mediator', [ 16, operator ], { from: deployer })
         mediator = deployment.instance

         assert.equal(await mediator.methods.registerToken(ethToken.options.address).call({ from: operator }), true)
         Utils.checkRegisterToken(await mediator.methods.registerToken(ethToken.options.address).send({ from: operator }), ethToken.options.address)

         await ethToken.methods.approve(mediator.options.address, 100).send({ from: client1 })
      })

      const quarters  = [ 0, 1, 2, 3,  4,  5,  6,  7,  8,  9  ]
      const amounts   = [ 1, 2, 3, 4,  5,  6,  7,  8,  9,  10 ]
      const totals    = [ 1, 3, 6, 10, 15, 21, 28, 36, 45, 55 ]

      quarters.forEach((quarter, i) => {
         it('depositTokens at quarter ' + quarter, async () => {
            const round = Math.floor(quarter / 4)

            await Utils.moveToQuarterIndex(web3, mediator, quarter)

            if (quarter > 0 && quarter % 4 == 0) {
               const accounts = [
                  { address : client1, sum : new BigNumber(totals[i - 1]) }
               ]

               const rootInfo = Utils.getSolidityRootForAccounts(accounts)

               assert.equal(await mediator.methods.commit(rootInfo, ethToken.options.address).call({ from: operator }), true)
               Utils.checkCommit(await mediator.methods.commit(rootInfo, ethToken.options.address).send({ from: operator }), (quarter / 4), ethToken.options.address)

               const expectedRoot = Utils.calculateRootHashFromInfo(rootInfo, totals[i - 1])
               const actualRoot = await mediator.methods.commits(round, ethToken.options.address).call()
               assert.equal(actualRoot, expectedRoot, 'Roots do not match.')

               const proof = Utils.getSolidityProofForAccount(accounts, accounts[0], ethToken.options.address)
               assert.equal(await mediator.methods.isProofValid(proof, round).call(), true)
            }

            // Deposit
            assert.equal(await mediator.methods.depositTokens(ethToken.options.address, amounts[i]).call({ from: client1 }), true)
            Utils.checkDepositTokens(await mediator.methods.depositTokens(ethToken.options.address, amounts[i]).send({ from: client1 }), round, ethToken.options.address, client1, amounts[i])
         })
      })
   })

   describe('initiateWithdrawal', async () => {

      var initialProof = null


      before(async () => {
         deployment = await TestLib.deploy('Mediator', [ 12, operator ], { from: deployer })
         mediator = deployment.instance

         await mediator.methods.registerToken(ethToken.options.address).send({ from: operator })
         await mediator.methods.registerToken(oaxToken.options.address).send({ from: operator })

         // Client 1 - 10 ETH
         await ethToken.methods.approve(mediator.options.address, 10).send({ from: client1 })
         assert.equal(await mediator.methods.depositTokens(ethToken.options.address, 10).call({ from: client1 }), true)
         Utils.checkDepositTokens(await mediator.methods.depositTokens(ethToken.options.address, 10).send({ from: client1 }), 0, ethToken.options.address, client1, 10)

         // Client 1 - 10 OAX
         await oaxToken.methods.approve(mediator.options.address, 10).send({ from: client1 })
         assert.equal(await mediator.methods.depositTokens(oaxToken.options.address, 10).call({ from: client1 }), true)
         Utils.checkDepositTokens(await mediator.methods.depositTokens(oaxToken.options.address, 10).send({ from: client1 }), 0, oaxToken.options.address, client1, 10)

         // Client 2 - 5 OAX
         await oaxToken.methods.approve(mediator.options.address, 5).send({ from: client2 })
         assert.equal(await mediator.methods.depositTokens(oaxToken.options.address, 5).call({ from: client2 }), true)
         Utils.checkDepositTokens(await mediator.methods.depositTokens(oaxToken.options.address, 5).send({ from: client2 }), 0, oaxToken.options.address, client2, 5)

         await Utils.moveToQuarterIndex(web3, mediator, 4)

         accounts = {
            eth : [
               { address: operator, sum : new BigNumber(0) },
               { address: client1, sum : new BigNumber(10) },
               { address: client2, sum : new BigNumber(0) }
            ],
            oax : [
               { address: operator, sum : new BigNumber(0) },
               { address: client1, sum : new BigNumber(10) },
               { address: client2, sum : new BigNumber(5) }
            ],
         }

         await Utils.commit(mediator, operator, ethToken.options.address, accounts.eth)
         await Utils.commit(mediator, operator, oaxToken.options.address, accounts.oax)

         await Utils.moveToQuarterIndex(web3, mediator, 8)

         await Utils.commit(mediator, operator, ethToken.options.address, accounts.eth)
         await Utils.commit(mediator, operator, oaxToken.options.address, accounts.oax)

         await Utils.moveToQuarterIndex(web3, mediator, 9)

         initialProof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[2], oaxToken.options.address)
      })


      it('initiateWithdrawal proof with unknown token', async () => {
         const proof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[1], ADDRESS_RANDOM)

         await TestLib.assertCallFails(mediator.methods.initiateWithdrawal(proof, 1).call({ from: client1 }))
      })

      it('initiateWithdrawal proof for different client', async () => {
         const proof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[1], oaxToken.options.address)

         assert.equal(await mediator.methods.isProofValid(proof, 1).call(), true)
         await TestLib.assertCallFails(mediator.methods.initiateWithdrawal(proof, 1).call({ from: client2 }))
      })

      it('initiateWithdrawal proof of 0', async () => {
         const initialValue = accounts.oax[1].balance
         accounts.oax[1].balance = new BigNumber(0)

         const proof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[1], ADDRESS_RANDOM)

         await TestLib.assertCallFails(mediator.methods.initiateWithdrawal(proof, 1).call({ from: client1 }))

         accounts.oax[1].balance = initialValue
      })

      it('initiateWithdrawal proof where 0 was committed on chain', async () => {
         const proof = Utils.getSolidityProofForAccount(accounts.eth, accounts.eth[2], ethToken.options.address)

         await TestLib.assertCallFails(mediator.methods.initiateWithdrawal(proof, 1).call({ from: client2 }))
      })

      it('initiateWithdrawal as operator, for a client', async () => {
         const proof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[1], oaxToken.options.address)

         await TestLib.assertCallFails(mediator.methods.initiateWithdrawal(proof, 1).call({ from: operator }))
      })

      it('initiateWithdrawal amount 0', async () => {
         const proof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[1], oaxToken.options.address)

         await TestLib.assertCallFails(mediator.methods.initiateWithdrawal(proof, 0).call({ from: client1 }))
      })

      it('initiateWithdrawal amount total deposited + 1', async () => {
         const proof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[1], oaxToken.options.address)

         await TestLib.assertCallFails(mediator.methods.initiateWithdrawal(proof, accounts.oax[1].sum.plus(1).toString()).call({ from: client1 }))
      })

      it('initiateWithdrawal amount 1', async () => {
         const proof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[1], oaxToken.options.address)

         assert.equal(await mediator.methods.initiateWithdrawal(proof, 1).call({ from: client1 }), true)
         Utils.checkInitiateWithdrawal(await mediator.methods.initiateWithdrawal(proof, 1).send({ from: client1 }), 2, oaxToken.options.address, client1, 1)

         accounts.oax[1].sum = accounts.oax[1].sum.minus(1)

         await Utils.moveToQuarterIndex(web3, mediator, 12)
         await Utils.commit(mediator, operator, ethToken.options.address, accounts.eth)
         await Utils.commit(mediator, operator, oaxToken.options.address, accounts.oax)

         await Utils.moveToQuarterIndex(web3, mediator, 16)
         await Utils.commit(mediator, operator, ethToken.options.address, accounts.eth)
         await Utils.commit(mediator, operator, oaxToken.options.address, accounts.oax)

         await Utils.moveToQuarterIndex(web3, mediator, 17)
         await mediator.methods.confirmWithdrawal(oaxToken.options.address).send({ from: client1 })
      })

      it('initiateWithdrawal amount total deposited', async () => {
         const proof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[1], oaxToken.options.address)

         await TestLib.assertCallFails(mediator.methods.initiateWithdrawal(proof, accounts.oax[1].sum.plus(1).toString()).call({ from: client1 }))
      })

      it('initiateWithdrawal amount total deposited - 1', async () => {
         const proof = Utils.getSolidityProofForAccount(accounts.oax, accounts.oax[1], oaxToken.options.address)

         assert.equal(await mediator.methods.initiateWithdrawal(proof, 9).call({ from: client1 }), true)
         Utils.checkInitiateWithdrawal(await mediator.methods.initiateWithdrawal(proof, 9).send({ from: client1 }), 4, oaxToken.options.address, client1, 9)

         accounts.oax[1].sum = accounts.oax[1].sum.minus(9)
         assert.equal(accounts.oax[1].sum.toString(), 0)

         await Utils.moveToQuarterIndex(web3, mediator, 20)
         await Utils.commit(mediator, operator, ethToken.options.address, accounts.eth)
         await Utils.commit(mediator, operator, oaxToken.options.address, accounts.oax)

         await Utils.moveToQuarterIndex(web3, mediator, 24)
         await Utils.commit(mediator, operator, ethToken.options.address, accounts.eth)
         await Utils.commit(mediator, operator, oaxToken.options.address, accounts.oax)

         await Utils.moveToQuarterIndex(web3, mediator, 25)
         await mediator.methods.confirmWithdrawal(oaxToken.options.address).send({ from: client1 })
      })

      it('initiateWithdrawal amount total deposited', async () => {
         await TestLib.assertCallFails(mediator.methods.initiateWithdrawal(initialProof, accounts.oax[2].sum.toString()).call({ from: client2 }))
      })
   })


   describe('canCancelWithdrawal currentQuarter [ 0, 1, ..., 9 ]', () => {

      const quarters  = [ 0 ]//, 1, 2, 3, 4, 4, 5, 6, 7, 8, 8, 9 ]

      before(async () => {
         deployment = await TestLib.deploy('Mediator', [ 16, operator ], { from: deployer })
         mediator = deployment.instance

         await mediator.methods.registerToken(ethToken.options.address).send({ from: operator })

         // Client 1 - 10 ETH
         await ethToken.methods.approve(mediator.options.address, 10).send({ from: client1 })
         assert.equal(await mediator.methods.depositTokens(ethToken.options.address, 10).call({ from: client1 }), true)
         Utils.checkDepositTokens(await mediator.methods.depositTokens(ethToken.options.address, 10).send({ from: client1 }), 0, ethToken.options.address, client1, 10)
      })


      quarters.forEach((currentQuarter, i) => {
         it.only('with currentQuarter ' + currentQuarter + ' ' + ((quarters[i - 1] == quarters[i]) ? ' (after commit)' : ''), async () => {
            await Utils.moveToQuarterIndex(web3, mediator, currentQuarter)

            const currentRound = Math.floor(currentQuarter / 4)

            const hasCommit = ((await mediator.methods.commitCounters(currentRound).call()).gt(0))

            for (var quarterOfRequest = 0; quarterOfRequest <= 20 * 4; quarterOfRequest++) {
               const roundOfRequest = Math.floor(quarterOfRequest / 4)

               const expectedCanCancel =
                   (currentRound === roundOfRequest) ||
                  ((currentRound === roundOfRequest + 1) && (hasCommit === false))

               const actualCanCancel   = await mediator.methods.canCancelWithdrawal(currentRound, roundOfRequest, ethToken.options.address).call()

               //console.log('currentQuarter: ' + currentQuarter + ', quarterOfRequest: ' + quarterOfRequest + ', currentRound: ' + currentRound + ', roundOfRequest: ' + roundOfRequest + ', canCancel: ' + o)
               /// AAAAA check canConfirm
               var canConfirm = false
               if (roundOfRequest > 0) {
                   var lastConfirmedRoundForWithdrawals = -1
                   if (currentQuarter == 0 || halted) {
                      lastConfirmedRoundForWithdrawals = currentRound - 3;
                   } else {
                      lastConfirmedRoundForWithdrawals = currentRound - 2;
                   }

                   canConfirm = (roundOfRequest <= lastConfirmedRoundForWithdrawals)
               }
               console.log('canConfirm: ' + canConfirm + ', canCancel: ' + actualCanCancel)
               //assert(canConfirm !== actualCanCancel, "Ohhhhh")
               ////// AAAAAA

               assert.equal(actualCanCancel, expectedCanCancel)

            }

            if (currentQuarter > 0 && currentQuarter % 4 === 0) {
               if (hasCommit === false) {
                  //console.log('Need to commit at currentRound ' + currentRound + ', quarter ' + currentQuarter)

                  accounts = [
                        { address: operator, sum : new BigNumber(0) },
                        { address: client1,  sum : new BigNumber(10) },
                  ]

                  await Utils.commit(mediator, operator, ethToken.options.address, accounts)
               }
            }
         })
      })
   })
})

