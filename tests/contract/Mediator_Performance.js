// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

const fs      = require('fs')
const Ethers  = require('ethers')
const Keythereum = require('keythereum')
const TestLib = require('../libs/BlockchainTestLib.js')
const Utils   = require('../libs/MediatorTestUtils.js')
const Types   = require('../../build/dist/src/common/types/SmartContractTypes.js')
const SolvencyTree = require('../../build/dist/src/server/operator/SolvencyTree.js')

// ----------------------------------------------------------------------------
// Tests Summary
// ----------------------------------------------------------------------------
// Deployment
// - Binary file size
// - Deployed size
// - Deployed gas
// Scalability
// x (bunch of tests)
//

const ROUND_SIZE        = 8
const FILE_SIZE_MAX     = 50000
const DEPLOYED_SIZE_MAX = 24000
const DEPLOYED_GAS_MAX  = 6500000
const DECIMALS_FACTOR   = (new BigNumber(10)).pow(18)
const RANDOM_ADDRESS = '0x7d7aD572BDcd18A80420b5EF00EEb0FCb48d7D46'


describe('Mediator Performance', () => {

   var o = null

   var mediator = null
   var oaxToken = null
   var ethToken = null

   var deployer = null
   var operator = null
   var client1  = null

   var deployment = null

   before(async () => {
      const accounts = await web3.eth.getAccounts()
      deployer = accounts[0]
      operator = accounts[1]
      client1  = accounts[2]
   })


   it.only('Binary file size', async () => {
      const filePath  = Path.join(__dirname, '../../build/contracts/Mediator.bin')
      const fileStats = fs.statSync(filePath)
      const fileSize  = new BigNumber(fileStats.size)

      assert.isTrue(fileSize.lt(FILE_SIZE_MAX))
   })

   it.only('Deployed size', async () => {
      deployment = await TestLib.deploy('Mediator', [ ROUND_SIZE, operator ], { from: deployer })
      mediator = deployment.instance

      const code = await web3.eth.getCode(deployment.address)

      assert.isTrue(code.length / 2 < DEPLOYED_SIZE_MAX)
   })

   it.only('Deployed gas', async () => {
      assert.isTrue(deployment.receipt.gasUsed < DEPLOYED_GAS_MAX)
      console.log('Deployment gas: ' + deployment.receipt.gasUsed)
   })

   it('isMerkleProofValid 100k accounts', async () => {
      deployment = await TestLib.deploy('Mediator', [ ROUND_SIZE, operator ], { from: deployer })
      mediator = deployment.instance

      var accounts = []

      for (var i = 1; i <= 100000; i++) {
         accounts.push({ address : client1, sum : (new BigNumber('250000')).plus(i).times(DECIMALS_FACTOR) })
      }

      const tree = new SolvencyTree.SolvencyTree(accounts)

      const hashes = tree.getLiabilities(accounts[0]).map(n => n.hash)
      const sums = tree.getLiabilities(accounts[0]).map(n => n.sum.toString())

      const rootWithPadding = tree.getRootWithPadding()

      const leaf = tree.hash(accounts[0]).hash
      const sum = accounts[0].sum.toString()

      const height = tree.getHeight()
      const width = tree.getWidth()

      o = await mediator.methods.isMerkleProofValid(
        hashes,
        sums,
        rootWithPadding,
        leaf,
        sum,
        height.toString(10),
        width.toString(10)
      ).send()

      assert.equal(o.status, true)

      const gasUsed = new BigNumber(o.gasUsed)
      assert.isTrue(gasUsed.lt('100000'))

      console.log('Gas used for 1 proof against 100k accounts: ' + gasUsed.toString())
   })

   it('checkApproval', async () => {
      deployment = await TestLib.deploy('MediatorMockNoTime', [ operator ], { from: deployer })
      mediator = deployment.instance

      var max = 70
      var approvals = []
      var sigs = []
      var addresses = []
      for (var i = 0; i < max; i++) {
         const approval = await Utils.createApproval({
            approvalId: (new BigNumber(250000)).plus(i),
            round: (new BigNumber(250000)).plus(i),
            buy: { asset : RANDOM_ADDRESS, amount : (new BigNumber('150000')).times(DECIMALS_FACTOR) },
            sell: { asset : RANDOM_ADDRESS, amount : (new BigNumber('270000')).times(DECIMALS_FACTOR) },
            intent: 'buyAll',
            owner: client1,
            
            instanceId: mediator.options.address
         })

         const approvalSig = await Utils.signApproval(client1, approval)

         approvals.push(approval.toSol())
         sigs.push(approvalSig)
         addresses.push(client1)
      }

      var totalGas = new BigNumber(0)
      for (var i = 0; i < approvals.length; i++) {
         //assert.equal(await mediator.methods.checkApproval(approval.toSol(), approvalSig, client1).call(), true)
         o = await mediator.methods.checkApproval(approvals[i], sigs[i], addresses[i]).send({ from: client1 })
         assert.equal(o.status, true)

         totalGas = totalGas.plus(o.gasUsed)
      }

      totalGas = totalGas.minus((new BigNumber(21000)).times(max - 1))
      console.log('Gas for ' + max + ' calls to checkApproval: ' + totalGas.toString())

      o = await mediator.methods.checkApprovalBatch(approvals, sigs, addresses).send({ from: client1 })
      console.log('Gas for ' + max + ' calls to checkApproval (BATCHED): ' + o.gasUsed)
   })

   it('checkFill', async () => {
      deployment = await TestLib.deploy('MediatorMockNoTime', [ operator ], { from: deployer })
      mediator = deployment.instance

      var max = 70
      var fills = []
      var sigs = []
      for (var i = 0; i < max; i++) {
         const fill = await Utils.createFill({
             fillId: (new BigNumber(250000)).plus(i),
             approvalId: (new BigNumber(250000)).plus(i),
             round: (new BigNumber(250000)).plus(i),
             buyAmount: (new BigNumber(250000)).plus(i).times(DECIMALS_FACTOR),
             buyAsset: RANDOM_ADDRESS,
             sellAmount: (new BigNumber(250000)).plus(i).times(DECIMALS_FACTOR),
             sellAsset: RANDOM_ADDRESS,
             clientAddress: client1,
             instanceId: mediator.options.address
         })

         const fillSig = await Utils.signFill(operator, fill)

         fills.push(fill.toSol())
         sigs.push(fillSig)
      }

      var totalGas = new BigNumber(0)
      for (var i = 0; i < fills.length; i++) {
         o = await mediator.methods.checkFill(fills[i], sigs[i]).send({ from: client1 })
         assert.equal(o.status, true)

         totalGas = totalGas.plus(o.gasUsed)
      }

      totalGas = totalGas.minus((new BigNumber(21000)).times(max - 1))
      console.log('Gas for ' + max + ' calls to checkFill: ' + totalGas.toString())

      o = await mediator.methods.checkFillBatch(fills, sigs).send({ from: client1 })
      console.log('Gas for ' + max + ' calls to checkFill (BATCHED): ' + o.gasUsed)
   })

   it('checkFillWithApproval', async () => {
      deployment = await TestLib.deploy('MediatorMockNoTime', [ operator ], { from: deployer })
      mediator = deployment.instance

      var max = 50
      var approvals = []
      var fills = []
      for (var i = 0; i < max; i++) {
         const approval = await Utils.createApproval({
            approvalId: (new BigNumber(250000)).plus(i),
            round: (new BigNumber(250000)).plus(i),
            buy: { asset : RANDOM_ADDRESS, amount : (new BigNumber(250000)).plus(i).times(DECIMALS_FACTOR) },
            sell: { asset : RANDOM_ADDRESS, amount : (new BigNumber(250000)).plus(i).times(DECIMALS_FACTOR) },
            intent: 'buyAll',
            owner: client1,
            
            instanceId: mediator.options.address
         })

         const fill = await Utils.createFill({
             fillId: (new BigNumber(250000)).plus(i),
             approvalId: approval.approvalId,
             round: approval.round,
             buyAmount: approval.buy.amount,
             buyAsset: approval.buy.asset,
             sellAmount: approval.sell.amount,
             sellAsset: approval.sell.asset,
             clientAddress: client1,
             instanceId: mediator.options.address
         })

         approvals.push(approval.toSol())
         fills.push(fill.toSol())
      }

      o = await mediator.methods.checkFillWithApproval(approvals, fills).send({ from: client1 })
      assert.equal(o.status, true)
      console.log('Gas for ' + max + ' calls to checkFillWithApproval: ' + o.gasUsed)
   })

   it('commit', async () => {
      deployment = await TestLib.deploy('MediatorMockNoTime', [ operator ], { from: deployer })
      mediator = deployment.instance

      var tokens = []
      const max = 50
      for (var i = 0; i < max; i++) {
         deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
         const token = deployment.instance

         //assert.equal(await mediator.methods.registerToken(token.options.address).call({ from: operator }), true)
         receipt = await mediator.methods.registerToken(token.options.address).send({ from: operator })

         tokens.push(token)
      }

      var accounts = []
      for (var i = 0; i < 100; i++) {
         const key = Keythereum.create()
         const address = web3.utils.toChecksumAddress(Keythereum.privateKeyToAddress(key.privateKey))

         accounts.push({ address : address, sum : (new BigNumber('100')).times(DECIMALS_FACTOR) })
      }

      var totalGas = new BigNumber(0)
      for (var i = 0; i < tokens.length; i++) {
         const tree = new SolvencyTree.SolvencyTree(accounts)

         const root = tree.getRootInfo()

         const rootInfo = new Types.RootInfoParams(
            root.content, // web3.utils.fromAscii('')
            root.height,  // 0
            root.width    // 0
         )

         const solidityRoot = rootInfo.toSol()

         o = await mediator.methods.commit(solidityRoot, tokens[i].options.address).send({ from: operator })
         assert.equal(o.status, true)

         totalGas = totalGas.plus(o.gasUsed)
      }

      console.log('Gas for ' + max + ' calls to commit (1 for each token): ' + totalGas.toString())
   })

   it('isProofValid', async () => {
      deployment = await TestLib.deploy('MediatorMockNoTime', [ operator ], { from: deployer })
      mediator = deployment.instance

      var tokens = []
      const max = 20
      for (var i = 0; i < max; i++) {
         deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
         const token = deployment.instance

         //assert.equal(await mediator.methods.registerToken(token.options.address).call({ from: operator }), true)
         receipt = await mediator.methods.registerToken(token.options.address).send({ from: operator })

         tokens.push(token)
      }

      const amount = (new BigNumber('100')).times(DECIMALS_FACTOR)

      var accounts = []
      accounts.push({ address : client1, sum : amount })

      for (var i = 0; i < 100000; i++) {
         const key = Keythereum.create()
         const address = web3.utils.toChecksumAddress(Keythereum.privateKeyToAddress(key.privateKey))
         accounts.push({ address : client1, sum : new BigNumber(0) })
      }

      for (var i = 0; i < tokens.length; i++) {
         await web3.eth.sendTransaction({ from: client1, to: tokens[i].options.address, value: amount.toString() })
         o = await tokens[i].methods.approve(mediator.options.address, amount.toString()).send({ from: client1 })
         assert.equal(o.status, true)
         o = await mediator.methods.depositTokens(tokens[i].options.address, amount.toString()).send({ from: client1 })
         assert.equal(o.status, true)
      }

      var trees = []
      var totalGas = new BigNumber(0)
      for (var i = 0; i < tokens.length; i++) {
         const tree = new SolvencyTree.SolvencyTree(accounts)

         const root = tree.getRootInfo()

         const rootInfo = new Types.RootInfoParams(
            root.content, // web3.utils.fromAscii('')
            root.height,  // 0
            root.width    // 0
         )

         const solidityRoot = rootInfo.toSol()

         o = await mediator.methods.commit(solidityRoot, tokens[i].options.address).send({ from: operator })
         assert.equal(o.status, true)

         totalGas = totalGas.plus(o.gasUsed)
         trees.push(tree)
      }

      const account = accounts[0]

      var proofs = []
      for (var i = 0; i < tokens.length; i++) {
         const partialProof = trees[i].getProof(account)

         const completeProof = {
            clientOpeningBalance : account.sum,
            clientAddress        : account.address,
            hashes               : partialProof.liabilities.map(liability => liability.hash),
            sums                 : partialProof.liabilities.map(liability => liability.sum),
            tokenAddress         : tokens[i].options.address,
            height               : partialProof.height,
            width                : partialProof.width
         }

         const proofObj = Types.Proof.fromJson(completeProof)
         const solidityProof = proofObj.toSol()

         proofs.push(solidityProof)
      }

      totalGas = new BigNumber(0)
      for (var i = 0; i < proofs.length; i++) {
         //assert.equal(await mediator.methods.isProofValid(solidityProof).call(), true)
         o = await mediator.methods.isProofValid(proofs[i]).send()
         assert.equal(o.status, true)

         totalGas = totalGas.plus(o.gasUsed)
      }

      console.log('Gas for ' + proofs.length + ' proofs: ' + totalGas.toString())

      o = await mediator.methods.isProofValidBatch(proofs).send()
      assert.equal(o.status, true)

      console.log('Gas for ' + proofs.length + ' proofs (BATCH): ' + o.gasUsed)
   })


   it.only('openDispute', async () => {
      deployment = await TestLib.deploy('MediatorMockNoTime', [ operator ], { from: deployer })
      mediator = deployment.instance

      var tokens = []
      const maxTokens = 2
      for (var i = 0; i < maxTokens; i++) {
         deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
         const token = deployment.instance

         //assert.equal(await mediator.methods.registerToken(token.options.address).call({ from: operator }), true)
         receipt = await mediator.methods.registerToken(token.options.address).send({ from: operator })

         tokens.push(token)
      }

      const amount = (new BigNumber('100')).times(DECIMALS_FACTOR)

      var accounts = []
      accounts.push({ address : client1, sum : amount })

      for (var i = 0; i < 0; i++) {
         const key = Keythereum.create()
         const address = web3.utils.toChecksumAddress(Keythereum.privateKeyToAddress(key.privateKey))
         accounts.push({ address : client1, sum : new BigNumber(0) })
      }

      for (var i = 0; i < tokens.length; i++) {
         await web3.eth.sendTransaction({ from: client1, to: tokens[i].options.address, value: amount.toString() })
         o = await tokens[i].methods.approve(mediator.options.address, amount.toString()).send({ from: client1 })
         assert.equal(o.status, true)
         o = await mediator.methods.depositTokens(tokens[i].options.address, amount.toString()).send({ from: client1 })
         assert.equal(o.status, true)
      }

      var trees = []
      var totalGas = new BigNumber(0)
      for (var i = 0; i < tokens.length; i++) {
         const tree = new SolvencyTree.SolvencyTree(accounts)

         const root = tree.getRootInfo()

         const rootInfo = new Types.RootInfoParams(
            root.content, // web3.utils.fromAscii('')
            root.height,  // 0
            root.width    // 0
         )

         const solidityRoot = rootInfo.toSol()

         o = await mediator.methods.commit(solidityRoot, tokens[i].options.address).send({ from: operator })
         assert.equal(o.status, true)

         totalGas = totalGas.plus(o.gasUsed)
         trees.push(tree)
      }

      const authorizationMessage = await Utils.getAuthorizationMessage(operator, client1, 0)
      assert.equal(await mediator.methods.verifyAuthorizationMessage(client1, [ 0, client1, authorizationMessage ]).call(), true)

      const account = accounts[0]

      var proofs = []
      for (var i = 0; i < tokens.length; i++) {
         const partialProof = trees[i].getProof(account)

         const completeProof = {
            clientOpeningBalance : account.sum,
            clientAddress        : account.address,
            hashes               : partialProof.liabilities.map(liability => liability.hash),
            sums                 : partialProof.liabilities.map(liability => liability.sum),
            tokenAddress         : tokens[i].options.address,
            height               : partialProof.height,
            width                : partialProof.width
         }

         const proofObj = Types.Proof.fromJson(completeProof)
         const solidityProof = proofObj.toSol()

         proofs.push(solidityProof)
      }

      const maxFills = 20
      var fills = []
      var fillSigs = []
      var index = 0
//      for (var i = 0; i < tokens.length; i++) {
         for (var j = 0; j < maxFills; j++) {
            const fill = await Utils.createFill({
                fillId: (new BigNumber(250000)).plus(index),
                approvalId: (new BigNumber(250000)).plus(index),
                round: (new BigNumber(250000)).plus(index),
                buyAmount: (new BigNumber(250000)).plus(index).times(DECIMALS_FACTOR),
                buyAsset: tokens[0].options.address,
                sellAmount: (new BigNumber(250000)).plus(index).times(DECIMALS_FACTOR),
                sellAsset: tokens[0].options.address,
                clientAddress: client1,
                instanceId: mediator.options.address
            })

            const fillSig = await Utils.signFill(operator, fill)

            fills.push(fill.toSol())
            fillSigs.push(fillSig)

            index++
         }
//      }

      o = await mediator.methods.openDispute(proofs, fills, fillSigs, [ 0, client1, authorizationMessage ] ).send({ from: client1 })
      assert.equal(o.status, true)

      console.log('Gas used for openDispute with ' + maxTokens + ' tokens, ' + maxFills + ' total fills : ' + o.gasUsed)


      const tokenAddresses = []
      for (var i = 0; i < tokens.length; i++) {
         tokenAddresses.push(tokens[i].options.address)
      }

      const persistData = {
         mediatorAddress : mediator.options.address,
         tokenAddresses : tokenAddresses,
         accounts : accounts,
         proofs : proofs,
         fills : fills,
         fillSigs : fillSigs
      }

      fs.writeFileSync('data.json', JSON.stringify(persistData, null, 4))
   })

   it.only('closeDispute', async () => {
      //deployment = await TestLib.deploy('MediatorMockNoTime', [ operator ], { from: deployer })
      //mediator = deployment.instance

      //deployment = await TestLib.deploy('ETHToken', [ ], { from: deployer })
      //ethToken = deployment.instance

      //receipt = await mediator.methods.registerToken(ethToken.options.address).send({ from: operator })

      // Load data
      const data = JSON.parse(fs.readFileSync('data.json'))

      // Load Mediator
      const mediatorAbi = JSON.parse(fs.readFileSync('./build/contracts/MediatorMockNoTime.abi').toString())

      mediator = new web3.eth.Contract(mediatorAbi, data.mediatorAddress, { gas : 8000000 })
      assert.isTrue(await mediator.methods.commitCounter().call() > 0)

      // Load Tokens
      var tokens = []
      const tokenAbi = JSON.parse(fs.readFileSync('./build/contracts/ETHToken.abi').toString())
      for (var i = 0; i < data.tokenAddresses.length; i++) {
         tokens.push(new web3.eth.Contract(tokenAbi, data.tokenAddresses[i], { gas : 8000000 }))
      }

      var approvals = []
      var approvalSigs = []
      for (var i = 0; i < data.fills.length; i++) {
         const fill = data.fills[i]

         const approval = await Utils.createApproval({
            approvalId: fill.fillId,
            round: fill.round,
            buy: { asset : fill.buyAsset, amount : fill.buyAmount },
            sell: { asset : fill.sellAsset, amount : fill.sellAmount },
            intent: 'buyAll',
            owner: client1,
            
            instanceId: mediator.options.address
         })

         const approvalSig = await Utils.signApproval(client1, approval)

         approvals.push(approval.toSol())
         approvalSigs.push(approvalSig)
      }

      /*
      const accounts = [
         { address : client1, sum : (new BigNumber('100')).times(DECIMALS_FACTOR) }
      ]

      const tree = new SolvencyTree.SolvencyTree(accounts)

      const account = accounts[0]

      var proofs = []
      for (var i = 0; i < 1; i++) {
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

         proofs.push(solidityProof)
      }

      assert.equal(await mediator.methods.isProofValid(proofs[0]).call(), true)

      var max = 50
      var fills = []
      var fillSigs = []
      var approvals = []
      var approvalSigs = []
      for (var i = 0; i < max; i++) {
         const approval = await Utils.createApproval({
            approvalId: (new BigNumber(250000)).plus(i),
            round: (new BigNumber(250000)).plus(i),
            buy: { asset : ethToken.options.address, amount : (new BigNumber(250000)).plus(i).times(DECIMALS_FACTOR) },
            sell: { asset : ethToken.options.address, amount : (new BigNumber(250000)).plus(i).times(DECIMALS_FACTOR) },
            intent: 'buyAll',
            owner: client1,
            
            instanceId: mediator.options.address
         })

         const approvalSig = await Utils.signApproval(client1, approval)

         approvals.push(approval.toSol())
         approvalSigs.push(approvalSig)

         const fill = await Utils.createFill({
             fillId: (new BigNumber(250000)).plus(i),
             approvalId: (new BigNumber(250000)).plus(i),
             round: (new BigNumber(250000)).plus(i),
             buyAmount: (new BigNumber(250000)).plus(i).times(DECIMALS_FACTOR),
             buyAsset: ethToken.options.address,
             sellAmount: (new BigNumber(250000)).plus(i).times(DECIMALS_FACTOR),
             sellAsset: ethToken.options.address,
             clientAddress: client1,
             instanceId: mediator.options.address
         })

         const fillSig = await Utils.signFill(operator, fill)

         fills.push(fill.toSol())
         fillSigs.push(fillSig)
      }
      */

      //assert.equal(await mediator.methods.closeDispute(data.proofs, approvals, approvalSigs, data.fills, data.fillSigs, client1).call({ from: operator }), true)
      o = await mediator.methods.closeDispute(data.proofs, approvals, approvalSigs, data.fills, data.fillSigs, client1).send({ from: operator })
      assert.equal(o.status, true)

      console.log('Gas used by closeDispute with ' + tokens.length + ' tokens, ' + data.fills.length + ' fills, ' + approvals.length + ' approvals: ' + o.gasUsed)
   })
})
