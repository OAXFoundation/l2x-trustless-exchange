// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

import nock from 'nock'
import 'jest'

import { HTTPClient } from '@oax/client'
import { endpoints } from '@oax/common/HTTPEndpoints'
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
} from '@oax/common/types/SerDe'
import { approvalFixtures } from '../libs/fixtures/Approval.fixture'
import {
  InsufficientBalanceError,
  RoundMismatchError,
  FeeUnpaidError,
  SignatureError
} from '@oax/common/Errors'
import { sampleProof } from '../libs/fixtures/Proof.fixture'
import { ISignedFill } from '@oax/common/types/Fills'
import { D } from '@oax/common/BigNumberUtils'
import { IL2Order } from '@oax/common/types/ExchangeTypes'
import { ISignedApproval } from '@oax/common/types/Approvals'
import { NULL_AUTHORIZATION_MESSAGE } from '../libs/EthereumBlockchain'
import { Error as JSONAPIError } from 'jsonapi-serializer'

describe('HTTP Client', () => {
  const hubURL = 'https://dex.local'
  const restapi = nock(hubURL)
  const client = new HTTPClient(new URL(hubURL))
  const USER_ADDRESS = '0x57E7Bc84825Ed94B5B88B85C4D7794e151e2125a'
  const USER_ADDRESS_SIG =
    '0x1ab901264fd5803a3918d6325436912ab50726456e129b7800d4c0f5423b890202fe6a1ef396e306352cfe53ae85798e614ad26e50c09a9d72838f58e0fcf5641b'

  afterEach(() => {
    nock.cleanAll()
  })

  describe('join', () => {
    it('join works', async () => {
      const record = AuthSerDe.toAPIRecord(NULL_AUTHORIZATION_MESSAGE)

      restapi
        .post(endpoints.join.toPath(), {
          clientAddress: USER_ADDRESS,
          signature: USER_ADDRESS_SIG
        })
        .reply(200, JSON.stringify(record))

      await expect(
        client.join(USER_ADDRESS, USER_ADDRESS_SIG)
      ).resolves.toEqual(NULL_AUTHORIZATION_MESSAGE)
    })

    it('rejects when the server sends a 500 error', async () => {
      restapi
        .post(endpoints.join.toPath(), {
          clientAddress: USER_ADDRESS,
          signature: USER_ADDRESS_SIG
        })
        .reply(500, 'Internal server error')

      await expect(client.join(USER_ADDRESS, USER_ADDRESS_SIG)).rejects.toThrow(
        'Unable to join: Internal server error'
      )
    })
  })

  describe('audit', () => {
    it('audit works ', async () => {
      const records = ProofSerDe.toAPIRecords([sampleProof])

      restapi
        .get(
          endpoints.audit.toPath({
            address: USER_ADDRESS,
            round: 42
          })
        )
        .reply(200, JSON.stringify(records))

      const result = await client.audit(USER_ADDRESS, 42)
      expect(result).toEqual([sampleProof])
    })
  })

  describe('Exchange', () => {
    describe('fetchOrderBook', () => {
      it('fetchOrderBook works', async () => {
        const symbol = 'WETH/OAX'
        const path = endpoints.fetchOrderBook.toPath({ symbol })

        const response = OrderBookSerDe.toAPIRecord(
          orderBookFixtures.level2OrderBook
        )

        restapi.get(path).reply(200, response)

        const result = await client.fetchOrderBook(symbol)

        expect(result).toEqual(orderBookFixtures.level2OrderBook)
      })
    })

    describe('fetchTrades', () => {
      it('fetchTrades works', async () => {
        const symbol = 'WETH/OAX'
        const path = endpoints.fetchTrades.toPath({ symbol })
        const response = TradeSerDe.toAPIRecords(exchangeFixtures.trades)
        restapi.get(path).reply(200, response)

        const result = await client.fetchTrades(symbol)

        expect(result).toEqual(exchangeFixtures.trades)
      })
    })

    describe('fetchBalances', () => {
      it('fetchBalances works', async () => {
        const path = endpoints.fetchBalances.toPath({ address: USER_ADDRESS })
        const response = BalancesSerDe.toAPIRecords(
          USER_ADDRESS,
          exchangeFixtures.balances
        )
        restapi.get(path).reply(200, response)

        const result = await client.fetchBalances(USER_ADDRESS)

        expect(result).toEqual(exchangeFixtures.balances)
      })
    })

    describe('createOrder', () => {
      const signedApproval: ISignedApproval = approvalFixtures.signedApproval
      const signedFeeApproval: ISignedApproval =
        approvalFixtures.signedFeeApproval

      const l2order: IL2Order = {
        orderApproval: signedApproval,
        feeApproval: signedFeeApproval
      }

      const orderJson = L2OrderSerDe.toJSON(l2order)

      const record = JSON.stringify(L2OrderSerDe.toAPIRecord(orderJson))

      it('createOrder works', async () => {
        const path = endpoints.createOrder.toPath()

        restapi.post(path, record).reply(200, record)

        const createdOrder = await client.createOrder(l2order)

        expect(createdOrder).toEqual(l2order)
      })

      it('throws SignatureError when ownerSig is invalid', async () => {
        const path = endpoints.createOrder.toPath()

        const response = {
          errors: [
            {
              status: '400',
              source: {},
              title: 'SignatureError',
              detail: ''
            }
          ]
        }

        restapi.post(path, record).reply(400, response)

        await expect(client.createOrder(l2order)).rejects.toThrowError(
          SignatureError
        )
      })

      it('throws RoundMismatchError when approval request round does not match Exchange round', async () => {
        const path = endpoints.createOrder.toPath()

        const response = {
          errors: [
            {
              status: '400',
              source: {},
              title: 'RoundMismatchError',
              detail: ''
            }
          ]
        }

        restapi.post(path, record).reply(400, response)

        await expect(client.createOrder(l2order)).rejects.toThrowError(
          RoundMismatchError
        )
      })

      it('throws InsufficientBalanceError when user does not have enough balance', async () => {
        const path = endpoints.createOrder.toPath()

        const response = {
          errors: [
            {
              status: '400',
              source: {},
              title: 'InsufficientBalanceError',
              detail: ''
            }
          ]
        }

        restapi.post(path, record).reply(400, response)

        await expect(client.createOrder(l2order)).rejects.toThrowError(
          InsufficientBalanceError
        )
      })

      it('throws FeeUnpaidError when fee is unpaid', async () => {
        const path = endpoints.createOrder.toPath()

        const response = {
          errors: [
            {
              status: '400',
              source: {},
              title: 'FeeUnpaidError',
              detail: ''
            }
          ]
        }

        restapi.post(path, record).reply(400, response)

        await expect(client.createOrder(l2order)).rejects.toThrowError(
          FeeUnpaidError
        )
      })

      it('throws when there is an unspecified error', async () => {
        const path = endpoints.createOrder.toPath()

        const response = {
          errors: [
            {
              status: '500',
              source: {},
              title: 'UnexpectedError',
              detail: 'Internal Server Error'
            }
          ]
        }

        restapi.post(path, record).reply(500, response)

        await expect(client.createOrder(l2order)).rejects.toThrow(
          'Internal Server Error'
        )
      })
    })

    describe('Fetching a single order', () => {
      const order = orderFixtures.bids[0]
      const path = endpoints.fetchOrder.toPath({ id: order.id })

      describe('Given a valid order number', () => {
        beforeEach(() => {
          const response = OrderSerDe.toAPIRecord(order)
          restapi.get(path).reply(200, response)
        })

        it('returns an order object', async () => {
          const result = await client.fetchOrder(order.id)
          expect(result).toEqual(order)
        })
      })

      describe('Given a HTTP 404 error from API server', () => {
        beforeEach(() => {
          const response = new JSONAPIError({ status: '404' })
          restapi.get(path).reply(404, response)
        })

        it('returns null', async () => {
          const result = await client.fetchOrder(order.id)
          await expect(result).toBe(null)
        })
      })

      describe('Given a HTTP 500 error from API server', () => {
        beforeEach(() => {
          const response = new JSONAPIError({
            status: '500',
            detail: 'Internal Server Error'
          })
          restapi.get(path).reply(500, response)
        })

        it('throws exception', async () => {
          const result = client.fetchOrder(order.id)
          await expect(result).rejects.toThrow(/internal server error/i)
        })
      })
    })

    describe('Fetching orders', () => {
      const endPoint = endpoints.fetchOrders.toPath({ owner: USER_ADDRESS })

      describe('Given some existing orders for an address', () => {
        const orders = [orderFixtures.bids[0], orderFixtures.bids[1]]

        beforeEach(() => {
          const response = OrderSerDe.toAPIRecords(orders)
          restapi.get(endPoint).reply(200, response)
        })

        it('returns those orders', async () => {
          const result = await client.fetchOrders(USER_ADDRESS)

          expect(result).toHaveLength(2)
          expect(result).toContainEqual(orders[0])
          expect(result).toContainEqual(orders[1])
        })
      })

      describe('Given no orders exist for an address', () => {
        beforeEach(() => {
          const response = new JSONAPIError({ status: '404' })
          restapi.get(endPoint).reply(404, response)
        })

        it('returns an empty array', async () => {
          const result = await client.fetchOrders(USER_ADDRESS)

          expect(result).toEqual([])
        })
      })

      describe('Given a HTTP 500 error from API server', () => {
        beforeEach(() => {
          const response = new JSONAPIError({
            status: '500',
            detail: 'Internal Server Error'
          })
          restapi.get(endPoint).reply(500, response)
        })

        it('throws exception', async () => {
          const result = client.fetchOrders(USER_ADDRESS)

          await expect(result).rejects.toThrow(/internal server error/i)
        })
      })
    })

    describe('fetchFills', () => {
      const wallet = '0x96Cc52B10698b57276422D98C857920d71FcC9aC'
      const round = 0

      const signedFill: ISignedFill = {
        params: {
          fillId: '0',
          approvalId: '0',
          round,
          buyAmount: D('500'),
          buyAsset: '0x870567F57784179F6c6ddF72e0Bd0C91fB50E1E2',
          sellAmount: D('1'),
          sellAsset: '0x4055b4de038205Eb2232e843bA711911EA5A1D1e',
          clientAddress: wallet,
          instanceId: '0x2f81C6042a369055484281AdB710fe8936002E4c'
        },
        signature:
          '0x48f3276a499c9169116aedddde1c1649ead14ea19b70799cb0654a0cf6be2aa23367efcbcd7a0057cabdcc74b108bc2419a1080574b381097136d859746af02c1b'
      }

      it('fetchFills works', async () => {
        const path = endpoints.fetchFills.toPath({ wallet, round })
        const response = SignedFillSerDe.toAPIRecords([signedFill])
        restapi.get(path).reply(200, response)

        const result = await client.fetchFills(wallet, round)

        expect(result).toEqual([signedFill])
      })
    })

    describe('fastWithdrawal', () => {
      it('fastWithdrawal works', async () => {
        const path = endpoints.fastWithdrawal.toPath()
        const response = { notImplemented: true }
        restapi.post(path).reply(200, response)

        await client.fastWithdrawal()

        expect(restapi.isDone()).toBeTruthy()
      })
    })

    describe('When timed out', () => {
      let client: HTTPClient

      beforeEach(() => {
        client = new HTTPClient(new URL(hubURL), { timeout: 0 })
      })

      it('join call is rejected', async () => {
        restapi
          .post(endpoints.join.toPath(), {
            clientAddress: USER_ADDRESS,
            signature: USER_ADDRESS_SIG
          })
          .delayConnection(20000)
          .reply(408)

        await expect(
          client.join(USER_ADDRESS, USER_ADDRESS_SIG)
        ).rejects.toThrow('HTTP Request timed out after 0 seconds')
      })
    })
  })
})
