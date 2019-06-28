// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */
import {
  mock,
  instance,
  when,
  reset,
  verify,
  deepEqual,
  anything
} from 'ts-mockito'
import R from 'ramda'
import { SignatureError } from '../src/common/Errors'
import 'jest'
import lolex from 'lolex'
import { L2Client } from '../src/client/operator/L2Client'
import { ExchangeClient } from '../src/client/exchange/ExchangeClient'
import { PrivateKeyIdentity } from '../src/common/identity/PrivateKeyIdentity'
import { HTTPClient } from '../src/client/common/HTTPClient'
import { orderBookFixtures } from './libs/fixtures/OrderBook.fixture'
import { exchangeFixtures } from './libs/fixtures/Exchange.fixture'
import { orderFixtures } from './libs/fixtures/Order.fixture'
import { AssetRegistry } from '../src/common/AssetRegistry'
import { D, etherToD, etherToWei } from '../src/common/BigNumberUtils'

import { SOME_ADDRESS, CONSTANT_FEE } from './libs/SystemFixture'
import { IApproval } from '../src/common/types/Approvals'

const mockedHTTPClient: HTTPClient = mock(HTTPClient)
const mockedOperatorClient: L2Client = mock(L2Client)

describe('ExchangeClient', () => {
  const symbol = 'BTC/USD'

  afterEach(() => {
    jest.resetAllMocks()
    reset(mockedOperatorClient)
    reset(mockedHTTPClient)
  })

  describe('lifecycle management', () => {
    it('creation works', async () => {
      expect(makeExchangeClient).not.toThrow()
    })
  })

  describe('Joining exchange', () => {
    it('join works', async () => {
      const { exchangeClient } = makeExchangeClient()

      await expect(exchangeClient.join()).resolves.not.toThrow()
    })

    it('invoked the join method of hub client', async () => {
      const { exchangeClient } = makeExchangeClient()

      await exchangeClient.join()

      verify(mockedOperatorClient.join()).once()
    })

    it('.isConnected flag returns true when connected to Exchange', async () => {
      const { exchangeClient } = makeExchangeClient()

      expect(exchangeClient.isConnected).toBeFalsy()

      await exchangeClient.join()

      expect(exchangeClient.isConnected).toBeTruthy()
    })

    it('fails with exception when server rejects signature on authorization', async () => {
      const { exchangeClient } = makeExchangeClient()

      when(mockedOperatorClient.join()).thenReject(new SignatureError())

      await expect(exchangeClient.join()).rejects.toThrow(SignatureError)
    })

    it('fails when unknown exception occurs in layer 2 client', async () => {
      const { exchangeClient } = makeExchangeClient()

      when(mockedOperatorClient.join()).thenReject(new Error('unknown error'))

      await expect(exchangeClient.join()).rejects.toThrow('unknown error')
    })
  })

  describe('Leaving Exchange', () => {
    it('leave works', async () => {
      const { exchangeClient } = makeExchangeClient()

      await exchangeClient.join()
      await exchangeClient.leave()

      verify(mockedOperatorClient.leave()).once()
    })
  })

  describe('fetchOrderBook', () => {
    it('fetchOrderBook works', async () => {
      const { exchangeClient } = makeExchangeClient()

      when(mockedHTTPClient.fetchOrderBook(symbol)).thenResolve(
        orderBookFixtures.level2OrderBook
      )

      const orderBook = await exchangeClient.fetchOrderBook(symbol)

      expect(orderBook).toEqual(orderBookFixtures.level2OrderBookInEther)
    })
  })

  describe('fetchBalances', () => {
    it('fetchBalances works', async () => {
      const { identity, exchangeClient } = makeExchangeClient()

      when(mockedHTTPClient.fetchBalances(identity.address)).thenResolve(
        exchangeFixtures.balances
      )

      const balancesEth = await exchangeClient.fetchBalances()
      const balancesWei = R.mapObjIndexed(
        ({ free, locked }) => ({
          free: etherToWei(free),
          locked: etherToWei(locked)
        }),
        balancesEth
      )

      verify(mockedHTTPClient.fetchBalances(identity.address)).once()
      expect(balancesWei).toEqual(exchangeFixtures.balances)
    })
  })

  describe('fetchTrades', () => {
    it('fetchTrades works', async () => {
      const { exchangeClient } = makeExchangeClient()

      when(mockedHTTPClient.fetchTrades(symbol)).thenResolve(
        exchangeFixtures.trades
      )

      const tradesEth = await exchangeClient.fetchTrades(symbol)

      verify(mockedHTTPClient.fetchTrades(symbol)).once()
      const tradesWei = tradesEth.map(({ amount, ...rest }) => ({
        ...rest,
        amount: etherToWei(amount)
      }))

      expect(tradesWei).toEqual(exchangeFixtures.trades)
    })
  })

  describe('fetchOrder', () => {
    it('fetchOrder works without fees', async () => {
      const { exchangeClient } = makeExchangeClient()
      const order = orderFixtures.bids[0]

      when(mockedHTTPClient.fetchOrder(order.id)).thenResolve(order)

      const resultEth = (await exchangeClient.fetchOrder(order.id))!
      const { amount, filled, remaining } = resultEth
      const resultWei = {
        ...resultEth,
        amount: etherToWei(amount),
        filled: etherToWei(filled),
        remaining: etherToWei(remaining)
      }

      verify(mockedHTTPClient.fetchOrder(order.id)).once()
      expect(resultWei).toEqual(order)
    })

    it('fetchOrder works with fees', async () => {
      const { exchangeClient } = makeExchangeClient()
      const order = orderFixtures.orderWithFee

      when(mockedHTTPClient.fetchOrder(order.id)).thenResolve(order)

      const resultEth = (await exchangeClient.fetchOrder(order.id))!
      const { amount, filled, remaining } = resultEth
      const resultWei = {
        ...resultEth,
        amount: etherToWei(amount),
        filled: etherToWei(filled),
        remaining: etherToWei(remaining)
      }

      verify(mockedHTTPClient.fetchOrder(order.id)).once()
      expect(resultWei).toEqual(order)
    })

    it('returns null when no order is found', async () => {
      const { exchangeClient } = makeExchangeClient()

      const orderId = 'non-existent-order'

      when(mockedHTTPClient.fetchOrder(orderId)).thenResolve(null)

      const result = await exchangeClient.fetchOrder(orderId)

      verify(mockedHTTPClient.fetchOrder(orderId)).once()
      expect(result).toEqual(null)
    })
  })

  describe('fetchOrders', () => {
    it('fetchOrders works', async () => {
      const { identity, exchangeClient } = makeExchangeClient()
      const order = [orderFixtures.bids[0], orderFixtures.bids[1]]

      when(mockedHTTPClient.fetchOrders(identity.address)).thenResolve(order)

      const resultEth = await exchangeClient.fetchOrders()
      const resultWei = resultEth.map(
        ({ amount, filled, remaining, ...rest }) => ({
          ...rest,
          amount: etherToWei(amount),
          filled: etherToWei(filled),
          remaining: etherToWei(remaining)
        })
      )

      verify(mockedHTTPClient.fetchOrders(identity.address)).once()

      expect(new Set(resultWei)).toEqual(new Set(order))
    })

    it('returns an empty array when no order is found', async () => {
      const { identity, exchangeClient } = makeExchangeClient()

      when(mockedHTTPClient.fetchOrders(identity.address)).thenResolve([])

      const result = await exchangeClient.fetchOrders()

      expect(result).toEqual([])
    })
  })

  describe('createOrder', () => {
    let clock: lolex.Clock

    beforeEach(() => {
      clock = lolex.install()
    })

    afterEach(() => {
      clock.uninstall()
    })

    it('createOrder works', async () => {
      const { exchangeClient, identity } = makeExchangeClient()
      // const l2order = approvalFixtures.l2order
      const round = 0

      when(mockedOperatorClient.getInstanceId()).thenReturn(SOME_ADDRESS)
      // when(mockedHTTPClient.createOrder(deepEqual(l2order))).thenResolve('1')
      when(mockedOperatorClient.round).thenReturn(round)

      const orderApproval: IApproval = {
        approvalId: anything(),
        round: round,
        buy: {
          asset: exchangeFixtures.BTC,
          amount: etherToD('1')
        },
        sell: {
          asset: exchangeFixtures.USD,
          amount: etherToD('478.68')
        },
        intent: 'buyAll',
        owner: identity.address,
        instanceId: SOME_ADDRESS
      }

      const feeApproval: IApproval = {
        approvalId: anything(),
        round: round,
        buy: {
          asset: exchangeFixtures.OAX,
          amount: D('0')
        },
        sell: {
          asset: exchangeFixtures.OAX,
          amount: CONSTANT_FEE
        },
        intent: 'sellAll',
        owner: identity.address,
        instanceId: SOME_ADDRESS
      }

      when(
        mockedOperatorClient.createOrder(
          deepEqual(orderApproval),
          deepEqual(feeApproval)
        )
      ).thenResolve('1')

      const result = await exchangeClient.createOrder(
        'BTC/USD',
        'limit',
        'buy',
        D('1'),
        D('478.68')
      )

      expect(result).toEqual('1')
    })

    it('throws when price <= 0', async () => {
      const { exchangeClient } = makeExchangeClient()
      when(mockedOperatorClient.round).thenReturn(0)

      await expect(
        exchangeClient.createOrder(
          'BTC/USD',
          'limit',
          'buy',
          D('-1'),
          D('478.68')
        )
      ).rejects.toThrow(/Order amount must be larger than 0/)
    })

    it('throws when amount <= 0', async () => {
      const { exchangeClient } = makeExchangeClient()
      when(mockedOperatorClient.round).thenReturn(0)

      await expect(
        exchangeClient.createOrder(
          'BTC/USD',
          'limit',
          'buy',
          D('1'),
          D('-478.68')
        )
      ).rejects.toThrow(/Order price must be larger than 0/)
    })
  })
})

function makeExchangeClient() {
  const identity = new PrivateKeyIdentity(
    '0xa68b37161aa54b442a893ea9a88d484072899bfac5abb7db222f92b5f595ae5a'
  )

  const operatorClient: L2Client = instance(mockedOperatorClient)
  const httpClient: HTTPClient = instance(mockedHTTPClient)

  const assetRegistry = new AssetRegistry()
  assetRegistry.add('BTC', exchangeFixtures.BTC)
  assetRegistry.add('USD', exchangeFixtures.USD)

  const exchangeClient = new ExchangeClient(
    identity,
    operatorClient,
    assetRegistry,
    {
      transport: httpClient,
      mediatorAddress: SOME_ADDRESS,
      nonce:
        '0xb5dc242b7fc467034518eaeb9869a8052c3c40ae1480f9090ac22d80080ce984',
      fee: {
        asset: exchangeFixtures.OAX,
        amount: CONSTANT_FEE
      }
    }
  )

  return {
    identity,
    exchangeClient
  }
}
