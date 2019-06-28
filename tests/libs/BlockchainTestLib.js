// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

const fs   = require('fs')
const Web3 = require('web3')
const Path = require('path')
const Chai = require('chai')



module.exports.deploy = async (name, args, options) => {
   return deployInternal(name, args, options)
}


async function deployInternal(name, args, options) {
   const basePath = Path.join(__dirname, '../../build/contracts')

   const abi = loadAbiByName(basePath, name)
   const bin = loadByteCodeByName(basePath, name)

   return deployContract(web3, name, abi, bin, args, options)
}


function loadAbiByName(basePath, name) {
   const filePath = Path.join(basePath, name + ".abi")

   return loadAbiByPath(filePath)
}


function loadByteCodeByName(basePath, name) {
   const filePath = Path.join(basePath, name + ".bin")

   return loadByteCodeByPath(filePath)
}


function loadAbiByPath(abiFilePath) {
   return JSON.parse(fs.readFileSync(abiFilePath).toString())
}


function loadByteCodeByPath(binFilePath) {
   return fs.readFileSync(binFilePath).toString()
}


async function deployContract(web3, name, abi, bytecode, args, options) {
   if (!options) {
      options = {}
   }

   if (!options.from) {
      options.from = await web3.eth.getCoinbase()
   }

   if (!options.gas) {
      options.gas      = 8000000
      options.gasPrice = '20000000000'
   }

   if (options.link) {
      const lines = bytecode.split('\n')
      bytecode = lines[0].replace(/__\$.+\$__/g, options.link.replace('0x', ''))
   }

   options.data = "0x" + bytecode

   if (args) {
      options.arguments = args
   } else {
      options.arguments = []
   }

   //console.log("Deploying contract " + name)

   const contract = new web3.eth.Contract(abi, null, options)
   const tx = contract.deploy(options)

   const receipt = await sendTxWait(web3, tx, {}, true)
/*
   var instance = null
   await tx.send()
      .on('receipt', (value) => {
         receipt = value
      })
      .on('transactionHash', function(value){
         //console.log("TxID     : " + value)
         txid = value
      }).then(obj => {
         instance = obj
      })

   // Note: Work around a bug in web3. Need to explicitly pass the web3 provider.
   //instance.setProvider(web3.currentProvider)
*/

   var code = null
   while(true) {
      code = await web3.eth.getCode(receipt.contractAddress)

      if (code && code.length > 2) {
         break
      }

      await sleep(500)
   }
   const instance = new web3.eth.Contract(abi, receipt.contractAddress, options)


   // Print summary
   //console.log("Address  : " + instance.options.address)
   //console.log("Gas used : " + receipt.gasUsed)

   return {
      instance : instance,
      address  : instance.options.address,
      receipt  : receipt
   }
}


module.exports.checkStatus = (receipt) => {
   checkStatus(receipt)
}


function checkStatus(receipt) {
   // Since the Ethereum Byzantium fork, there is a status field in the receipt.
   assert.equal(receipt.status, 1, "Transaction receipt 'status' != 1")
}


module.exports.getBalance = async (address) => {
  return new Promise (function (resolve, reject) {
    web3.eth.getBalance(address, function (error, result) {
      if (error) {
        reject(error)
      } else {
        resolve(D(result))
      }
    })
  })
}


module.exports.getGasPrice = async () => {
  return new Promise (function (resolve, reject) {
    web3.eth.getGasPrice(function (error, result) {
      if (error) {
        reject(error)
      } else {
        resolve(D(result))
      }
    })
  })
}


module.exports.assertNoEvents = (receipt) => {
   assert.equal(Object.keys(receipt.events).length, 0, "expected empty array of events")
}


module.exports.assertSendFails = async (promise) => {
   try {
      const receipt = await promise
      assert(receipt.status == '0x0', "Expected transaction receipt to have status 0")
   } catch (error) {
      const isRevert = /^.+VM Exception.+revert$/.test(error.message)
      //const isInvalidOpcode = error.message.indexOf('invalid opcode') > -1
      //const isOutOfGas      = error.message.indexOf('out of gas') > -1

      //assert(isInvalidOpcode || isOutOfGas || isDecode, "Expected transaction to fail, but got an error instead: " + error)
      assert(isRevert, "Expected transaction to fail, but got an error instead: " + error)
   }
}


module.exports.assertCallFails = async (promise) => {
   // NOTE: With web3 1.0 beta 55, the behavior is that call will return null if it
   //       fails. If it throws an exception it is likely because some invalid argument
   //       or other issue we should investigate.
   try {
      const result = await promise
      assert(result == null, "Did not throw as expected")
   } catch (error) {
      console.log('Unexpected error from call: ' + JSON.stringify(error, null, 4))
      assert.fail()
   }
}


module.exports.sendTx = async (web3, txObj, options) => {
   return await sendTx(web3, txObj, options)
}


module.exports.sendTxWait = async (web3, txObj, options) => {
   return await sendTxWait(web3, txObj, options)
}


async function sendTx(web3, txObj, options) {
   return new Promise((resolve, reject) => {
      txObj.send(options).on("transactionHash", resolve).catch(reject)
   })
}


async function sendTxWait(web3, txObj, options) {
   const txHash = await sendTx(web3, txObj, options)
   //console.log('TxID: ' + txHash)

   const receipt = await waitForReceipt(web3, txHash)
   const contract = txObj._parent

   //const decoded = decodeLogs(contract, receipt)

   return receipt
}


async function waitForReceipt(web3, txHash) {
   while (true) {
      try {
         const receipt = await web3.eth.getTransactionReceipt(txHash)

         if (receipt !== null && receipt.blockNumber) {
            return receipt
         }
      }
      catch(err) {}

      await sleep(1000)
   }
}


module.exports.decodeLogs = (contract, receipt) => {
   return decodeLogs(contract, receipt)
}


function decodeLogs(contract, receipt) {
   const events = receipt.logs.map(log =>
      contract._decodeEventABI.call({
         name: 'ALLEVENTS',
         jsonInterface: contract.options.jsonInterface
      }, log)
   )

   // Mimick web3 "contract.send" behavior by creating an event map with name as key
   receipt.events = events.reduce( (p,e) => {
      if (e.event) {
         // Create a new key for each named event; becomes array if >1
         p[e.event] = e.event in p ? Array.prototype.concat(p[e.event], e) : e
      }
      return p
   }, {})

   return events
}


async function sleep(ms) {
   return new Promise(resolve => setTimeout(resolve, ms))
}



