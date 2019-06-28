// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import uuidv4 from 'uuid/v4'
import { Error as JSONAPIError, JSONAPIErrorOptions } from 'jsonapi-serializer'
import { utils as EthersUtils } from 'ethers'

import http from 'http'
import net from 'net'
import express from 'express'
import bodyParser from 'body-parser'

import { IHttpTransportOptions } from '../common/types/BasicTypes'
import { TradingPair } from '../common/types/ExchangeTypes'
import { endpoints } from '../common/HTTPEndpoints'
import {
  AmountError,
  FeeUnpaidError,
  InsufficientBalanceError,
  InvalidSymbolError,
  ItemNotFoundError,
  OrderAlreadyClosedError,
  PrecisionError,
  RoundMismatchError,
  SignatureError
} from '../common/Errors'
import { loggers } from '../common/Logging'
import { Exchange } from './exchange/Exchange'
import {
  L2OrderSerDe,
  BalancesSerDe,
  OrderBookSerDe,
  OrderSerDe,
  SignedFillSerDe,
  TradeSerDe,
  AuthSerDe,
  ProofSerDe
} from '../common/types/SerDe'
import { Operator } from './operator/Operator'
import { IProof } from '../common/types/SmartContractTypes'
import { Validation } from '../common/Validation'

const logger = loggers.get('backend')

export interface OperatorMiddleware {
  mediator: express.RequestHandler
  audit: express.RequestHandler
}

export interface ExchangeMiddleware {
  admit: express.RequestHandler
  fetchOrderBook: express.RequestHandler
  fetchTrades: express.RequestHandler
  fetchBalances: express.RequestHandler

  createOrder: express.RequestHandler
  cancelOrder: express.RequestHandler
  fetchOrder: express.RequestHandler
  fetchOrders: express.RequestHandler

  // trustless operation
  fetchFills: express.RequestHandler

  fastWithdrawal: express.RequestHandler
}

export class HTTPServer {
  readonly webServer: express.Express

  private runningServer: http.Server | undefined | null
  private readonly options: IHttpTransportOptions

  constructor(
    operator: Operator,
    exchange: Exchange,
    options: IHttpTransportOptions = {}
  ) {
    this.webServer = makeAppServer(
      operatorMiddleware(operator),
      exchangeMiddleware(exchange)
    )
    this.options = options
  }

  /**
   * Takes the same interface as http.Server
   */
  async start(): Promise<http.Server> {
    return new Promise(resolve => {
      const server: http.Server = this.webServer.listen(
        this.options.port!,
        this.options.host!,
        this.options.backlog!,
        () => resolve(server)
      )
      this.runningServer = server
    })
  }

  async listen(): Promise<void> {
    await this.runningServer
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.runningServer) {
        this.runningServer.close((err?: Error) => {
          if (err) {
            return reject(err.message)
          }
          this.runningServer = null
          return resolve()
        })
      } else {
        reject('Server is not running')
      }
    })
  }

  get address(): net.AddressInfo | undefined {
    if (this.runningServer === undefined || this.runningServer === null) {
      throw Error('Server is not running')
    }

    return this.runningServer.address() as net.AddressInfo
  }

  get isRunning(): boolean {
    return this.runningServer !== undefined && this.runningServer !== null
  }
}

function makeAppServer(
  operatorMiddleware: OperatorMiddleware,
  exchangeMiddleware: ExchangeMiddleware
): express.Express {
  const app = express()
  app.disable('x-powered-by')
  app.use(bodyParser.json())

  // OperatorBlockchain Endpoints

  app.get(endpoints.mediator.path, operatorMiddleware.mediator)
  app.get(endpoints.audit.path, operatorMiddleware.audit)

  // Exchange Endpoints

  app.post(endpoints.join.path, exchangeMiddleware.admit)

  app.get(endpoints.fetchOrderBook.path, exchangeMiddleware.fetchOrderBook)
  app.get(endpoints.fetchTrades.path, exchangeMiddleware.fetchTrades)

  app.get(endpoints.fetchBalances.path, exchangeMiddleware.fetchBalances)

  app.post(endpoints.createOrder.path, exchangeMiddleware.createOrder)
  app.delete(endpoints.cancelOrder.path, exchangeMiddleware.cancelOrder)
  app.get(endpoints.fetchOrder.path, exchangeMiddleware.fetchOrder)
  app.get(endpoints.fetchOrders.path, exchangeMiddleware.fetchOrders)
  app.get(endpoints.fetchFills.path, exchangeMiddleware.fetchFills)
  app.get(endpoints.fastWithdrawal.path, exchangeMiddleware.fastWithdrawal)

  // Static files
  app.use(express.static('../public'))

  // Error handling
  app.use(jsonErrorHandler)

  return app
}

export function exchangeMiddleware(exchange: Exchange): ExchangeMiddleware {
  return {
    async admit(req, res, next) {
      const errors: JSONAPIErrorOptions[] = []

      if (req.body.clientAddress === undefined) {
        errors.push({
          status: '400',
          title: 'Missing required attribute',
          detail: 'Missing required attribute `clientAddress`.'
        })
      }

      if (req.body.signature === undefined) {
        errors.push({
          status: '400',
          title: 'Missing required attribute',
          detail: 'Missing required attribute `signature`.'
        })
      }

      if (errors.length > 0) {
        res.status(400).json(errors)
        return
      }

      const clientAddress = EthersUtils.getAddress(req.body['clientAddress'])

      try {
        const authorizationMessage = await exchange.admit(
          clientAddress,
          req.body['signature']
        )

        res.json(AuthSerDe.toAPIRecord(authorizationMessage))
      } catch (err) {
        if (err instanceof SignatureError) {
          res.status(401).json(
            new JSONAPIError({
              status: '401',
              title: 'Unauthorized',
              detail: 'Signature Error'
            })
          )
        } else {
          next(err)
        }
      }
    },
    async fetchOrderBook(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) {
      const symbol = req.params['symbol']

      try {
        const market = exchange.marketForSymbol(symbol)
        const orderBook = await exchange.orderBook(market)
        res.json(OrderBookSerDe.toAPIRecord(orderBook))
      } catch (err) {
        if (err instanceof InvalidSymbolError) {
          res.status(404).json({
            errors: [
              {
                status: '404',
                source: {},
                title: err.name,
                detail: err.message
              }
            ]
          })
        } else {
          next(err)
        }
      }
    },
    async fetchTrades(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) {
      const symbol: TradingPair = req.params['symbol']
      try {
        const market = exchange.marketForSymbol(symbol)
        const trades = await exchange.fetchTradesPublic(market)
        res.json(TradeSerDe.toAPIRecords(trades))
      } catch (err) {
        if (err instanceof InvalidSymbolError) {
          res.status(404).json({
            errors: [
              {
                status: '404',
                source: {},
                title: err.name,
                detail: err.message
              }
            ]
          })
        } else {
          next(err)
        }
      }
    },
    async fetchBalances(req: express.Request, res: express.Response, next) {
      const address = EthersUtils.getAddress(req.params['address'])
      try {
        const balances = await exchange.balances(address)
        res.json(BalancesSerDe.toAPIRecords(address, balances))
      } catch (err) {
        next(err)
      }
    },

    async createOrder(req, res, next) {
      try {
        const orderJson = await L2OrderSerDe.fromAPIRecord(req.body)
        const l2order = L2OrderSerDe.fromJSON(orderJson)

        Validation.validateSignedApproval(l2order.orderApproval)
        Validation.validateSignedFee(l2order.feeApproval)

        await exchange.createOrder(l2order)

        res.status(201).json(req.body)
      } catch (err) {
        if (
          err instanceof AmountError ||
          err instanceof InsufficientBalanceError ||
          err instanceof InvalidSymbolError ||
          err instanceof FeeUnpaidError ||
          err instanceof PrecisionError ||
          err instanceof RoundMismatchError ||
          err instanceof SignatureError
        ) {
          res.status(400).json({
            errors: [
              {
                status: '400',
                source: {},
                title: err.name,
                detail: err.message
              }
            ]
          })
        } else {
          next(err)
        }
      }
    },

    async cancelOrder(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) {
      const id = req.params.id
      const authorization = req.body.authorization

      try {
        const result = await exchange.cancelOrder(id, authorization)
        res.json(result)
      } catch (err) {
        if (
          err instanceof ItemNotFoundError ||
          err instanceof OrderAlreadyClosedError
        ) {
          res.status(400).json(
            new JSONAPIError({
              status: '400',
              title: err.name,
              detail: err.message
            })
          )
        } else {
          next(err)
        }

        next(err)
      }
    },

    async fetchOrder(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) {
      const id = req.params['id']

      try {
        const order = await exchange.fetchOrder(id)

        if (order === null) {
          const error = new JSONAPIError({
            status: '404',
            title: 'Order not found',
            detail: `Order ${id} cannot be found`
          })

          res.status(404).json(error)
        } else {
          res.json(OrderSerDe.toAPIRecord(order))
        }
      } catch (err) {
        next(err)
      }
    },
    async fetchOrders(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) {
      const address = EthersUtils.getAddress(req.query.owner)

      try {
        const orders = await exchange.fetchOrders(address)
        res.json(OrderSerDe.toAPIRecords(orders))
      } catch (err) {
        next(err)
      }
    },

    async fetchFills(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) {
      try {
        const wallet = EthersUtils.getAddress(req.query.wallet)
        const round = req.query.round

        const signedFills = await exchange.fetchFills(wallet, round)

        res.json(SignedFillSerDe.toAPIRecords(signedFills))
      } catch (err) {
        next(err)
      }
    },

    fastWithdrawal(_req, res) {
      res.status(501).send('Not Implemented')
    }
  }
}

export function operatorMiddleware(operator: Operator): OperatorMiddleware {
  return {
    mediator(_req: express.Request, res: express.Response) {
      res.json({ mediator: operator.mediatorAddress })
    },
    async audit(
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) {
      try {
        const address = EthersUtils.getAddress(req.params['address'])
        const round = parseInt(req.query.round)

        let result: IProof[] | undefined
        try {
          result = await operator.audit(address, round)
        } catch (err) {
          logger.info(err.message)
          next(err)
        }

        if (result === undefined || result === null) {
          const error = new JSONAPIError({
            status: '404',
            title: 'Resource not found',
            detail: `Unregistered wallet address`
          })

          res.status(404).json(error)
        } else {
          res.json(ProofSerDe.toAPIRecords(result))
        }
      } catch (e) {
        logger.error(`Problem when processing audit request: ${e.toString()}.`)
      }
    }
  }
}

/**
 * Logs error with request-specific error ID, but returns a non-descriptive
 * 500 error to prevent leaking internal details
 */
const jsonErrorHandler: express.ErrorRequestHandler = function(
  err,
  _req,
  res,
  next
) {
  if (res.headersSent) {
    return next(err)
  }
  const errorId = uuidv4()
  logger.error(`Error ID: ${errorId}\n${err.stack}`)

  res.status(500).json(
    new JSONAPIError({
      id: errorId,
      status: '500',
      title: 'Internal Server Error',
      detail: `Error ID: ${errorId}`
    })
  )
}
