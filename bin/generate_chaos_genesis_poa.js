const fs = require('fs')
const Path = require('path')
const AsyncChild = require('async-child-process')

const DATA_DIR = Path.join(process.env.HOME,  '.ethereum/oax-chaos')


async function run() {

   const o = await AsyncChild.execAsync("geth --verbosity 0 --datadir " + DATA_DIR + " account list | cut -d ' ' -f 3 | cut -c2- | rev | cut -c2- | rev | sed -e 's/^/0x/'")
   const addresses = o.stdout.trim().split('\n')
   const chainId   = 88
   const coinbase  = addresses[0].replace('0x', '')

   var template = {
      "config": {
         "chainId"        : chainId,
         "homesteadBlock" : 0,
         "eip150Block"    : 0,
         "eip150Hash"     : "0x0000000000000000000000000000000000000000000000000000000000000000",
         "eip155Block"    : 0,
         "eip158Block"    : 0,
         "ByzantiumBlock" : 0,
         "clique" : {
            "period" : 5,
            "epoch"  : 30000
         }
      },
      "nonce"      : "0x0",
      "timestamp"  : "0x59d711ab",
      "extraData"  : "0x0000000000000000000000000000000000000000000000000000000000000000" + coinbase + "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      "gasLimit"   : "0x7A1200",
      "difficulty" : "0x1",
      "mixHash"    : "0x0000000000000000000000000000000000000000000000000000000000000000",
      "coinbase"   : "0x0000000000000000000000000000000000000000",
      "alloc" : {
      },
      "number"     : "0x0",
      "gasUsed"    : "0x0",
      "parentHash" : "0x0000000000000000000000000000000000000000000000000000000000000000"
   }


   for (var i = 0; i < addresses.length; i++) {
      template.alloc[addresses[i]] = {
         balance : "0x200000000000000000000000000000000000000000000000000000000000000"
      }
   }

   fs.writeFileSync(Path.join(DATA_DIR, '/genesis_poa.json'), JSON.stringify(template, null, 4))
}


run()
