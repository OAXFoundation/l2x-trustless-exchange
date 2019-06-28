// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import { Deserializer as JSONAPIDeserializer } from 'jsonapi-serializer'
import { utils as EthersUtils } from 'ethers'
import { AddressZero } from 'ethers/constants'
import {
  mock,
  instance,
  resetCalls,
  when,
  spy,
  anything,
  verify
} from 'ts-mockito'
import R from 'ramda'
import net from 'net'
import nock from 'nock'

import 'jest'
import { makeFetch, FetchFunction } from 'supertest-fetch'

import { HTTPServer } from '../../src/server/HTTPServer'
import { PrivateKeyIdentity } from '../../src/common/identity/PrivateKeyIdentity'

import { endpoints } from '../../src/common/HTTPEndpoints'
import {
  AmountError,
  FeeUnpaidError,
  InsufficientBalanceError,
  InvalidSymbolError,
  PrecisionError,
  RoundMismatchError,
  SignatureError
} from '../../src/common/Errors'
import { Exchange } from '../../src/server/exchange/Exchange'
import { mainnet } from '../../config/asset-registry/assets'
import { orderBookFixtures } from '../libs/fixtures/OrderBook.fixture'
import { exchangeFixtures } from '../libs/fixtures/Exchange.fixture'
import { orderFixtures } from '../libs/fixtures/Order.fixture'
import {
  AuthSerDe,
  BalancesSerDe,
  L2OrderSerDe,
  OrderBookSerDe,
  OrderSerDe,
  ProofSerDe,
  SignedFillSerDe,
  TradeSerDe
} from '../../src/common/types/SerDe'
import { approvalFixtures } from '../libs/fixtures/Approval.fixture'
import { Operator } from '../../src/server/operator/Operator'
import { MetaLedger } from '../../src/common/accounting/MetaLedger'

import { sampleProof } from '../libs/fixtures/Proof.fixture'
import { D } from '../../src/common/BigNumberUtils'
import { ISignedFill } from '../../src/common/types/Fills'
import { IL2Order, IL2OrderJson } from '../../src/common/types/ExchangeTypes'
import { ISignedApproval } from '../../src/common/types/Approvals'
import {
  mkAuthorization,
  vfAuthorization
} from '../../src/common/AuthorizationMessage'

describe('HTTP Server', () => {
  const OAX_ADDRESS = mainnet.assets.OAX.address
  const WETH_ADDRESS = mainnet.assets.WETH.address

  const operatorIdentity = new PrivateKeyIdentity()

  const mockedOpeator: Operator = mock(Operator)
  const operator: Operator = instance(mockedOpeator)
  const metaLedger: MetaLedger = new MetaLedger({
    mediatorAddress: '0x35C8F3e0fEDe0c83f969f735422B6F135F375B59',
    operatorAddress: operatorIdentity.address,
    assets: [OAX_ADDRESS, WETH_ADDRESS]
  })
  const exchange = new Exchange(operator, metaLedger)
  const spiedExchange = spy(exchange)

  const user = new PrivateKeyIdentity(
    '0xa1348335d515a23bf2d54df8848102773826c01c242e2ec2419d704ff7aeb31a'
  )
  const USER_ADDRESS = user.address
  const CHKSUMMED_USER_ADDR = EthersUtils.getAddress(USER_ADDRESS)

  exchange.addAsset('OAX', OAX_ADDRESS)
  exchange.addAsset('WETH', WETH_ADDRESS)

  let server: HTTPServer
  let fetch: FetchFunction

  beforeEach(() => {
    server = new HTTPServer(operator, exchange)
    fetch = makeFetch(server.webServer)
  })

  afterEach(() => {
    nock.cleanAll()
    jest.resetAllMocks()
    resetCalls(mockedOpeator)
    resetCalls(spiedExchange)
  })

  describe('lifecycle management', () => {
    it('start works', async () => {
      const runningServer = await server.start()
      expect(runningServer.listening).toBeTruthy()
      expect(server.isRunning).toBeTruthy()
      await runningServer.close()
    })

    it('stop works', async () => {
      const runningServer = await server.start()
      await server.close()
      expect(server.isRunning).toBeFalsy()
      expect(runningServer.listening).toBeFalsy()
    })

    it('Double close on http transport rejects', async () => {
      await server.start()
      await expect(server.close())
      await expect(server.close()).rejects.toMatch('Server is not running')
    })

    it('stop rejects if the transport has not been started', async () => {
      await expect(server.close()).rejects.toMatch('Server is not running')
    })

    it('random ports', async () => {
      const runningServer = await server.start()
      const freePort = (runningServer.address() as net.AddressInfo).port
      await server.close()

      const serverOnRandomPort = new HTTPServer(operator, exchange, {
        port: freePort
      })
      const randomPortRunningServer = await serverOnRandomPort.start()
      expect(randomPortRunningServer.listening).toBeTruthy()
      await serverOnRandomPort.close()
    })

    it('HTTPServer.address gives host and port info', async () => {
      await server.start()
      expect(server.address).toBeDefined()
      expect(typeof server.address!.port).toEqual('number')
      expect(typeof server.address!.address).toEqual('string')
      expect(typeof server.address!.family).toEqual('string')
      await server.close()
    })
  })

  describe('Error handling', () => {
    it('returns JSON:API error object when handler throws', async () => {
      const symbol = 'BASE/QUOTE'
      const orderbookMethod = jest.spyOn(exchange, 'orderBook')
      const symbolToMarket = jest.spyOn(exchange, 'marketForSymbol')

      symbolToMarket.mockReturnValue({
        base: '0xa000000000000000000000000000000000000000',
        quote: '0xb000000000000000000000000000000000000000'
      })
      orderbookMethod.mockImplementation(() => {
        throw Error('error details')
      })

      const endpoint = endpoints.fetchOrderBook.toPath({ symbol })

      const result = await fetch(endpoint)
      const orderBook = await result.json()

      expect(orderBook).toMatchObject({
        errors: [
          {
            status: '500',
            title: 'Internal Server Error'
          }
        ]
      })
    })
  })

  describe('Operator end points', () => {
    describe('mediator', () => {
      it('mediator works', async () => {
        when(mockedOpeator.mediatorAddress).thenReturn(
          '0xadd700000000000000000'
        )

        const result = await fetch(endpoints.mediator.toPath())
        expect(result.status).toEqual(200)
        expect(await result.json()).toHaveProperty('mediator')
      })
    })

    describe('/audit endpoint', () => {
      describe('Given there is a proof for a client in a round', () => {
        const addr = EthersUtils.getAddress(USER_ADDRESS)
        const round = 42

        beforeEach(() => {
          when(mockedOpeator.audit(addr, round)).thenResolve([sampleProof])
        })

        it.each`
          address               | type
          ${addr}               | ${'checksummed'}
          ${addr.toLowerCase()} | ${'non-checksummed'}
        `(
          'returns proof for the given $type address and round',
          async ({ address }) => {
            const res = await fetch(endpoints.audit.toPath({ address, round }))
            const records = await res.json()
            const result = await ProofSerDe.fromAPIRecords(records)

            expect(result).toEqual([ProofSerDe.toJSON(sampleProof)])
          }
        )
      })

      it('returns with HTTP 404 when given an unregistered address', async () => {
        const result = await fetch(
          endpoints.audit.toPath({
            address: '0x60705d9f1bbbc1f248bcd8d39a7d126f593b4237',
            round: 1
          })
        )
        expect(result.status).toEqual(404)
        expect(await result.json()).toEqual({
          errors: [
            {
              status: '404',
              title: 'Resource not found',
              detail: 'Unregistered wallet address'
            }
          ]
        })
      })
    })
  })

  describe('Exchange', () => {
    const symbol = 'WETH/OAX'
    const market = {
      base: WETH_ADDRESS,
      quote: OAX_ADDRESS
    }

    describe('admit', () => {
      it('admit works', async () => {
        const round = 0

        const signature = await user.hashAndSign(USER_ADDRESS)
        const authorizationMessage = await mkAuthorization(
          USER_ADDRESS,
          round,
          operatorIdentity
        )

        when(spiedExchange.admit(USER_ADDRESS, signature)).thenResolve(
          authorizationMessage
        )

        const result = await postJSON(fetch, endpoints.join.toPath(), {
          clientAddress: USER_ADDRESS,
          signature
        })

        const record = await result.json()
        const auth = await AuthSerDe.fromAPIRecord(record)

        expect(
          vfAuthorization(auth, operatorIdentity.address, USER_ADDRESS, round)
        ).toBe(true)
      })

      it('fails if the JSON sent did not have registration property', async () => {
        const result = await postJSON(fetch, endpoints.join.toPath())

        expect(result.status).toEqual(400)
        expect(await result.json()).toEqual([
          {
            status: '400',
            title: 'Missing required attribute',
            detail: 'Missing required attribute `clientAddress`.'
          },
          {
            status: '400',
            title: 'Missing required attribute',
            detail: 'Missing required attribute `signature`.'
          }
        ])
      })
    })

    describe('fetchOrderBook', () => {
      it('fetchOrderBook works', async () => {
        const orderbookMethod = jest.spyOn(exchange, 'orderBook')
        const symbolToMarket = jest.spyOn(exchange, 'marketForSymbol')

        symbolToMarket.mockReturnValue(market)
        orderbookMethod.mockResolvedValue(orderBookFixtures.level2OrderBook)

        const endpoint = endpoints.fetchOrderBook.toPath({ symbol })

        const result = await fetch(endpoint)
        const orderBook = await result.json()

        const deserializedOrderBook = await OrderBookSerDe.fromAPIRecord(
          orderBook
        )

        expect(deserializedOrderBook).toEqual(
          orderBookFixtures.level2OrderBookJson
        )
      })

      it('fails if the symbol has no market', async () => {
        jest.spyOn(exchange, 'marketForSymbol').mockImplementation(() => {
          throw new InvalidSymbolError()
        })

        const result = await fetch(endpoints.fetchOrderBook.toPath({ symbol }))

        expect(result.status).toEqual(404)
        expect(await result.json()).toMatchObject({
          errors: [
            {
              status: '404',
              title: 'InvalidSymbolError'
            }
          ]
        })
      })
    })

    describe('fetchTrades', () => {
      it('fetchTrades works', async () => {
        const fetchTradesPublicMethod = jest.spyOn(
          exchange,
          'fetchTradesPublic'
        )
        fetchTradesPublicMethod.mockResolvedValue(exchangeFixtures.trades)

        const endpoint = endpoints.fetchTrades.toPath({ symbol })

        const result = await fetch(endpoint)
        const serializedTrades = await result.json()

        const deserializedTrades = await TradeSerDe.fromAPIRecords(
          serializedTrades
        )

        expect(deserializedTrades).toMatchObject(exchangeFixtures.tradesJson)
      })

      it('fails if the symbol has no market', async () => {
        jest.spyOn(exchange, 'marketForSymbol').mockImplementation(() => {
          throw new InvalidSymbolError()
        })

        const result = await fetch(endpoints.fetchTrades.toPath({ symbol }))

        expect(result.status).toEqual(404)
        expect(await result.json()).toMatchObject({
          errors: [
            {
              status: '404',
              title: 'InvalidSymbolError'
            }
          ]
        })
      })
    })
    describe('fetchBalances', () => {
      beforeEach(() => {
        when(spiedExchange.balances(anything())).thenResolve(
          exchangeFixtures.balances
        )
      })

      it('fetchBalances works', async () => {
        const endpoint = endpoints.fetchBalances.toPath({
          address: USER_ADDRESS
        })

        const result = await fetch(endpoint)
        const serializedBalances = await result.json()

        const balances = await BalancesSerDe.fromAPIRecords(serializedBalances)

        expect(result.status).toEqual(200)
        expect(balances).toEqual(exchangeFixtures.balancesJson)
      })

      it('works with non-checksummed address', async () => {
        const endpoint = endpoints.fetchBalances.toPath({
          address: USER_ADDRESS.toLowerCase()
        })

        await fetch(endpoint)

        const checksummedAddress = EthersUtils.getAddress(USER_ADDRESS)
        verify(spiedExchange.balances(checksummedAddress)).called()
      })
    })
    describe('createOrder', () => {
      let l2order: IL2OrderJson

      beforeEach(() => {
        l2order = approvalFixtures.l2orderJson
      })

      it('createOrder works', async () => {
        const exchangePlaceOrder = jest.spyOn(exchange, 'createOrder')
        exchangePlaceOrder.mockResolvedValue(
          l2order.orderApproval.params.approvalId
        )

        const endpoint = endpoints.createOrder.toPath()
        const record = L2OrderSerDe.toAPIRecord(l2order)
        const result = await postJSON(fetch, endpoint, record)

        expect(await result.json()).toEqual(record)
      })

      describe('returns HTTP 400', () => {
        it('when ownerSig is invalid', async () => {
          const exchangePlaceOrder = jest.spyOn(exchange, 'createOrder')
          exchangePlaceOrder.mockRejectedValue(new SignatureError())
          const signedApproval: ISignedApproval = R.mergeDeepRight(
            approvalFixtures.signedApproval,
            {
              params: {
                owner: '0x0000000000000000000000000000000000000000'
              }
            }
          )
          const endpoint = endpoints.createOrder.toPath()

          const l2Order = approvalFixtures.l2order
          const newL2Order: IL2Order = {
            orderApproval: signedApproval,
            feeApproval: l2Order.feeApproval
          }

          const record = L2OrderSerDe.toAPIRecord(
            L2OrderSerDe.toJSON(newL2Order)
          )

          const result = await postJSON(fetch, endpoint, record)

          expect(await result.status).toEqual(400)
          expect(await result.json()).toMatchObject({
            errors: [
              {
                status: '400',
                source: {},
                title: 'SignatureError'
              }
            ]
          })
        })

        it('when approval request round does not match Exchange round', async () => {
          const exchangePlaceOrder = jest.spyOn(exchange, 'createOrder')
          exchangePlaceOrder.mockRejectedValue(new RoundMismatchError())

          const endpoint = endpoints.createOrder.toPath()

          const result = await postJSON(
            fetch,
            endpoint,
            L2OrderSerDe.toAPIRecord(l2order)
          )

          expect(await result.status).toEqual(400)
          expect(await result.json()).toMatchObject({
            errors: [
              {
                status: '400',
                source: {},
                title: 'RoundMismatchError'
              }
            ]
          })
        })

        it('when user does not have enough balance', async () => {
          const exchangePlaceOrder = jest.spyOn(exchange, 'createOrder')
          exchangePlaceOrder.mockRejectedValue(new InsufficientBalanceError())

          const endpoint = endpoints.createOrder.toPath()

          const result = await postJSON(
            fetch,
            endpoint,
            L2OrderSerDe.toAPIRecord(l2order)
          )

          expect(await result.status).toEqual(400)
          expect(await result.json()).toMatchObject({
            errors: [
              {
                status: '400',
                source: {},
                title: 'InsufficientBalanceError'
              }
            ]
          })
        })

        it('when fee is unpaid', async () => {
          const exchangePlaceOrder = jest.spyOn(exchange, 'createOrder')
          exchangePlaceOrder.mockRejectedValue(new FeeUnpaidError())

          const endpoint = endpoints.createOrder.toPath()

          const result = await postJSON(
            fetch,
            endpoint,
            L2OrderSerDe.toAPIRecord(l2order)
          )

          expect(await result.status).toEqual(400)
          expect(await result.json()).toMatchObject({
            errors: [
              {
                status: '400',
                source: {},
                title: 'FeeUnpaidError'
              }
            ]
          })
        })

        it('when amount validation fails', async () => {
          const exchangePlaceOrder = jest.spyOn(exchange, 'createOrder')
          const errorDetail = 'Approval buy amount cannot be <= 0'
          exchangePlaceOrder.mockRejectedValue(new AmountError(errorDetail))

          const endpoint = endpoints.createOrder.toPath()

          const result = await postJSON(
            fetch,
            endpoint,
            L2OrderSerDe.toAPIRecord(l2order)
          )

          expect(await result.status).toEqual(400)
          expect(await result.json()).toMatchObject({
            errors: [
              {
                status: '400',
                source: {},
                title: 'AmountError',
                detail: errorDetail
              }
            ]
          })
        })

        it("when the amount's precision exceeds what the exchange supports", async () => {
          const exchangePlaceOrder = jest.spyOn(exchange, 'createOrder')
          const errorDetail = 'Amount 1 exceeds exchange precision'
          exchangePlaceOrder.mockRejectedValue(new PrecisionError(errorDetail))

          const endpoint = endpoints.createOrder.toPath()

          const result = await postJSON(
            fetch,
            endpoint,
            L2OrderSerDe.toAPIRecord(l2order)
          )

          expect(await result.status).toEqual(400)
          expect(await result.json()).toMatchObject({
            errors: [
              {
                status: '400',
                source: {},
                title: 'PrecisionError',
                detail: errorDetail
              }
            ]
          })
        })

        it("when the trading pair doesn't exist", async () => {
          const exchangePlaceOrder = jest.spyOn(exchange, 'createOrder')
          const errorDetail = "No market for symbol 'OAX/WETH'"
          exchangePlaceOrder.mockRejectedValue(
            new InvalidSymbolError(errorDetail)
          )

          const endpoint = endpoints.createOrder.toPath()

          const result = await postJSON(
            fetch,
            endpoint,
            L2OrderSerDe.toAPIRecord(l2order)
          )

          expect(await result.status).toEqual(400)
          expect(await result.json()).toMatchObject({
            errors: [
              {
                status: '400',
                source: {},
                title: 'InvalidSymbolError',
                detail: errorDetail
              }
            ]
          })
        })
      })
    })
    describe('fetchOrder', () => {
      const order = orderFixtures.bids[0]
      const endpoint = endpoints.fetchOrder.toPath({ id: order.id })

      it('fetchOrder works', async () => {
        const exchangeFetchOrder = jest.spyOn(exchange, 'fetchOrder')
        const orderJson = OrderSerDe.toJSON(order)
        exchangeFetchOrder.mockResolvedValue(order)

        const result = await fetch(endpoint)
        const record = await result.json()

        const deserializedOrder = await OrderSerDe.fromAPIRecord(record)

        expect(deserializedOrder).toEqual(orderJson)
      })

      it('returns 404 if order not found', async () => {
        const exchangeFetchOrder = jest.spyOn(exchange, 'fetchOrder')
        exchangeFetchOrder.mockResolvedValue(null)

        const result = await fetch(endpoint)

        expect(result.status).toEqual(404)
      })
    })
    describe('fetchOrders', () => {
      const orders = [orderFixtures.bids[0], orderFixtures.bids[1]]
      const jsonOrders = orders.map(OrderSerDe.toJSON)

      beforeEach(() => {
        const anyAddress = anything()
        when(spiedExchange.fetchOrders(anyAddress)).thenResolve(orders)
      })

      it('fetchOrders works', async () => {
        const endpoint = endpoints.fetchOrders.toPath({
          owner: USER_ADDRESS
        })

        const result = await fetch(endpoint)
        const records = await result.json()

        const orders = await OrderSerDe.fromAPIRecords(records)

        verify(spiedExchange.fetchOrders(USER_ADDRESS)).once()
        expect(orders).toEqual(jsonOrders)
      })

      it('works with non-checksummed address', async () => {
        const endpoint = endpoints.fetchOrders.toPath({
          owner: USER_ADDRESS.toLowerCase()
        })

        const result = await fetch(endpoint)
        const records = await result.json()

        const orders = await new JSONAPIDeserializer({}).deserialize(records)

        verify(spiedExchange.fetchOrders(CHKSUMMED_USER_ADDR)).once()
        expect(orders).toEqual(jsonOrders)
      })
    })
    describe('fastWithdrawal', () => {
      it('fastWithdrawal works', async () => {
        const endpoint = endpoints.fastWithdrawal.toPath()

        const result = await fetch(endpoint)

        expect(result.status).toEqual(501)
        expect(await result.text()).toEqual('Not Implemented')
      })
    })

    describe('Fetch fills', () => {
      describe('Given existing fills', () => {
        const round = 0
        const signedFill: ISignedFill = {
          params: {
            fillId: '0',
            approvalId: '0',
            round,
            buyAmount: D('500'),
            buyAsset: OAX_ADDRESS,
            sellAmount: D('1'),
            sellAsset: WETH_ADDRESS,
            clientAddress: USER_ADDRESS,
            instanceId: AddressZero
          },
          signature: 'sig'
        }

        beforeEach(async () => {
          const anyAddress = anything()
          const anyRound = anything()
          when(spiedExchange.fetchFills(anyAddress, anyRound)).thenResolve([
            signedFill
          ])
        })

        it('fetchFills works', async () => {
          const endpoint = endpoints.fetchFills.toPath({
            wallet: USER_ADDRESS,
            round
          })

          const result = await fetch(endpoint)
          const records = await result.json()

          const deserializedFills = await SignedFillSerDe.fromAPIRecords(
            records
          )

          const jsonSignedFill = SignedFillSerDe.toJSON(signedFill)
          expect(deserializedFills).toEqual([jsonSignedFill])
        })

        it('works with non-checksummed address', async () => {
          const endpoint = endpoints.fetchFills.toPath({
            wallet: USER_ADDRESS.toLowerCase(),
            round
          })

          await fetch(endpoint)

          verify(
            spiedExchange.fetchFills(CHKSUMMED_USER_ADDR, anything())
          ).called()
        })
      })
    })
  })
})

function postJSON(fetch: FetchFunction, url: string, body?: any) {
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }

  return fetch(url, init)
}
