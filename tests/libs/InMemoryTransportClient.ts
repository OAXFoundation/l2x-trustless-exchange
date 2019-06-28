// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import {
  Address,
  AssetAddress,
  Signature,
  Round,
  ApprovalId
} from '../../src/common/types/BasicTypes'
import { HTTPClient } from '../../src/client/common/HTTPClient'
import { SystemFixture } from './SystemFixture'
import {
  IL2Order,
  IOrder,
  IOrderBook,
  ITradeExternal
} from '../../src/common/types/ExchangeTypes'
import {
  IAuthorizationMessage,
  Proof
} from '../../src/common/types/SmartContractTypes'
import { ISignedFill } from '../../src/common/types/Fills'

export class InMemoryTransportClient extends HTTPClient {
  constructor(private readonly fixture: SystemFixture) {
    super(new URL('http://127.0.0.1:8000'))
  }

  async join(
    clientAddress: Address,
    signature: Signature
  ): Promise<IAuthorizationMessage> {
    const exchange = this.fixture.getExchange()
    return await exchange.admit(clientAddress, signature)
  }

  async mediator(): Promise<Address> {
    return Promise.resolve(this.fixture.getMediatorAddress())
  }

  async audit(_address: Address, _round: Round): Promise<Proof[]> {
    throw Error('Method not implemented')
  }

  async proof(_address: Address, _asset: AssetAddress): Promise<Proof[]> {
    throw Error('Method not implemented')
  }

  async fetchOrderBook(_symbol: string): Promise<IOrderBook> {
    throw Error('Method not implemented')
  }

  async fetchTrades(_symbol: string): Promise<ITradeExternal[]> {
    throw Error('Method not implemented')
  }

  async fetchBalances(_address: Address): Promise<any> {
    throw Error('Method not implemented')
  }

  async createOrder(_l2order: IL2Order): Promise<IL2Order> {
    throw Error('Method not implemented')
  }

  async fetchOrder(_id: ApprovalId): Promise<IOrder | null> {
    throw Error('Method not implemented')
  }

  async fetchOrders(_address: Address): Promise<IOrder[]> {
    throw Error('Method not implemented')
  }

  async fetchFills(wallet: Address, round: Round): Promise<ISignedFill[]> {
    const exchange = this.fixture.getExchange()
    return exchange.fetchFills(wallet, round)
  }

  async fastWithdrawal(): Promise<any> {
    throw Error('Method not implemented')
  }
}
