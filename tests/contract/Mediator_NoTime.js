// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

const TestLib = require('../libs/BlockchainTestLib.js')
const Utils   = require('../libs/MediatorTestUtils.js')
const Types   = require('../../build/dist/src/common/types/SmartContractTypes.js')
const SolvencyTree = require('../../build/dist/src/server/operator/SolvencyTree.js')

// ----------------------------------------------------------------------------
// Tests Summary
// ----------------------------------------------------------------------------
// GENERAL
// isProofValid
// isMerkleProofValid
// checkApproval
// checkApprovalsAreUnique
//
const ROUND_SIZE     = 4


describe('Mediator Utility Functions', () => {

   var o = null

   var mediator = null
   var oaxToken = null
   var ethToken = null

   var deployer = null
   var operator = null
   var client1  = null

   var deployment = null

   var receipt = null

   var tree = null
   var approval = null
   var approvalSig = null
   var fill = null
   var fillSig = null


   before(async () => {
      const accounts = await web3.eth.getAccounts()
      deployer = accounts[0]
      operator = accounts[1]
      client1  = accounts[2]
      client2  = accounts[3]

      deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
      ethToken = deployment.instance
      deployment = await TestLib.deploy('OAXToken', [ ], { from: deployer })
      oaxToken = deployment.instance
      deployment = await TestLib.deploy('MediatorMockNoTime', [ operator ], { from: deployer })
      mediator = deployment.instance

      await web3.eth.sendTransaction({ from: client1, to: ethToken.options.address, value: 1000000 })
      //await ethToken.methods.transfer(client1, 1000000).send({ from: deployer })
   })


   it('Register Token', async () => {
      assert.equal(await mediator.methods.registerToken(ethToken.options.address).call({ from: operator }), true)
      receipt = await mediator.methods.registerToken(ethToken.options.address).send({ from: operator })

      //assert.equal(await mediator.methods.registerToken(oaxToken.options.address).call({ from: operator }), true)
      //receipt = await mediator.methods.registerToken(oaxToken.options.address).send({ from: operator })
   })

   it('Authorization Message', async () => {
      const authorizationMessage = await Utils.getAuthorizationMessage(operator, client1, 0)
      assert.equal(await mediator.methods.verifyAuthorizationMessage(client1, [ 0, client1, authorizationMessage]).call(), true)
   })

   it('Deposit', async () => {
      assert.equal(await ethToken.methods.approve(mediator.options.address, 100).call({ from: client1 }), true)
      await ethToken.methods.approve(mediator.options.address, 100).send({ from: client1 })

      assert.equal(await mediator.methods.depositTokens(ethToken.options.address, 100).call({ from: client1 }), true)
      await mediator.methods.depositTokens(ethToken.options.address, 100).send({ from: client1 })
   })

   it('Commit', async () => {
      accounts = [
         { address : client1, sum : new BigNumber('100') }
      ]

      tree = new SolvencyTree.SolvencyTree(accounts)

      const root = tree.getRootInfo()

      const rootInfo = new Types.RootInfoParams(
         root.content, // web3.utils.fromAscii('')
         root.height,  // 0
         root.width    // 0
      )

      const solidityRoot = rootInfo.toSol()

      await mediator.methods.commit(solidityRoot, ethToken.options.address).send({ from: operator })
   })

   it('Initiate Withdrawal', async () => {
      const account = accounts[0]
      const partialProof = tree.getProof(account)

      const completeProof = {
         clientOpeningBalance : account.sum,
         clientAddress        : account.address,
         hashes               : partialProof.liabilities.map(liability => liability.hash),
         sums                 : partialProof.liabilities.map(liability => liability.sum),
         tokenAddress         : ethToken.options.address,
         height               : partialProof.height,
         width                : partialProof.width
      }

      const proofObj = Types.Proof.fromJson(completeProof)
      const solidityProof = proofObj.toSol()

      assert.equal(await mediator.methods.initiateWithdrawal(solidityProof, 90).call({ from: client1 }), true)
      await mediator.methods.initiateWithdrawal(solidityProof, 90).send({ from: client1 })
   })

   it('Make Approval', async () => {
      const account = accounts[0]

      approval = await Utils.createApproval({
         approvalId: new BigNumber('1'),
         round: "88",
         buy: { asset : oaxToken.options.address, amount : new BigNumber(40) },
         sell: { asset : ethToken.options.address, amount : new BigNumber(20) },
         intent: 'buyAll',
         owner: account.address,

         instanceId: mediator.options.address
      })

      approvalSig = await Utils.signApproval(client1, approval)
   })

   it('Check Approval', async () => {
      assert.equal(await mediator.methods.checkApproval(approval.toSol(), approvalSig, client1).call(), true)
   })

   it('Cancel Withdrawal', async () => {
      const approvals = [
         approval.toSol()
      ]

      const sigs = [
         approvalSig
      ]

      assert.equal(await mediator.methods.activeWithdrawals(ethToken.options.address, client1).call(), true)

      assert.equal(await mediator.methods.cancelWithdrawal(approvals, sigs, ethToken.options.address, client1).call({ from: operator }), true)
      await mediator.methods.cancelWithdrawal(approvals, sigs, ethToken.options.address, client1).send({ from: operator })

      assert.equal(await mediator.methods.activeWithdrawals(ethToken.options.address, client1).call(), false)
   })

   it('Initiate Withdrawal', async () => {
      const account = accounts[0]
      const partialProof = tree.getProof(account)

      const completeProof = {
         clientOpeningBalance : account.sum,
         clientAddress        : account.address,
         hashes               : partialProof.liabilities.map(liability => liability.hash),
         sums                 : partialProof.liabilities.map(liability => liability.sum),
         tokenAddress         : ethToken.options.address,
         height               : partialProof.height,
         width                : partialProof.width
      }

      const proofObj = Types.Proof.fromJson(completeProof)
      const solidityProof = proofObj.toSol()

      assert.equal(await mediator.methods.isProofValid(solidityProof).call(), true)
      assert.equal(await mediator.methods.initiateWithdrawal(solidityProof, 10).call({ from: client1 }), true)
      await mediator.methods.initiateWithdrawal(solidityProof, 10).send({ from: client1 })
   })

   it('Confirm Withdrawal', async () => {
      assert.equal(await mediator.methods.confirmWithdrawal(ethToken.options.address).call({ from: client1, gasLimit: 80000 }), true)
      await mediator.methods.confirmWithdrawal(ethToken.options.address).send({ from: client1 })
   })

   it('Make Fill', async () => {
      const account = accounts[0]

      fill = await Utils.createFill({
          fillId: new BigNumber('1'),
          approvalId: new BigNumber('1'),
          round: '88',
          buyAmount: new BigNumber('10'),
          buyAsset: oaxToken.options.address,
          sellAmount: new BigNumber('5'),
          sellAsset: ethToken.options.address,
          clientAddress: client1,
          instanceId: mediator.options.address
      })

      fillSig = await Utils.signFill(operator, fill)
   })

   it('Check Fill', async () => {
      assert.equal(await mediator.methods.checkFill(fill.toSol(), fillSig).call(), true)
   })

   it('Open Dispute', async () => {
      const authorizationMessage = await Utils.getAuthorizationMessage(operator, client1, 0)
      assert.equal(await mediator.methods.verifyAuthorizationMessage(client1, [ 0, client1, authorizationMessage ]).call(), true)
      assert.equal(await mediator.methods.openDispute([], [], [], [ 0, client1, authorizationMessage ]).call({ from: client1 }), true)
      await mediator.methods.openDispute([], [], [], [ 0, client1, authorizationMessage ]).send({ from: client1 })
   })

   it('Close Dispute', async () => {
      const ethAccounts = [ { address : client1, sum : new BigNumber('100') } ]
      const ethTree = new SolvencyTree.SolvencyTree(ethAccounts)
      const ethPartialProof = ethTree.getProof(ethAccounts[0])

      const ethCompleteProof = {
         clientOpeningBalance : ethAccounts[0].sum,
         clientAddress        : ethAccounts[0].address,
         hashes               : ethPartialProof.liabilities.map(liability => liability.hash),
         sums                 : ethPartialProof.liabilities.map(liability => liability.sum),
         tokenAddress         : ethToken.options.address,
         height               : ethPartialProof.height,
         width                : ethPartialProof.width
      }

      const ethProofObj = Types.Proof.fromJson(ethCompleteProof)
      const ethSolidityProof = ethProofObj.toSol()

      assert.equal(await mediator.methods.openDisputeCounter().call(), 1)
      assert.equal(await mediator.methods.isValidProofsArray([ ethSolidityProof ]).call(), true)
      assert.equal(await mediator.methods.isProofValid(ethSolidityProof).call(), true)
      assert.equal(await mediator.methods.closeDispute([ ethSolidityProof ], [], [], [], [], client1).call({ from: operator }), true)
      o = await mediator.methods.closeDispute([ ethSolidityProof ], [], [], [], [], client1).send({ from: operator })
      assert.equal(o.status, true)
      assert.equal((await mediator.methods.openDisputeCounter().call()).toString(), 0)
   })

   it('Open Dispute', async () => {
      const authorizationMessage = await Utils.getAuthorizationMessage(operator, client1, 0)
      assert.equal(await mediator.methods.verifyAuthorizationMessage(client1, [ 0, client1, authorizationMessage ]).call(), true)
      assert.equal(await mediator.methods.openDispute([], [], [], [ 0, client1, authorizationMessage ]).call({ from: client1 }), true)
      await mediator.methods.openDispute([], [], [], [ 0, client1, authorizationMessage ]).send({ from: client1 })
   })
/*
   it('Recover Funds', async () => {
      const ethAccounts = [ { address : client1, sum : new BigNumber('100') } ]
      const ethTree = new SolvencyTree.SolvencyTree(ethAccounts)
      const ethPartialProof = ethTree.getProof(ethAccounts[0])

      const ethCompleteProof = {
         clientOpeningBalance : ethAccounts[0].sum,
         clientAddress        : ethAccounts[0].address,
         hashes               : ethPartialProof.liabilities.map(liability => liability.hash),
         sums                 : ethPartialProof.liabilities.map(liability => liability.sum),
         tokenAddress         : ethToken.options.address,
         height               : ethPartialProof.height,
         width                : ethPartialProof.width
      }

      const ethProofObj = Types.Proof.fromJson(ethCompleteProof)
      const ethSolidityProof = ethProofObj.toSol()

      assert.equal(await mediator.methods.recoverAllFunds(ethSolidityProof).call({ from: client1 }), true)
      await mediator.methods.recoverAllFunds(ethSolidityProof).send({ from: client1 })
   })
*/
})

