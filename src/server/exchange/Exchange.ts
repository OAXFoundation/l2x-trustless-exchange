// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import BigNumber from 'bignumber.js'
import R from 'ramda'
import {
  Address,
  Amount,
  ApprovalId,
  AssetAddress,
  Digest,
  IAmounts,
  Intent,
  Round,
  Signature,
  ILot
} from '../../common/types/BasicTypes'

import {
  ApprovalWithMeta,
  IExchangeBalances,
  IFillExchange,
  IL2Order,
  IMarket,
  IOrder,
  IOrderBook,
  ITradeExternal,
  ITradeInternal,
  MarketDepthLevel,
  OrderStatus,
  TradingPair
} from '../../common/types/ExchangeTypes'

import {
  Approval,
  ApprovalsFunctions,
  IApproval,
  ISignedApproval
} from '../../common/types/Approvals'

import { verifyMessageSig, verifySig } from '../../common/identity/Identity'
import {
  createFillParams,
  createTrades,
  isBuy,
  mkMatch,
  side
} from './Matching'
import { D, representable, sum } from '../../common/BigNumberUtils'
import { AssetRegistry } from '../../common/AssetRegistry'
import { marketDepth } from './OrderBook'
import { marketToSymbol, symbolToMarket } from '../../common/Markets'
import {
  FeeWrongFormatError,
  ItemNotFoundError,
  InvalidSymbolError,
  PrecisionError,
  RoundMismatchError,
  SignatureError,
  UnregisteredUserError,
  WrongFeeStructureError,
  WrongInstanceIdError
} from '../../common/Errors'
import { loggers } from '../../common/Logging'
import { MetaLedger } from '../../common/accounting/MetaLedger'
import { Operator } from '../operator/Operator'
import { ISignedFill } from '../../common/types/Fills'
import { SignedApprovalSerDe } from '../../common/types/SerDe'
import { Mutex } from '../../common/Mutex'
import { IAuthorizationMessage } from '../../common/types/SmartContractTypes'

const logger = loggers.get('backend')

export type ExchangeConfig = {
  decimalPlaces?: number
  fee?: ILot
  pairs?: string[]
}

export function mkPair(buy: AssetAddress, sell: AssetAddress): TradingPair {
  return [buy, sell].sort().join('/')
}

export class Exchange {
  readonly metaLedger: MetaLedger
  readonly config: ExchangeConfig

  private readonly operator: Operator
  private readonly _matchLock: Mutex
  private readonly decimalPlaces: number
  private readonly pairs: string[]

  private readonly assetRegistry = new AssetRegistry()

  constructor(
    operator: Operator,
    metaLedger: MetaLedger,
    config: ExchangeConfig = { pairs: ['OAX/WETH'] }
  ) {
    const { pairs, decimalPlaces } = config

    this.decimalPlaces = R.defaultTo(8, decimalPlaces)
    this.pairs = R.defaultTo(['OAX/WETH'], pairs)
    this.operator = operator
    this.metaLedger = metaLedger
    this.config = config
    this._matchLock = new Mutex()
  }

  get round(): Round {
    return this.operator.round
  }

  /**
   * Admits a user into the exchange network
   *
   * If a user sends a correct get_authorization message to the exchange, and
   * the exchange decides to accept the user registration request, it returns
   * the authorization message signed by the operator
   *
   * @param clientAddress -The address of the client requesting to join
   * @param sig - The signature of the address signed by the address owner
   */
  async admit(
    clientAddress: Address,
    sig: Signature
  ): Promise<IAuthorizationMessage> {
    if (!verifyMessageSig(clientAddress, sig, clientAddress)) {
      throw new SignatureError(
        'Client address does not match recovered address'
      )
    }

    return await this.operator.admit(clientAddress)
  }

  /**
   * This function stores the approvals of the L2Order
   * and calculates the trades but doesn't
   * execute them.
   */
  async createTradesForApproval(
    approval: ISignedApproval
  ): Promise<ITradeInternal[]> {
    const { buy, sell } = approval.params

    // Assets are flipped compared to the ones we are matching against.
    // Thus the price is sell / buy here.
    const price = sell.amount.div(buy.amount)

    const approvals = await this.metaLedger.getApprovalsWithMeta(
      (builder: any) =>
        builder
          .where({
            round: this.round,
            buyAsset: sell.asset,
            sellAsset: buy.asset,
            status: 'open'
          })
          .andWhere('price', '<=', price.toString(10))
    )
    logger.info(`Fetched ${approvals.length} approvals`)

    const makers = await Promise.all(
      approvals.map(async ({ approval, id }) => {
        const { params } = approval
        const remaining = await this.remaining(params)
        const remainingAmount = isBuy(params.intent)
          ? remaining.buy.amount
          : remaining.sell.amount
        return mkMatch(params, remainingAmount, id)
      })
    )

    const taker = mkMatch(
      approval.params,
      isBuy(approval.params.intent)
        ? approval.params.buy.amount
        : approval.params.sell.amount,
      await this.fetchApprovalPriority(approval.params.approvalId)
    )
    const trades = createTrades(taker, makers, this.decimalPlaces)
    logger.info(`Created ${trades.length} trades`)

    await this.metaLedger.insertTrades(trades)

    return trades
  }

  async storeApproval(approval: ISignedApproval) {
    logger.info(`Storing approval id=${approval.params.approvalId}`)
    await this.metaLedger.insertApproval(approval)
  }

  async fetchApprovalPriority(approvalId: ApprovalId): Promise<number> {
    return (await this.fetchApproval(approvalId)).id
  }

  /**
   * - Checks the order and fee approval of the order
   * - Inserts the order approval into local storage
   * - Computes the trades
   * - Updates the balances accordingly taking into account
   *   both approvals (order and fee)
   *   IMPORTANT NOTE: we assume that fee approvals cannot be cancelled even though the order approval is not matched.
   * @param order: contains the order and fee approval
   * @returns: the list of trades
   */
  async addOrder(order: IL2Order): Promise<ITradeInternal[]> {
    await this._matchLock.lockAsync()

    let trades: ITradeInternal[] = []

    try {
      const orderApproval = order.orderApproval
      const feeApproval = order.feeApproval

      await this.checkFeeApproval(feeApproval, orderApproval)
      await this.checkApproval(orderApproval)

      await this.metaLedger.insertOrder(order)
      await this.processFeeApproval(feeApproval)

      try {
        trades = await this.processOrderApproval(orderApproval)
      } catch (err) {
        logger.error(`Failure in order matching`)
        logger.error(err.stack)
      }
    } finally {
      this._matchLock.unlock()
    }

    return trades
  }

  /**
   * Store the approval of the order
   * Execute the matching engine
   * @param orderApproval: approval containing the information of the order
   */
  async processOrderApproval(orderApproval: ISignedApproval) {
    logger.info(
      `Processing order approval id=${orderApproval.params.approvalId}`
    )
    const trades = await this.createTradesForApproval(orderApproval)
    await this.registerTrades(trades)
    return trades
  }

  /**
   * Checks the correct structure of a fee approval
   */
  async checkFeeApproval(
    feeApproval: ISignedApproval,
    orderApproval: ISignedApproval
  ) {
    this.checkFeeSyntax(feeApproval)

    await this._checkApproval(feeApproval, true)

    this.checkFeeStructure(feeApproval, orderApproval)
  }

  /**
   * This is where the fee structure logic is placed.
   * That is where we define how we charge for an order.
   * In the future this could be part of a configuration file.
   * @param feeApproval: approval for the fee that must match the fee structure
   * @param _orderApproval: approval for the order
   */
  checkFeeStructure(
    feeApproval: ISignedApproval,
    _orderApproval: ISignedApproval
  ): void {
    // To avoid having to handle partial fee-fills, we require exact amounts
    if (!feeApproval.params.sell.amount.eq(this.config.fee!.amount)) {
      throw new WrongFeeStructureError('Fee approval amount mismatched.')
    }
  }

  /**
   * Verifies the field of the approval so that it is compatible with the fee logic
   * @param feeApproval
   */
  checkFeeSyntax(feeApproval: ISignedApproval): void {
    const rightIntent = feeApproval.params.intent == 'sellAll'
    const rightBuyAmout = feeApproval.params.buy.amount.isZero()
    const rightBuyAsset = feeApproval.params.buy.asset == this.config.fee!.asset
    const rightSellAsset =
      feeApproval.params.sell.asset == this.config.fee!.asset

    // Sell amount is checked in checkFeeStructure
    const condition =
      rightBuyAmout && rightBuyAsset && rightIntent && rightSellAsset

    if (!condition) {
      throw new FeeWrongFormatError('Wrong format for fee approval')
    }
  }

  /**
   * Stores the approval of the fee
   * Compute the corresponding signedFill and sign it
   * Stores the signed signedFill
   * @param approval: approval representing the fee
   */
  async processFeeApproval(approval: ISignedApproval) {
    const feeToFill = (fee: IApproval) => {
      return {
        approvalId: fee.approvalId,
        round: fee.round,
        buy: fee.buy,
        sell: fee.sell
      }
    }

    const operatorApproval = operatorApprovalForFee(
      this.operator.address,
      approval.params
    )
    const ownerSig = await this.operator.signApproval(operatorApproval)
    await this.storeApproval({ params: operatorApproval, ownerSig })

    const fillClient = feeToFill(approval.params)
    const fillOperator = feeToFill(operatorApproval)

    await this.addFill(fillClient)
    await this.addFill(fillOperator)
  }

  async balances(address: Address): Promise<IExchangeBalances> {
    const balances: IExchangeBalances = {}

    for (const asset of this.metaLedger.assets) {
      balances[asset] = {
        free: await this.metaLedger.balance(asset, address, this.round),
        locked: await this.metaLedger.locked(asset, address, this.round)
      }
    }

    return balances
  }

  /**
   * Checks the parameters of an approval
   * @param approval: approval to be checked
   */
  async checkApproval(approval: ISignedApproval): Promise<void> {
    return this._checkApproval(approval, false)
  }

  /**
   * Checks the parameters of an approval
   * @param approval: approval to be checked
   * @param forceZeroBuyAmount: allows zero buy amount (for fees)
   */
  private async _checkApproval(
    approval: ISignedApproval,
    forceZeroBuyAmount: boolean
  ): Promise<void> {
    this.checkApprovalRound(approval)
    await this.verifyClientRegistered(approval)

    ApprovalsFunctions.validateAmounts(approval, forceZeroBuyAmount)
    this.checkInstanceId(approval)
  }

  /**
   * Verify that the instanceId of the approval is correct
   * @param approval: approval to be checked
   */
  checkInstanceId(approval: ISignedApproval) {
    if (approval.params.instanceId != this.operator.mediatorAddress) {
      throw new WrongInstanceIdError(
        'The instance id of the approval does not correspond to the address of the mediator.'
      )
    }
  }

  checkApprovalRound({ params }: ISignedApproval): void {
    if (params.round != this.round) {
      throw new RoundMismatchError(
        `Wrong round: approval round =${params.round} != current round =${
          this.round
        }`
      )
    }
  }

  async remainingSellAmount(params: IApproval): Promise<Amount> {
    return (await this.remaining(params)).sell.amount
  }

  async remaining(params: IApproval): Promise<IAmounts> {
    const meta = await this.fetchApproval(params.approvalId)
    return {
      buy: { amount: params.buy.amount.minus(meta.filledBuy) },
      sell: { amount: params.sell.amount.minus(meta.filledSell) }
    }
  }

  async fetchTradesInternal({
    base,
    quote
  }: IMarket): Promise<ITradeInternal[]> {
    const desiredPair = mkPair(base, quote)

    let isMatchingPair: (trade: ITradeInternal) => Promise<boolean>

    isMatchingPair = async trade => {
      const { approval } = await this.fetchApproval(trade.left.approvalId)
      const { buy, sell } = approval.params
      const pair = mkPair(buy.asset, sell.asset)
      return pair == desiredPair
    }

    let matchingTrades: ITradeInternal[] = []

    for (const trade of await this.metaLedger.getTrades()) {
      if (await isMatchingPair(trade)) {
        matchingTrades.push(trade)
      }
    }

    return R.sortBy(trade => trade.timestamp, matchingTrades)
  }

  async fetchTradesPublic(market: IMarket): Promise<ITradeExternal[]> {
    const trades = await this.fetchTradesInternal(market)

    return Promise.all(
      trades.map(trade => this.tradeInternalToExternal(market, trade))
    )
  }

  async tradeInternalToExternal(
    market: IMarket,
    trade: ITradeInternal
  ): Promise<ITradeExternal> {
    const symbol = marketToSymbol(this.assetRegistry, market)
    const { approval } = await this.fetchApproval(trade.right.approvalId)
    const tradeExternal = mkTradeExternal(symbol, trade, approval)

    return tradeExternal
  }

  addAsset(symbol: string, address: Address): void {
    // NOTE: allow adding assets that don't have a ledger OR create a ledger?
    this.assetRegistry.add(symbol, address)
  }

  async createOrder(l2order: IL2Order): Promise<ApprovalId> {
    const orderApproval = l2order.orderApproval
    const feeApproval = l2order.feeApproval

    this.verifyPair(orderApproval)
    await this.verifyClientRegistered(orderApproval)

    this.verifyApprovalSig(orderApproval)
    this.verifyApprovalPrecision(orderApproval)

    this.verifyApprovalSig(feeApproval)
    this.verifyApprovalPrecision(orderApproval)

    await this.addOrder(l2order)

    return orderApproval.params.approvalId
  }

  async cancelOrder(id: ApprovalId, authorization: Digest): Promise<boolean> {
    const approval = (await this.metaLedger.getApprovals({
      approvalId: id,
      round: this.round
    }))[0]

    if (approval === undefined) {
      throw new ItemNotFoundError(
        `Cannot cancel order: Order with ID ${id} not found.`
      )
    }
    verifyMessageSig(id, authorization, approval.params.owner)
    await this.metaLedger.cancelApproval(id)
    return true
  }

  async verifyClientRegistered({ params }: ISignedApproval): Promise<void> {
    const clientAddress = params.owner
    const isRegistered = await this.metaLedger.isClientRegistered(clientAddress)

    if (!isRegistered) {
      throw new UnregisteredUserError(
        `The user ${clientAddress} is not registered`
      )
    }
  }

  private verifyPair(approval: ISignedApproval) {
    const { base, quote } = marketOf(approval)
    const baseSymbol = this.assetRegistry.getSymbol(base)
    const quoteSymbol = this.assetRegistry.getSymbol(quote)
    if (quoteSymbol == undefined || baseSymbol == undefined) {
      throw new InvalidSymbolError('No market for symbol')
    }
    const symbol = `${baseSymbol}/${quoteSymbol}`
    this.marketForSymbol(symbol)
  }

  verifyApprovalSig(signedApproval: ISignedApproval) {
    const { params, ownerSig } = signedApproval
    const approvalDigest = Approval.fromIApproval(params).createDigest()

    const sigVerificationResult = verifySig(
      approvalDigest,
      ownerSig,
      params.owner
    )
    if (!sigVerificationResult) {
      const signedApprovalJson = JSON.stringify(
        SignedApprovalSerDe.toJSON(signedApproval)
      )
      throw new SignatureError(
        `Owner signature for approval is invalid. Order=${signedApprovalJson}`
      )
    }
  }

  verifyApprovalPrecision({ params: { buy, sell } }: ISignedApproval) {
    for (const { amount } of [buy, sell]) {
      if (!representable(amount, this.decimalPlaces)) {
        throw new PrecisionError(`Amount ${amount} exceeds exchange precision`)
      }
    }
  }

  async fetchApproval(approvalId: ApprovalId): Promise<ApprovalWithMeta> {
    const approval = (await this.metaLedger.getApprovalsWithMeta({
      approvalId
    }))[0]

    if (approval == undefined) {
      throw Error(`Approval with id ${approvalId} not found`)
    }
    return approval
  }

  async fetchApprovals(wallet: Address): Promise<ApprovalWithMeta[]> {
    return this.metaLedger.getApprovalsWithMeta({ wallet })
  }

  async fetchOrder(approvalId: ApprovalId): Promise<IOrder | null> {
    try {
      const { approval } = await this.fetchApproval(approvalId)
      return await this.approvalToOrder(approval)
    } catch (err) {
      logger.info(err.message)
      return null
    }
  }

  async fetchOrders(address: Address): Promise<IOrder[]> {
    const approvals = (await this.fetchApprovals(address)).filter(
      a => !a.approval.params.buy.amount.eq(0)
    )

    return Promise.all(
      approvals.map(({ approval }) => this.approvalToOrder(approval))
    )
  }

  // NOTE making this async to prepare to async fetching of signed fills
  async fetchFills(wallet: Address, round: Round): Promise<ISignedFill[]> {
    return this.metaLedger.getFills({
      wallet: wallet,
      round
    })
  }

  async openApprovals(): Promise<ISignedApproval[]> {
    return await this.metaLedger.getApprovals({
      round: this.round,
      status: 'open'
    })
  }

  async approvalToOrder(approval: ISignedApproval): Promise<IOrder> {
    const { approvalId, intent } = approval.params
    const timestamp = (await this.fetchApproval(approvalId)).timestamp
    return {
      id: approvalId,
      datetime: new Date(timestamp).toISOString(),
      timestamp,
      status: await this.approvalStatus(approval),
      symbol: symbolOf(this.assetRegistry, approval),
      type: 'limit', //only limit orders are supported at this time
      side: side(intent),
      price: orderPrice(approval),
      amount: orderAmount(approval),
      filled: await this.orderFilledAmount(approval),
      remaining: await this.orderRemainingAmount(approval),
      trades: [] // FIXME implement external trades
    }
  }

  async approvalStatus(approval: ISignedApproval): Promise<OrderStatus> {
    return (await this.isOpenApproval(approval)) ? 'open' : 'closed'
  }

  async orderFilledAmount(approval: ISignedApproval): Promise<BigNumber> {
    const remainingAmount = await this.orderRemainingAmount(approval)
    return orderAmount(approval).minus(remainingAmount)
  }

  async orderRemainingAmount(approval: ISignedApproval): Promise<BigNumber> {
    const balance = await this.remaining(approval.params)
    const intent = approval.params.intent

    const remaining = (side: 'buy' | 'sell') => balance[side].amount

    return isBuy(intent) ? remaining('buy') : remaining('sell')
  }

  async orderBook(
    market: IMarket,
    options: {
      level: MarketDepthLevel
    } = { level: 'L2' }
  ): Promise<IOrderBook> {
    const now = new Date()

    const toOrder = this.approvalToOrder.bind(this)
    const isMarketApproval = (approval: ISignedApproval) =>
      R.equals(marketOf(approval), market)

    const openApprovals = await this.openApprovals()

    const openOrders = await Promise.all(
      openApprovals.filter(isMarketApproval).map(toOrder)
    )

    const bidAsks = marketDepth(options.level, await openOrders, this.config)

    return {
      symbol: marketToSymbol(this.assetRegistry, market),
      level: options.level,
      bids: bidAsks.bids,
      asks: bidAsks.asks,
      timestamp: now.getTime(),
      datetime: now.toISOString()
    }
  }

  marketForSymbol(symbol: string): IMarket {
    if (!this.pairs.includes(symbol)) {
      throw new InvalidSymbolError(`No market for symbol '${symbol}'`)
    }

    return symbolToMarket(this.assetRegistry, symbol)
  }

  private async isOpenApproval(approval: ISignedApproval): Promise<boolean> {
    const approvalWithMetaData = (await this.metaLedger.getApprovalsWithMeta({
      approvalId: approval.params.approvalId
    }))[0]

    if (approvalWithMetaData === undefined) {
      throw Error(`Approval ${approval.params.approvalId} not found`)
    }

    const isExpired = approval.params.round !== this.round
    if (isExpired || approvalWithMetaData.status != 'open') {
      return false
    } else {
      return true
    }
  }

  private async addFill(params: IFillExchange): Promise<void> {
    const approval = (await this.metaLedger.getApprovals({
      approvalId: params.approvalId
    }))[0]

    const fill = {
      fillId: await this.metaLedger.getNextFillId(),
      approvalId: params.approvalId,
      round: params.round,
      buyAmount: params.buy.amount,
      buyAsset: approval.params.buy.asset,
      sellAmount: params.sell.amount,
      sellAsset: approval.params.sell.asset,
      clientAddress: approval.params.owner,
      instanceId: approval.params.instanceId
    }

    const descFill = JSON.stringify(fill)
    logger.info(`Storing fill with id=${fill.fillId}, ${descFill}`)

    const fillSig = await this.operator.signFill(fill)

    const signedFill: ISignedFill = {
      params: fill,
      signature: fillSig
    }

    await this.metaLedger.insertFill(signedFill)
  }

  private async registerTrades(trades: ITradeInternal[]): Promise<void> {
    const fillParams = R.unnest(R.map(createFillParams, trades))
    for (const params of fillParams) {
      await this.addFill(params)
    }
  }

  public getAssetsRegistry(): AssetRegistry {
    return this.assetRegistry
  }
}

export function remainsToFill(
  approval: {
    intent: Intent
    buy: { amount: Amount }
    sell: { amount: Amount }
  },
  fills: IAmounts[]
): IAmounts {
  const side = isBuy(approval.intent) ? 'buy' : 'sell'

  const filledAmount = sum(R.map(fill => fill[side].amount, fills))
  const remainingSideAmount = approval[side].amount.minus(filledAmount)
  // Note: division is not exact with BigNumber
  const filledFraction = filledAmount.div(approval[side].amount)
  const remaining = D('1').minus(filledFraction)

  return isBuy(approval.intent)
    ? {
        // Must be exact. This amount is used to calculate how much is left to fill.
        buy: { amount: remainingSideAmount },
        // Cannot be calculated exactly, but is not used for matching.
        sell: { amount: approval.sell.amount.times(remaining) }
      }
    : {
        // Cannot be calculated exactly, but is not used for matching.
        buy: { amount: approval.buy.amount.times(remaining) },
        // Must be exact. This amount is used to calculate how much is left to fill.
        sell: { amount: remainingSideAmount }
      }
}

export function isBidApproval(approval: ISignedApproval) {
  const { base, quote } = marketOf(approval)
  const params = approval.params
  return params.buy.asset === base && params.sell.asset === quote
}

export function isAskApproval(approval: ISignedApproval) {
  const { base, quote } = marketOf(approval)
  const params = approval.params
  return params.buy.asset === quote && params.sell.asset === base
}

/**
 * Calculate price of an approval
 *
 * Price is defined as:
 *
 *     price = quote_amount / base_amount
 *
 * If the approval is a bid, then it is buying base and selling quote. The price
 * for a bid is therefore:
 *
 *     price(bid) = sell_amount / buy_amount
 *
 * If the approval is an ask, then it is selling base and buying quote. The
 * price for an ask is therefore:
 *
 *     price(ask) = buy_amount / sell_amount
 *
 * @param approval
 */
export function orderPrice(approval: ISignedApproval): BigNumber {
  let price: BigNumber

  if (isBidApproval(approval)) {
    price = approval.params.sell.amount.div(approval.params.buy.amount)
  } else {
    price = approval.params.buy.amount.div(approval.params.sell.amount)
  }

  return price
}

export function fillPrice(
  makerApproval: ISignedApproval,
  trade: ITradeInternal
): BigNumber {
  let price: BigNumber

  // Left is the taker and right is the maker.
  const makerSell = trade.right.sell
  const makerBuy = trade.left.sell

  if (isBidApproval(makerApproval)) {
    price = makerSell.div(makerBuy)
  } else {
    price = makerBuy.div(makerSell)
  }

  return price
}

/**
 * Calculate the order amount of an approval
 *
 * @param approval
 */
export function orderAmount(approval: ISignedApproval): BigNumber {
  let amount

  if (isBidApproval(approval)) {
    amount = approval.params.buy.amount
  } else {
    amount = approval.params.sell.amount
  }

  return amount
}

/**
 * Look up the symbol for the asset pair traded in an approval
 *
 * The side (i.e. buy or sell) of the approval is used to determine which of the
 * asset is base, and which is quote. The quote and base addresses are then used
 * to look up the symbol for those assets in the asset registry.
 *
 * @param registry
 * @param approval
 */
export function symbolOf(
  registry: AssetRegistry,
  approval: ISignedApproval
): string {
  const { base, quote } = marketOf(approval)
  return `${registry.getSymbol(base)}/${registry.getSymbol(quote)}`
}

/**
 * Determine the base and quote asset pair in an approval
 *
 * The side (i.e. buy or sell) of the approval is used to determine which of the
 * asset is base, and which is quote.
 * @param approval
 */
export function marketOf(approval: ISignedApproval): IMarket {
  const intent = approval.params.intent
  const buy = approval.params.buy.asset
  const sell = approval.params.sell.asset

  const [base, quote] = isBuy(intent) ? [buy, sell] : [sell, buy]

  return { base, quote }
}

export function mkTradeExternal(
  symbol: string,
  trade: ITradeInternal,
  maker: ISignedApproval
): ITradeExternal {
  const { base } = marketOf(maker)
  const amount =
    maker.params.sell.asset === base ? trade.right.sell : trade.left.sell

  return {
    info: null,
    id: trade.tradeId,
    timestamp: trade.timestamp,
    datetime: new Date(trade.timestamp).toISOString(),
    symbol,
    order: maker.params.approvalId,
    type: 'limit',
    side: side(maker.params.intent),
    price: fillPrice(maker, trade),
    amount
  }
}

function operatorApprovalForFee(
  operator: Address,
  clientApproval: IApproval
): IApproval {
  const intent: Intent =
    clientApproval.intent === 'buyAll' ? 'sellAll' : 'buyAll'

  const params = {
    intent,
    buy: clientApproval.sell,
    sell: clientApproval.buy,
    owner: operator,
    round: clientApproval.round,
    instanceId: clientApproval.instanceId
  }

  const { buy, sell, round } = params

  const approvalId = ApprovalsFunctions.generateUniqueIdentifier(
    round,
    buy.asset,
    buy.amount,
    sell.asset,
    sell.amount,
    intent
  )
  return { ...params, approvalId }
}
