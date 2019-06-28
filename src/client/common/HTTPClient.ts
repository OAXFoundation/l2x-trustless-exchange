// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import fetch from 'cross-fetch'
import {
  Address,
  Round,
  ApprovalId,
  Signature,
  Digest
} from '@oax/common/types/BasicTypes'

import {
  IOrder,
  ITradeExternal,
  IOrderBook,
  IL2Order
} from '@oax/common/types/ExchangeTypes'

import {
  InsufficientBalanceError,
  RoundMismatchError,
  FeeUnpaidError,
  InvalidSymbolError,
  SignatureError
} from '@oax/common/Errors'
import { endpoints } from '@oax/common/HTTPEndpoints'
import {
  AuthSerDe,
  BalancesSerDe,
  L2OrderSerDe,
  OrderBookSerDe,
  OrderSerDe,
  ProofSerDe,
  SignedFillSerDe,
  TradeSerDe
} from '@oax/common/types/SerDe'
import {
  IAuthorizationMessage,
  Proof
} from '@oax/common/types/SmartContractTypes'
import { ISignedFill } from '@oax/common/types/Fills'
import { Validation } from '@oax/common/Validation'

interface Options {
  timeout?: number
}

export class HTTPClient {
  readonly serverAddress: URL

  private readonly timeout: number = 30000

  constructor(url: URL, options?: Options) {
    this.serverAddress = url

    if (options !== undefined && options.timeout !== undefined) {
      this.timeout = options.timeout
    }
  }

  async join(
    clientAddress: Address,
    signature: Signature
  ): Promise<IAuthorizationMessage> {
    const url = endpoints.join.toPath()

    const response = await this.postJSON(url, {
      clientAddress,
      signature
    })

    if (response.status === 200) {
      const auth = await AuthSerDe.fromAPIRecord(await response.json())

      Validation.validateAuthorization(auth)

      return auth
    } else if (response.status === 401) {
      throw new SignatureError(await response.text())
    } else {
      throw Error(`Unable to join: ${await response.text()}`)
    }
  }

  async mediator(): Promise<Address> {
    const url = endpoints.mediator.toPath()

    const response = await this.getJSON(url)
    if (response.status === 200) {
      const json = await response.json()
      return json.mediator as Address
    } else {
      throw Error(`Unable to get mediator: ${await response.text()}`)
    }
  }

  async audit(address: Address, round: Round): Promise<Proof[]> {
    const url = endpoints.audit.toPath({ address, round })
    const response = await this.getJSON(url)
    const records = await response.json()

    const proofData = await ProofSerDe.fromAPIRecords(records)

    return proofData.map(Proof.fromJson)
  }

  async fetchOrderBook(symbol: string): Promise<IOrderBook> {
    const url = endpoints.fetchOrderBook.toPath({ symbol })
    const response = await this.getJSON(url)

    if (response.status >= 400 && response.status < 600) {
      const errorsObject = await response.json()
      Validation.validateErrors(errorsObject)
      const error = errorsObject.errors[0]
      if (error.title === 'InvalidSymbolError') {
        throw new InvalidSymbolError(error.detail)
      }
    }

    const record = await response.json()

    const jsonOrderBook = await OrderBookSerDe.fromAPIRecord(record)
    const orderBook = OrderBookSerDe.fromJSON(jsonOrderBook)

    Validation.validateOrderBook(orderBook)

    return orderBook
  }

  async fetchTrades(symbol: string): Promise<ITradeExternal[]> {
    const url = endpoints.fetchTrades.toPath({ symbol })
    const response = await this.getJSON(url)

    if (response.status >= 400 && response.status < 600) {
      const errorsObject = await response.json()
      Validation.validateErrors(errorsObject)
      const error = errorsObject.errors[0]
      if (error.title === 'InvalidSymbolError') {
        throw new InvalidSymbolError(error.detail)
      }
    }

    const records = await response.json()
    const jsonTrades = await TradeSerDe.fromAPIRecords(records)
    const trades = jsonTrades.map(TradeSerDe.fromJSON)

    trades.forEach(Validation.validateTrade)

    return trades
  }

  async fetchBalances(address: Address): Promise<any> {
    const url = endpoints.fetchBalances.toPath({ address })
    const response = await this.getJSON(url)

    const records = await response.json()
    const json = await BalancesSerDe.fromAPIRecords(records)
    const balances = BalancesSerDe.fromJSON(json)

    Validation.validateBalances(balances)

    return balances
  }

  async createOrder(l2order: IL2Order): Promise<IL2Order> {
    const url = endpoints.createOrder.toPath()

    const orderJson = L2OrderSerDe.toJSON(l2order)
    const orderRecord = L2OrderSerDe.toAPIRecord(orderJson)
    const response = await this.postJSON(url, orderRecord)

    if (response.status >= 400 && response.status < 600) {
      const errorsObject = await response.json()

      Validation.validateErrors(errorsObject)

      const error = errorsObject.errors[0]

      if (error.title === 'SignatureError') {
        throw new SignatureError(error.detail)
      } else if (error.title === 'RoundMismatchError') {
        throw new RoundMismatchError(error.detail)
      } else if (error.title === 'InsufficientBalanceError') {
        throw new InsufficientBalanceError(error.detail)
      } else if (error.title === 'FeeUnpaidError') {
        throw new FeeUnpaidError(error.detail)
      } else if (error.title === 'InvalidSymbolError') {
        throw new InvalidSymbolError(error.detail)
      } else {
        throw new Error(error.detail)
      }
    }

    const records = await response.json()
    const receivedOrderJson = await L2OrderSerDe.fromAPIRecord(records)
    return L2OrderSerDe.fromJSON(receivedOrderJson)
  }

  async cancelOrder(id: ApprovalId, authorization: Digest): Promise<void> {
    const url = endpoints.cancelOrder.toPath({ id })

    const response = await this.httpRequest(url, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ authorization })
    })

    if (response.status !== 200) {
      const errorsObj = await response.json()

      Validation.validateErrors(errorsObj)

      if (errorsObj.errors.length > 0) {
        const errorObj = errorsObj.errors[0]
        const error = new Error(errorObj.detail)
        error.name = errorObj.title

        throw error
      }
    }
  }

  async fetchOrder(id: ApprovalId): Promise<IOrder | null> {
    const url = endpoints.fetchOrder.toPath({ id })

    const response = await this.getJSON(url)

    let order = null

    if (response.status === 200) {
      const record = await response.json()
      const json = await OrderSerDe.fromAPIRecord(record)
      order = OrderSerDe.fromJSON(json)

      Validation.validateOrder(order)
    } else if (response.status !== 404) {
      const errorsObj = await response.json()

      Validation.validateErrors(errorsObj)

      if (errorsObj.errors.length > 0) {
        const errorObj = errorsObj.errors[0]
        const error = new Error(errorObj.detail)
        error.name = errorObj.title

        throw error
      }
    }

    return order
  }

  async fetchOrders(address: Address): Promise<IOrder[]> {
    const url = endpoints.fetchOrders.toPath({ owner: address })
    const response = await this.getJSON(url)

    let orders: IOrder[] = []

    if (response.status === 200) {
      const records = await response.json()
      const jsonOrders = await OrderSerDe.fromAPIRecords(records)
      const orders = jsonOrders.map(OrderSerDe.fromJSON)
      orders.forEach(Validation.validateOrder)

      return orders
    } else if (response.status !== 404) {
      const errorsObj = await response.json()

      Validation.validateErrors(errorsObj)

      if (errorsObj.errors.length > 0) {
        const errorObj = errorsObj.errors[0]
        const error = new Error(errorObj.detail)
        error.name = errorObj.title

        throw error
      }
    }

    return orders
  }

  async fetchFills(wallet: Address, round: Round): Promise<ISignedFill[]> {
    const url = endpoints.fetchFills.toPath({ wallet, round })

    const response = await this.getJSON(url)

    let signedFills: ISignedFill[] = []

    if (response.status === 200) {
      const records = await response.json()
      const jsonFills = await SignedFillSerDe.fromAPIRecords(records)
      signedFills = jsonFills.map(SignedFillSerDe.fromJSON)
      signedFills.forEach(Validation.validateSignedFill)
    }

    return signedFills
  }

  async fastWithdrawal(): Promise<any> {
    const url = endpoints.fastWithdrawal.toPath()
    const withdrawalParams = {}
    const response = await this.postJSON(url, withdrawalParams)

    return response.json()
  }

  async version(): Promise<string> {
    const result = await this.httpRequest('/HEAD')
    if (result.status !== 200) {
      throw new Error(
        `Unable to fetch server version: ${result.status} ${result.statusText}`
      )
    }
    return result.text()
  }

  private async httpRequest(url: string, req?: RequestInit): Promise<Response> {
    const uri = new URL(url, this.serverAddress)

    const response = fetch(uri.href, req)

    let timeoutHandle: any

    const timeout: Promise<Response> = new Promise((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          Error(`HTTP Request timed out after ${this.timeout / 1000} seconds`)
        )
      }, this.timeout)
    })

    const result = await Promise.race([response, timeout])

    clearTimeout(timeoutHandle)

    return result
  }

  private async postJSON(url: string, body: any): Promise<Response> {
    return this.httpRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    })
  }

  private async getJSON(url: string): Promise<Response> {
    return this.httpRequest(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
  }
}
