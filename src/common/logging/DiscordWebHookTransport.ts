import fetch from 'cross-fetch'
import winston from 'winston'

interface DiscordTransportOptions extends winston.GenericTransportOptions {
  url: string
}

export class DiscordWebHook extends winston.Transport {
  private url: string

  constructor(options: DiscordTransportOptions) {
    super(options)

    this.name = options.name || 'discordWebHook'
    this.url = options.url
  }

  log(level: string, msg: string, meta: Object, callback: Function) {
    const isMetaEmpty = Object.keys(meta).length === 0
    const metaStr = isMetaEmpty ? '' : `\n  ${JSON.stringify(meta)}`
    const timestamp = new Date().toISOString()

    const payload = {
      content: `Operator ${level} [${timestamp}]: ${msg}${metaStr}`
    }

    fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })
      .then(() => {
        this.emit('logged', payload)
      })
      .catch(err => {
        this.emit('error', err)
      })

    callback()
  }
}
