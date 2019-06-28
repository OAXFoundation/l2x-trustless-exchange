// ----------------------------------------------------------------------------
// consolelib.js - Library for running a console / REPL loop
//
// Copyright (c) 2017-2019 Enuma Technologies.
// https://www.enuma.io/
// ----------------------------------------------------------------------------

const Prompt = require('prompt')
const Colors = require('colors/safe')
const Bluebird = require('bluebird')
const REPL = require('repl')
const AwaitOutside = require('await-outside')

var _eval = null
var commands = null
var executeCallback = null

module.exports.run = async (c, e) => {
  commands = c
  executeCallback = e

  Bluebird.promisifyAll(Prompt)

  Prompt.message = ''
  Prompt.delimiter = ''

  Prompt.start()

  await runLoop()
}

async function runLoop() {
  var r = REPL.start({
    prompt: Colors.green('> '),
    //eval            : customEval,
    useColors: true,
    useGlobal: true,
    ignoreUndefined: true
  })

  //r.on('exit', () => { console.log('Console is exiting...') })

  _eval = r.eval
  r.eval = customEval

  AwaitOutside.addAwaitOutsideToReplServer(r)

  var context = {
    // Coco : "ABC",
    // f : () => { console.log("bobo") },
    // k : async () => { return 5 }
  }

  Object.assign(r.context, context)
}

async function customEval(cmd, context, filename, callback) {
  if (cmd === 'exit\n' || cmd === 'quit\n') {
    if (executeCallback !== null) {
      await executeCallback('quit')
    }

    process.exit()
  }

  if (commands !== null && executeCallback !== null) {
    const tokens = cmd.trim().split(' ')

    const command = tokens[0]

    if (commands.has(command)) {
      await executeCallback(tokens[0], tokens.slice(1))
      callback()
      return
    }
  }

  _eval(cmd, context, filename, callback)
}
