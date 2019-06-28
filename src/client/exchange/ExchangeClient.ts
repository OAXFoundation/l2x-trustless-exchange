/// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import R from 'ramda'
import { BigNumber } from 'bignumber.js'

import { ILot } from '@oax/common/types/BasicTypes'

import {
  IOrder,
  IOrderBook,
  ITradeExternal,
  IExchangeBalances,
  BidAsk
} from '@oax/common/types/ExchangeTypes'

import { computeFeeApproval, IApproval } from '@oax/common/types/Approvals'

import { L2Client } from '../operator/L2Client'
import { HTTPClient } from '../common/HTTPClient'
import { AssetRegistry } from '@oax/common/AssetRegistry'
import Markets, { symbolToMarket } from '@oax/common/Markets'
import { ApprovalsFunctions } from '@oax/common/types/Approvals'
import { D, etherToD, etherToWei, weiToEther } from '@oax/common/BigNumberUtils'

import generateUniqueIdentifier = ApprovalsFunctions.generateUniqueIdentifier

import { Identity } from '@oax/common/identity/Identity'

declare type ClientConfig = {
  transport?: HTTPClient
  mediatorAddress?: string
  nonce?: string
  fee?: ILot
}

export class ExchangeClient {
  readonly assetRegistry: AssetRegistry
  readonly config: ClientConfig

  private identity: Identity
  private hubClient: L2Client
  private transport: HTTPClient
  private _isConnected: boolean = false

  /**
   * Constructor
   *
   * @param identity Identity used by the operator for signing
   * @param hubClient L2Client to communicate with the operator layer
   * @param assetRegistry AssetRegistry, mapping asset symbols to Ethereum addresses
   * @param config Configuration object including mediator address, fees, etc
   */
  constructor(
    identity: Identity,
    hubClient: L2Client,
    assetRegistry: AssetRegistry,
    config: ClientConfig
  ) {
    this.hubClient = hubClient
    this.identity = identity
    this.transport =
      config && config.transport ? config.transport : hubClient.transport!
    this.assetRegistry = assetRegistry
    this.config = config
  }

  /**
   * Joins an OAX hub
   *
   * Each wallet address must join the operator at least once
   *
   * @signing_required
   */
  async join(): Promise<void> {
    await this.hubClient.join()

    this._isConnected = true
  }

  /**
   * Leaves an OAX hub
   *
   * Gracefully leaves an OAX hub, doing the necessary cleanup.
   */
  async leave(): Promise<void> {
    return this.hubClient.leave()
  }

  /**
   * Get the order book for a symbol asset pair
   *
   * @param symbol Asset pair (e.g. OAX/WETH)
   */
  async fetchOrderBook(symbol: string): Promise<IOrderBook> {
    const orderBookInWei = await this.transport.fetchOrderBook(symbol)
    const bidAskInEther = (bidAsk: BidAsk) => ({
      price: bidAsk.price,
      amount: weiToEther(bidAsk.amount)
    })

    return R.mergeDeepLeft(
      {
        asks: orderBookInWei.asks.map(bidAskInEther),
        bids: orderBookInWei.bids.map(bidAskInEther)
      },
      orderBookInWei
    )
  }

  /**
   * Trade history for a symbol/asset pair
   *
   * @param symbol Asset pair (e.g. OAX/WETH)
   */
  async fetchTrades(symbol: string): Promise<ITradeExternal[]> {
    const trades = await this.transport.fetchTrades(symbol)

    const amountInEther = trades.map(({ amount, ...rest }) => ({
      amount: weiToEther(amount),
      ...rest
    }))
    return amountInEther
  }

  /**
   * Get all balances for each asset
   */
  async fetchBalances(): Promise<IExchangeBalances> {
    const address = this.identity.address
    const balances = await this.transport.fetchBalances(address)
    const balancesInWei = R.mapObjIndexed(
      ({ free, locked }) => ({
        free: weiToEther(free),
        locked: weiToEther(locked)
      }),
      balances
    )

    let balancesInSymbol: IExchangeBalances = {}

    for (let asset of Object.keys(balancesInWei)) {
      const symbol = this.assetRegistry.getSymbol(asset)
      balancesInSymbol[symbol || asset] = balancesInWei[asset]
    }

    return balancesInSymbol
  }

  /**
   * Create order
   *
   * @param symbol Asset pair (e.g. OAX/WETH)
   * @param orderType Must be 'limit'
   * @param side Must be 'buy' or 'sell'
   * @param amount Amount to buy or sell (in Ether units)
   * @param price Limit price for the order
   * @returns The ID for the newly created order
   *
   * @signing_required
   */
  async createOrder(
    symbol: string,
    orderType: 'limit',
    side: 'buy' | 'sell',
    amount: BigNumber,
    price: BigNumber
  ): Promise<string> {
    if (orderType !== 'limit') {
      throw Error('Only limit order is supported at this time')
    }

    if (D('0').gt(price)) {
      throw Error(`Order price must be larger than 0. price=${price}`)
    }

    if (D('0').gt(amount)) {
      throw Error(`Order amount must be larger than 0. amount=${amount}`)
    }

    const market = symbolToMarket(this.assetRegistry, symbol)
    const { buy, sell } = Markets[side](market, amount, price)

    //Create a signed
    const approvalId = generateUniqueIdentifier(
      this.hubClient.round,
      buy.asset,
      buy.amount,
      sell.asset,
      sell.amount,
      side === 'buy' ? 'buyAll' : 'sellAll',
      this.config.nonce
    )

    const orderApproval: IApproval = {
      approvalId: approvalId,
      round: this.hubClient.round,
      buy,
      sell,
      intent: side === 'buy' ? 'buyAll' : 'sellAll',
      owner: this.identity.address,

      instanceId: this.hubClient.getInstanceId()
    }

    const orderFee: IApproval = computeFeeApproval(
      orderApproval,
      this.config.fee!.asset,
      this.config.fee!.amount,
      this.config.nonce
    )

    return this.hubClient.createOrder(orderApproval, orderFee)
  }

  /**
   * Cancels an active order
   * @param id ID of the order to cancel
   */
  async cancelOrder(id: string) {
    await this.hubClient.cancelOrder(id)
  }

  /**
   * Get order details
   * @param id ID of the order to fetch
   */
  async fetchOrder(id: string): Promise<IOrder | null> {
    const order = await this.transport.fetchOrder(id)
    if (order == null) {
      return null
    }
    return orderWeiToEther(order)
  }

  /**
   * Get all user orders
   */
  async fetchOrders(): Promise<IOrder[]> {
    const address = this.identity.address
    const orders = await this.transport.fetchOrders(address)
    return orders.map(orderWeiToEther)
  }

  /**
   * Deposit asset
   *
   * @param asset Address of the token for the deposit
   * @param amount Quantity of tokens to be deposited
   * @param approve Whether to call ERC20.approve before doing the deposit
   *
   * @onchain
   * @signing_required
   */
  async deposit(
    asset: string,
    amount: BigNumber,
    approve: boolean
  ): Promise<void> {
    const amountWei = etherToWei(amount)
    await this.hubClient.deposit(asset, amountWei, approve)
  }

  /**
   * Non-collaborative asset withdrawal request
   *
   * In case if the hub is unresponsive, the withdrawal request can be
   * submitted directly to the hub smart contract.
   *
   * A withdrawal confirmation window must pass
   * (approximately X hours currently) before the user can perform the actual
   * withdrawal by calling on-chain withdrawal.
   *
   * Note: Confirmation of withdrawal handled by hubClient on new Quarter.
   *
   * @param asset Address of the token for the withdrawal
   * @param amount Quantity of tokens to be withdrawn
   * @param convertToWei True if the amount needs to be converted to wei
   *
   * @onchain
   * @signing_required
   */
  async requestWithdrawalConvert(
    asset: string,
    amount: BigNumber,
    convertToWei: boolean
  ) {
    const symbol = this.assetRegistry.getSymbol(asset)!
    const balances = (await this.fetchBalances())[symbol]

    let free: BigNumber
    if (convertToWei) free = balances.free
    else free = balances.free.multipliedBy(D('1e18'))

    if (amount.gt(free)) {
      throw Error(`Withdrawal amount ${amount} > free amount ${free}`)
    }
    let amountForWithdrawal: BigNumber
    if (convertToWei) amountForWithdrawal = etherToD(amount.toString(10))
    else amountForWithdrawal = amount

    await this.hubClient.withdraw(asset, amountForWithdrawal)
  }

  /**
   * Initiates a withdrawal with wei conversion
   * @param address Address of the token for the withdrawal
   * @param amount Quantity of tokens (will be converted to wei)
   */
  async requestWithdrawalWithWeiConversion(
    asset: string,
    amount: BigNumber
  ): Promise<void> {
    return this.requestWithdrawalConvert(asset, amount, true)
  }

  /**
   * Initiates a withdrawal without wei conversion
   * @param asset Address of the token for the withdrawal
   * @param amount Quantity of tokens to withdraw (in wei)
   */
  async requestWithdrawal(asset: string, amount: BigNumber): Promise<void> {
    return this.requestWithdrawalConvert(asset, amount, false)
  }

  /**
   * Confirms an elligible withdrawal
   *
   * The withdrawal must have been initiated with requestWithdrawal and
   * additional conditions must be met for it to be elligible for confirmation.
   *
   * @param asset Address of the asset to confirm for
   */
  async confirmWithdrawal(asset: string): Promise<void> {
    return await this.hubClient.confirmWithdrawal(asset)
  }

  /**
   * Returns whether the client is currently connected
   */
  get isConnected(): boolean {
    return this._isConnected
  }
}

export function orderWeiToEther(order: IOrder): IOrder {
  const { amount, filled, remaining } = order
  return {
    ...order,
    amount: weiToEther(amount),
    filled: weiToEther(filled),
    remaining: weiToEther(remaining)
  }
}
