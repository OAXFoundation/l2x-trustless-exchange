// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import pathToRegexp from 'path-to-regexp'

import { Address, Round, ApprovalId } from './types/BasicTypes'

export const endpoints = {
  // OPERATOR ENDPOINTS
  mediator: makeEndpoint('/mediator'),

  join: makeEndpoint('/join'),

  audit: makeEndpoint<{ address: Address; round: Round }>(
    '/audit/:address',
    params => {
      if (params === undefined || params.round === undefined) {
        throw Error('audit endpoint expects round parameter')
      }
      const { address } = params
      const path = toPath('/audit/:address')({ address })
      return `${path}?round=${params.round}`
    }
  ),

  // EXCHANGE ENDPOINTS

  fetchOrderBook: makeEndpoint<{ symbol: string }>('/orderbook/:symbol'),
  fetchTrades: makeEndpoint<{ symbol: string }>('/trades/:symbol'),
  fetchBalances: makeEndpoint<{ address: Address }>(
    '/accounts/:address/balance'
  ),

  createOrder: makeEndpoint('/orders'),
  cancelOrder: makeEndpoint('/orders/:id'),
  fetchOrder: makeEndpoint<{ id: ApprovalId }>('/orders/:id'),
  fetchOrders: makeEndpoint<{ owner: Address }>('/orders', params => {
    if (params === undefined || params.owner === undefined) {
      throw Error('fetchOrders endpoint expects owner parameter')
    }
    return `/orders?owner=${params.owner}`
  }),

  fetchFills: makeEndpoint<{ wallet: Address; round: Round }>(
    '/fills',

    params => {
      if (
        params === undefined ||
        params.wallet === undefined ||
        params.round === undefined
      ) {
        throw Error('fetchFills endpoint expects owner and round parameter')
      }

      return `/fills?wallet=${params.wallet}&round=${params.round}`
    }
  ),

  fastWithdrawal: makeEndpoint('/account/withdraw')
}

function makeEndpoint<T>(
  path: string,
  pathBuilder?: PathBuilder<T>
): EndPoint<T> {
  let builder

  if (pathBuilder === undefined) {
    builder = (params?: T) => {
      return toPath(path)(params)
    }
  } else {
    builder = pathBuilder
  }

  return {
    path,
    toPath: builder
  }
}

function toPath(path: string) {
  return pathToRegexp.compile(path)
}

type PathBuilder<T> = (params?: T) => string

interface EndPoint<T> {
  path: string
  toPath: PathBuilder<T>
}
