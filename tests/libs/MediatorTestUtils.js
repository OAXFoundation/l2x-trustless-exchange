// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

const Ethers       = require('ethers')
const Sleep        = require('sleep')

const TestLib      = require('./BlockchainTestLib.js')
const Approvals    = require('../../build/dist/src/common/types/Approvals.js')
const Fills        = require('../../build/dist/src/common/types/Fills.js')
const Types        = require('../../build/dist/src/common/types/SmartContractTypes.js')
const SolvencyTree = require('../../build/dist/src/server/operator/SolvencyTree.js')



module.exports.getAuthorizationMessage = async (operatorAddress, clientAddress, round) => {
  const hash = Ethers.utils.solidityKeccak256(['address', 'uint256' ], [ clientAddress, round ])

  const sig = await this.signHash(operatorAddress, hash)

  return sig
}


module.exports.createApproval = async (approvalJson) => {
   return new Approvals.Approval(approvalJson)
}


module.exports.signApproval = async (clientAddress, approval) => {
  const hash = approval.createDigest()

  return await module.exports.signHash(clientAddress, hash)
}


module.exports.createFill = async (fillJson) => {
   return Fills.FillMediator.fromIFill(fillJson)
}


module.exports.signFill = async (operatorAddress, fill) => {
  const hash = fill.createDigest()

  return await module.exports.signHash(operatorAddress, hash)
}


module.exports.signHash = async (signerAddress, hash) => {
  const provider   = new Ethers.providers.JsonRpcProvider(process.env.GETH_RPC_URL)
  const signer     = provider.getSigner(signerAddress)
  const digest     = Ethers.utils.arrayify(hash)
  const sig        = await signer.signMessage(digest)
  const sigAsBytes = [...Ethers.utils.arrayify(sig)].map(Ethers.utils.hexlify)

  return sigAsBytes
}


// NOTE:
// If we 'call' vs 'send' into contract, there is a difference of 1 block. send will report call block number + 1.
module.exports.moveBy = async (web3, blockCount) => {
   for (var i = 0; i < blockCount; i++) {
      await web3.eth.sendTransaction({ from: await web3.eth.getCoinbase(), to: ADDRESS_RANDOM, value: 1 })
      Sleep.msleep(1000)
   }
}


var totalMoved = 0
module.exports.moveToQuarterIndex = async (web3, mediator, quarterIndex) => {
   const currentBlock          = await mediator.methods.getCurrentBlockNumber().call()
   const blockNumberAtCreation = await mediator.methods.blockNumberAtCreation().call()
   const blockIndex            = currentBlock - blockNumberAtCreation
   const roundSize             = await mediator.methods.roundSize().call()
   const quarterSize           = roundSize / 4
   const blockIndexMin         = quarterIndex * quarterSize
   const blockIndexMax         = blockIndexMin + quarterSize - 1

   if (blockIndex >= blockIndexMin && blockIndex <= blockIndexMax) {
      // 'We are already at the requested quarter'
      return
   }

   const blockDelta = blockIndexMin - blockIndex
   assert(blockDelta > 0, "We're past the requested quarter already.")

   //console.log('Moving to quarter index ' + quarterIndex + ' (' + blockDelta + ' blocks ahead)...')
   for (var i = 0; i < blockDelta; i++) {
      await web3.eth.sendTransaction({ from: await web3.eth.getCoinbase(), to: ADDRESS_RANDOM, value: 0 })
      //Sleep.msleep(1000)
   }

   // AAAA DEBUGGING
   totalMoved += blockDelta
   //console.log('Total moved: ' + totalMoved)
   const actualBlock   = new BigNumber(await await mediator.methods.getCurrentBlockNumber().call())
   const actualQuarter = new BigNumber(await await mediator.methods.getCurrentQuarter().call())
   const actualRound   = new BigNumber(await await mediator.methods.getCurrentRound().call())
   const actualIndex   = actualRound.times(4).plus(actualQuarter)

   assert(actualIndex.eq(quarterIndex), 'Internal error in moveToQuarterIndex. Requested: ' + quarterIndex.toString() + ', actual: ' + actualIndex.toString())
   // AAAA
}


module.exports.getSolidityRootForAccounts = (accounts) => {
   const tree = new SolvencyTree.SolvencyTree(accounts)

   const root = tree.getRootInfo()

   const rootInfo = new Types.RootInfoParams(
      root.content, // web3.utils.fromAscii('')
      root.height,  // 0
      root.width    // 0
   )

   const solidityRoot = rootInfo.toSol()

   return solidityRoot
}


module.exports.getSolidityProofForAccount = (accounts, account, tokenAddress) => {
   const tree = new SolvencyTree.SolvencyTree(accounts)

   const partialProof = tree.getProof(account)

   const completeProof = {
      clientOpeningBalance : account.sum,
      clientAddress        : account.address,
      hashes               : partialProof.liabilities.map(liability => liability.hash),
      sums                 : partialProof.liabilities.map(liability => liability.sum),
      tokenAddress         : tokenAddress,
      height               : partialProof.height,
      width                : partialProof.width
   }

   const proofObj = Types.Proof.fromJson(completeProof)
   const solidityProof = proofObj.toSol()

   return solidityProof
}


module.exports.commit = async (mediator, operator, asset, accounts) => {
   return commit(mediator, operator, asset, accounts)
}


async function commit(mediator, operator, asset, accounts) {
   const tree = new SolvencyTree.SolvencyTree(accounts)

   const root = tree.getRootInfo()

   const rootInfo = new Types.RootInfoParams(
      root.content, // web3.utils.fromAscii('')
      root.height,  // 0
      root.width    // 0
   )

   const solidityRoot = rootInfo.toSol()

   const result = await mediator.methods.commit(solidityRoot, asset).send({ from: operator })
   assert(result.status)
}


module.exports.commitBalances = async (mediator, balances) => {
   var treeBalances = []
   for (var i = 0; i < balances.length; i++) {
      const entry = balances[i]

      var treeBalance = []
      const userAccounts = Object.keys(entry.balances)
      for (var j = 0; j < userAccounts.length; j++) {
         treeBalance.push({
            address : userAccounts[i],
            sum     : entry.balances[userAccounts[i]]
         })
      }

      treeBalances.push({
         asset : entry.asset,
         balances : treeBalance
      })
   }

   console.log(JSON.stringify(treeBalances, null, 4))

   const round = await mediator.methods.getCurrentRound().call()
   const quarter = await mediator.methods.getCurrentQuarter().call()
   const block = await mediator.methods.getCurrentBlockNumber().call()
   const startingBlock = await mediator.methods.blockNumberAtCreation().call()

   console.log('Current round ' + round + ', quarter ' + quarter + ', blockIndex ' + (block - startingBlock))

   for (var i = 0; i < treeBalances.length; i++) {
      const tree = new SolvencyTree.SolvencyTree(treeBalances[i].balances)

      const root = tree.getRootInfo()

      const rootInfo = new Types.RootInfoParams(
         root.content, // web3.utils.fromAscii('')
         root.height,  // 0
         root.width    // 0
      )

      const solidityRoot = rootInfo.toSol()
      console.log(solidityRoot)

      const operator = await mediator.methods.operatorAddress().call()
      console.log('operator: ' + operator)
      const result = await mediator.methods.commit(solidityRoot, treeBalances[i].asset).call({ from: operator })
      //const result = await mediator.methods.commit([ solidityRoot.content, solidityRoot.height, solidityRoot.width ], treeBalances[i].asset).call()
      console.log(result)
   }
}


module.exports.calculateRootHashFromInfo = (rootInfo, previousRoundOpeningBalance) => {
   var o = Ethers.utils.solidityKeccak256([ 'bytes32', 'uint256' ],[ rootInfo.content, previousRoundOpeningBalance ])
   o = Ethers.utils.solidityKeccak256([ 'bytes32', 'uint256', 'uint256' ],[ o, rootInfo.height, rootInfo.width ])

   return o
}


module.exports.checkRegisterToken = (receipt, address) => {

   TestLib.checkStatus(receipt)

   assert.equal(Object.keys(receipt.events).length, 1)
   assert.equal(typeof receipt.events.TokenRegistered, 'object')
   const eventArgs = receipt.events.TokenRegistered.returnValues
   assert.equal(Object.keys(eventArgs).length, 2)
   assert.equal(eventArgs.tokenAddress, address)
}


module.exports.checkDepositTokens = (receipt, round, tokenAddress, clientAddress, amount) => {

   TestLib.checkStatus(receipt)

   // We have 3 events here because the OpenZeppelin implementation of ERC20.transferFrom
   // also does an approve in it, as opposed to most ERC20 implementations.
   assert.equal(Object.keys(receipt.events).length, 3)
   assert.equal(typeof receipt.events.DepositCompleted, 'object')
   const eventArgs = receipt.events.DepositCompleted.returnValues
   assert.equal(Object.keys(eventArgs).length, 8)
   assert.equal(eventArgs.round.toString(), round)
   assert.equal(eventArgs.tokenAddress, tokenAddress)
   assert.equal(eventArgs.clientAddress, clientAddress)
   assert.equal(eventArgs.amount.toString(), amount)
}


module.exports.checkCommit = (receipt, round, tokenAddress) => {

   TestLib.checkStatus(receipt)

   assert.equal(Object.keys(receipt.events).length, 1)
   assert.equal(typeof receipt.events.CommitCompleted, 'object')
   const eventArgs = receipt.events.CommitCompleted.returnValues
   assert.equal(Object.keys(eventArgs).length, 4)
   assert.equal(eventArgs.round.toString(), round)
   assert.equal(eventArgs.tokenAddress, tokenAddress)
}


module.exports.checkInitiateWithdrawal = (receipt, round, tokenAddress, clientAddress, amount) => {

   TestLib.checkStatus(receipt)

   assert.equal(Object.keys(receipt.events).length, 1)
   assert.equal(typeof receipt.events.WithdrawalInitiated, 'object')
   const eventArgs = receipt.events.WithdrawalInitiated.returnValues
   assert.equal(Object.keys(eventArgs).length, 8)
   assert.equal(eventArgs.round.toString(), round)
   assert.equal(eventArgs.tokenAddress, tokenAddress)
   assert.equal(eventArgs.clientAddress, clientAddress)
   assert.equal(eventArgs.amount.toString(), amount)
}

