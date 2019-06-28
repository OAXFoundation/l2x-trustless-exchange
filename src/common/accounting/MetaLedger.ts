// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import knex from 'knex'
import { BigNumber } from 'bignumber.js'
import {
  AssetAddress,
  Round,
  Address,
  Amount,
  IBalances,
  IPartialProof,
  IAccount,
  FillId,
  ApprovalId,
  Omit
} from '../types/BasicTypes'

import {
  IBalanceDispute,
  ILedgerAccount,
  IWithdrawal,
  IWithdrawalRequest
} from '../types/OperatorAndClientTypes'
import {
  ApprovalWithMeta,
  IL2Order,
  ITradeInternal
} from '../types/ExchangeTypes'

import { loggers } from '../Logging'

import { ISignedFill } from '../types/Fills'
import { DisputeCollection } from '../persistence/DisputeCollection'
import { WithdrawalCollection } from '../persistence/WithdrawalCollection'
import { SolvencyTree } from './SolvencyTree'
import { Proof } from '../types/SmartContractTypes'
import { ISignedApproval } from '../types/Approvals'
import { ApprovalCollection } from '../persistence/ApprovalCollection'
import { LedgerAccountCollection } from '../persistence/LedgerAccountCollection'
import { FillCollection } from '../persistence/FillCollection'
import { TradeCollection } from '../persistence/TradeCollection'
import { WalletCollection } from '../persistence/WalletCollection'
import { D, sum } from '../BigNumberUtils'
import {
  AssetMismatchError,
  DoubleWithdrawalError,
  InsufficientBalanceError,
  ItemNotFoundError,
  OrderAlreadyClosedError,
  RoundMismatchError,
  UnbackedFillError
} from '../Errors'
import { RecoveryCollection } from '../persistence/RecoveryCollection'
import { Validation } from '../Validation'
import {
  DepositCollection,
  DepositRecord
} from '../persistence/DepositCollection'
import { BlockCollection } from '../persistence/BlockCollection'

const logger = loggers.get('backend')

export interface MetaLedgerConfig {
  mediatorAddress: Address
  operatorAddress: Address
  assets: AssetAddress[]
  persistence?: knex
}

export class MetaLedger {
  private readonly config: MetaLedgerConfig
  private readonly persistence: knex
  private readonly _assets = new Set<AssetAddress>()
  private readonly _balances = new Map<
    string,
    { round: Round; balance: Amount }
  >()

  private _isStarted: boolean = false

  constructor(config: MetaLedgerConfig) {
    this.config = config

    config.assets.forEach(asset => {
      if (this.isRegisteredAsset(asset)) {
        throw Error(`Duplicate asset ${asset}`)
      }

      this._assets.add(asset)
    })

    this.persistence =
      config.persistence !== undefined
        ? config.persistence
        : knex({
            client: 'sqlite3',
            connection: ':memory:',
            useNullAsDefault: true
          })
  }

  /**
   * Check if a client is registered
   * @param wallet: address of the client
   */
  async isClientRegistered(wallet: Address, trx?: knex): Promise<boolean> {
    const result = await this.wallets(trx).findOne({ wallet })
    return result !== null
  }

  get assets(): AssetAddress[] {
    return Array.from(this._assets)
  }

  async start(): Promise<void> {
    logger.info('Ledger starting...')

    if (this._isStarted) {
      logger.warn('Ledger failed to start: already started')
      return
    }

    await this.ensureDBInitialized()

    // Always register the operator
    await this.register(this.config.operatorAddress, 0)
  }

  async register(clientAddress: Address, round: Round): Promise<void> {
    logger.info(`Registering client ${clientAddress}.`)

    if (await this.isClientRegistered(clientAddress)) {
      logger.info(
        `Registration skipped: ${clientAddress} has already been registered.`
      )
      return
    }
    await this.wallets().save({
      wallet: clientAddress,
      lastFillRound: round,
      lastAuditRound: round,
      roundJoined: round
    })
  }

  async toJSON() {
    return JSON.parse(
      JSON.stringify({
        assets: this.config.assets,
        address: this.config.operatorAddress,
        mediatorAddress: this.config.mediatorAddress,
        disputes: await this.disputes().find((builder: knex.QueryBuilder) =>
          builder.orderBy('id')
        ),
        withdrawals: await this.withdrawals().find(
          (builder: knex.QueryBuilder) => builder.orderBy('id')
        ),
        accounts: await this.ledgerAccounts().find(
          (builder: knex.QueryBuilder) =>
            builder.orderBy(['round, asset, wallet'])
        ),
        approvals: await this.approvals().find((builder: knex.QueryBuilder) =>
          builder.orderBy('approvalId')
        ),
        fills: await this.fills().find((builder: knex.QueryBuilder) =>
          builder.orderBy('fillId')
        ),
        wallets: await this.wallets().find((builder: knex.QueryBuilder) =>
          builder.orderBy('id')
        )
      })
    )
  }

  async creditDeposit(
    asset: AssetAddress,
    wallet: Address,
    amount: Amount,
    round: Round
  ): Promise<void> {
    if (!(await this.isClientRegistered(wallet))) {
      throw Error(`${wallet} not in network.`)
    }

    if (amount.lte(0)) {
      throw RangeError(`Deposit cannot be negative or zero. Given ${amount}`)
    }

    if (round < 0) {
      throw RangeError(`Round cannot be negative. Given ${round}`)
    }

    await this.persistence.transaction(async trx => {
      const account = await this.findOrCreateAccount(asset, wallet, round, trx)
      account.deposited = account.deposited.plus(amount)
      await this.ledgerAccounts(trx).update(account)

      this.updateCachedBalance(asset, wallet, round, amount)
    })
  }

  async saveDepositRecord(record: DepositRecord) {
    await this.deposits().save(record)
  }

  async getDepositRecordByIdAsync(
    txHash: string
  ): Promise<DepositRecord | null> {
    return this.deposits().findOne({ txHash })
  }

  async totalDeposits(round: Round, asset: AssetAddress): Promise<Amount> {
    const accounts = await this.ledgerAccounts().find({ round, asset })
    return sum(accounts.map(a => a.deposited))
  }

  async openingBalance(
    asset: AssetAddress,
    wallet: Address,
    round: Round,
    trx?: knex
  ): Promise<Amount> {
    if (round < 0) {
      throw Error(`round cannot be less than zero. Given: ${round}`)
    }

    let openingBalance: Amount

    if (round === 0) {
      openingBalance = D('0')
    } else {
      const accounts = await this.ledgerAccounts(trx).find(
        (builder: knex.QueryBuilder) => {
          return builder.where({ asset, wallet }).andWhere('round', '<', round)
        }
      )

      let balance = D('0')

      // add balances from previous rounds
      for (const account of accounts) {
        balance = balance
          .plus(account.deposited)
          .plus(account.bought)
          .minus(account.withdrawn)
          .minus(account.sold)
      }

      openingBalance = balance
    }

    return openingBalance
  }

  async balance(
    asset: AssetAddress,
    wallet: Address,
    round: Round,
    trx?: knex
  ): Promise<Amount> {
    // Use the balance cache first to avoid iterating through all previous rounds
    const key = asset + wallet
    const cachedBalance = this._balances.get(key)
    if (cachedBalance != null && cachedBalance.round === round) {
      return cachedBalance.balance
    }

    const balance = await this.calculateBalance(asset, wallet, round, trx)

    this._balances.set(key, { balance, round })

    return balance
  }

  private async calculateBalance(
    asset: AssetAddress,
    wallet: Address,
    round: Round,
    trx?: knex
  ): Promise<Amount> {
    const accounts = await this.ledgerAccounts(trx).find(
      (builder: knex.QueryBuilder) => {
        return builder.where({ asset, wallet }).andWhere('round', '<=', round)
      }
    )

    let balance = D('0')

    // compute current balance
    for (const account of accounts) {
      balance = balance
        .plus(account.deposited)
        .plus(account.bought)
        .minus(account.withdrawn)
        .minus(account.sold)

      // lock balance for current round
      if (account.round === round) {
        balance = balance.minus(account.locked)
      }
    }

    return balance
  }

  async locked(
    asset: AssetAddress,
    wallet: Address,
    round: Round
  ): Promise<Amount> {
    const account = await this.ledgerAccounts().findOne({
      asset,
      wallet,
      round
    })

    return account === undefined ? D('0') : account.locked
  }

  async balances(address: Address, round: Round): Promise<IBalances> {
    const balances: { [s: string]: Amount } = {}

    for (const asset of this._assets) {
      balances[asset] = await this.balance(asset, address, round) // hooked by tests
    }

    return balances
  }

  ///////////////////////////////////////
  //            Approvals Functions
  ///////////////////////////////////////

  async insertOrder(order: IL2Order): Promise<void> {
    const { orderApproval, feeApproval } = order
    await this.persistence.transaction(async trx => {
      await this.validateOrder(order, trx)

      await this.doInsertApproval(orderApproval, trx)
      await this.doInsertApproval(feeApproval, trx)
    })
  }

  async validateOrder(order: IL2Order, trx?: knex): Promise<void> {
    const { orderApproval, feeApproval } = order

    Validation.validateSignedApproval(orderApproval)
    Validation.validateSignedFee(feeApproval)

    await this.validateApprovalBacking(orderApproval, trx)
    await this.validateApprovalBacking(feeApproval, trx)
  }

  async insertApproval(approval: ISignedApproval) {
    await this.validateApprovalBacking(approval)

    const approvalId = approval.params.approvalId
    const approvalsWithSameId = await this.getApprovals({ approvalId })

    if (approvalsWithSameId.length > 0) {
      throw Error('Id for approval is already used.')
    }

    await this.persistence.transaction(async trx => {
      await this.doInsertApproval(approval, trx)
    })
  }

  private async doInsertApproval(approval: ISignedApproval, trx?: knex) {
    const { round, owner, sell } = approval.params

    const wallet = owner
    const asset = sell.asset

    const account = await this.findOrCreateAccount(asset, wallet, round, trx)
    account.locked = account.locked.plus(approval.params.sell.amount)

    await this.ledgerAccounts(trx).update(account)

    this.updateCachedBalance(
      asset,
      wallet,
      round,
      approval.params.sell.amount.negated()
    )

    return this.approvals(trx).save(approval)
  }

  private updateCachedBalance(
    asset: Address,
    wallet: Address,
    round: Round,
    delta: Amount
  ) {
    const key = asset + wallet
    const cachedBalance = this._balances.get(key)
    if (cachedBalance != null && cachedBalance.round === round) {
      this._balances.set(key, {
        round,
        balance: cachedBalance.balance.plus(delta)
      })
    }
  }

  async validateApprovalBacking(
    approval: ISignedApproval,
    trx?: knex
  ): Promise<void> {
    const { sell, buy, owner, round } = approval.params
    const wallet = owner

    if (!this.isRegisteredAsset(sell.asset)) {
      throw Error(`This ledger cannot handle asset ${sell.asset}`)
    }

    if (!this.isRegisteredAsset(buy.asset)) {
      throw Error(`This ledger cannot handle asset ${buy.asset}`)
    }

    if (!(await this.isClientRegistered(wallet, trx))) {
      throw Error(`${wallet} not in network`)
    }

    const availableBalance = await this.balance(sell.asset, wallet, round, trx)

    if (availableBalance.lt(approval.params.sell.amount)) {
      throw new InsufficientBalanceError(
        `Insufficient balance for adding approval. ` +
          `Asset: ${approval.params.sell.asset} ` +
          `Available: ${availableBalance} ` +
          `Requested: ${approval.params.sell.amount}`
      )
    }
  }

  async cancelApproval(approvalId: ApprovalId): Promise<void> {
    logger.debug(`Canceling approval ${approvalId}`)

    await this.persistence.transaction(async trx => {
      const meta = (await this.approvals(trx).findWithMeta({
        approvalId
      }))[0]

      if (meta === undefined) {
        throw new ItemNotFoundError(
          `Cannot cancel order: Order with ID ${approvalId} not found.`
        )
      }

      const { approval, status } = meta

      if (status !== 'open') {
        throw new OrderAlreadyClosedError(
          `Cannot cancel order: Order with ID ${approvalId} already closed.`
        )
      }

      const { round, sell, owner } = approval.params
      await this.approvals(trx).cancel(approvalId)

      const remaining = sell.amount.minus(meta.filledSell)

      const sellAccount = await this.ledgerAccounts(trx).findOne({
        round: round,
        asset: sell.asset,
        wallet: owner
      })

      if (sellAccount === undefined) {
        throw Error(`Sell account not available`)
      }

      sellAccount.locked = sellAccount.locked.minus(remaining)
      this.updateCachedBalance(sell.asset, owner, round, remaining) // no coverage!!!

      await this.ledgerAccounts(trx).update(sellAccount)
    })
    logger.debug(`Canceled approval ${approvalId}`)
  }

  async getApprovals(whereClause: any, trx?: knex): Promise<ISignedApproval[]> {
    return this.approvals(trx).find(whereClause)
  }

  async getApprovalsWithMeta(whereClause: any): Promise<ApprovalWithMeta[]> {
    return this.approvals().findWithMeta(whereClause)
  }

  async updateApprovalStatus(
    approvalId: ApprovalId,
    buyAmount: Amount,
    sellAmount: Amount,
    trx: knex
  ): Promise<void> {
    const meta = (await this.approvals(trx).findWithMeta({ approvalId }))[0]
    // This is also checked in validateFill
    if (meta == undefined) {
      throw Error(`Approval ${approvalId} not found`)
    }
    const filledBuy = meta.filledBuy.plus(buyAmount)
    const filledSell = meta.filledSell.plus(sellAmount)

    if (meta.status != 'open') {
      throw Error(`Approval ${approvalId} is not open`)
    }

    const { buy, sell, intent } = meta.approval.params

    const isFilled =
      intent == 'buyAll'
        ? filledBuy.gte(buy.amount)
        : filledSell.gte(sell.amount)
    const status = isFilled ? 'closed' : 'open'

    await this.approvals(trx).updateStatus(
      approvalId,
      filledBuy,
      filledSell,
      status
    )
  }

  ///////////////////////////////////////
  //            Fills functions
  ///////////////////////////////////////
  async insertFill(fill: ISignedFill) {
    const { params } = fill
    const { round, clientAddress } = params
    const { approvalId, sellAsset, sellAmount, buyAsset, buyAmount } = params
    await this.persistence.transaction(async trx => {
      await this.validateFill(fill, trx)

      let sellAccount = await this.ledgerAccounts(trx).findOne({
        round: round,
        asset: sellAsset,
        wallet: clientAddress
      })

      if (sellAccount === undefined) {
        throw Error(`Sell account not available`)
      }

      if (sellAccount.locked.minus(sellAmount).lt(0)) {
        throw Error('Fill sell amount exceeds approved amount.')
      }

      sellAccount.sold = sellAccount.sold.plus(sellAmount)
      sellAccount.locked = sellAccount.locked.minus(sellAmount)

      await this.ledgerAccounts(trx).update(sellAccount)

      const buyAccount = await this.findOrCreateAccount(
        buyAsset,
        clientAddress,
        round,
        trx
      )
      buyAccount.bought = buyAccount.bought.plus(buyAmount)
      await this.ledgerAccounts(trx).update(buyAccount)

      await this.updateApprovalStatus(approvalId, buyAmount, sellAmount, trx)
      await this.fills(trx).save(fill)

      // Do this last to ensure the database was updated correctly
      this.updateCachedBalance(buyAsset, clientAddress, round, buyAmount)
    })
  }

  async getNextFillId(): Promise<FillId> {
    const count = await this.fills().count()
    return new BigNumber(count).plus(1).toString(10)
  }

  async getFills(where: any): Promise<ISignedFill[]> {
    return this.fills().find(where)
  }

  async validateFill(fill: ISignedFill, trx?: knex): Promise<void> {
    const {
      params: { fillId, approvalId }
    } = fill

    const existingFill = await this.fills(trx).find({ fillId })

    if (existingFill.length > 0) {
      throw Error(
        `Failed to insert fill: Fill with ID ${fillId} already exists`
      )
    }

    const backingApproval = (await this.getApprovals({ approvalId }, trx))[0]

    if (backingApproval === undefined) {
      throw new UnbackedFillError(
        `Fill is not backed by an existing approval. Fill: ${JSON.stringify(
          fill
        )}`
      )
    }

    if (backingApproval.params.sell.asset !== fill.params.sellAsset) {
      throw new AssetMismatchError(
        `Mismatch between fill sell asset and approval sell asset. ` +
          `Fill ID: ${fill.params.fillId} ` +
          `Fill Sell Asset: ${fill.params.sellAsset} ` +
          `Approval ID: ${backingApproval.params.approvalId} ` +
          `Approval Sell Asset: ${backingApproval.params.sell.asset}`
      )
    }

    if (backingApproval.params.buy.asset !== fill.params.buyAsset) {
      throw new AssetMismatchError(
        `Mismatch between fill buy asset and approval buy asset. ` +
          `Fill ID: ${fill.params.fillId} ` +
          `Fill Buy Asset: ${fill.params.buyAsset} ` +
          `Approval ID: ${backingApproval.params.approvalId} ` +
          `Approval Buy Asset: ${backingApproval.params.buy.asset}`
      )
    }

    if (backingApproval.params.round !== fill.params.round) {
      throw new RoundMismatchError(
        `Mismatch between fill round and approval round. ` +
          `Fill ID: ${fill.params.fillId} ` +
          `Fill round: ${fill.params.round} ` +
          `Approval ID: ${backingApproval.params.approvalId} ` +
          `Approval round: ${backingApproval.params.round}`
      )
    }

    if (backingApproval.params.instanceId !== fill.params.instanceId) {
      throw new Error(
        `Instance ID mismatch between fill and approval. ` +
          `Fill ID: ${fill.params.fillId} ` +
          `Fill instance ID: ${fill.params.instanceId} ` +
          `Approval ID: ${backingApproval.params.approvalId} ` +
          `Approval instance ID: ${backingApproval.params.instanceId}`
      )
    }

    if (backingApproval.params.owner !== fill.params.clientAddress) {
      throw new Error(
        `Wallet mismatch between fill and approval. ` +
          `Fill ID: ${fill.params.fillId} ` +
          `Fill wallet: ${fill.params.fillId} ` +
          `Approval ID: ${backingApproval.params.approvalId} ` +
          `Approval wallet: ${backingApproval.params.owner}`
      )
    }
  }

  ///////////////////////////////////////
  //            Trades functions
  ///////////////////////////////////////
  async getTrades(): Promise<ITradeInternal[]> {
    return this.trades().find()
  }

  async insertTrades(trades: ITradeInternal[]): Promise<void> {
    await this.persistence.transaction(async trx => {
      for (const trade of trades) {
        await this.trades(trx).save(trade)
      }
    })
  }

  ///////////////////////////////////////
  //         Dispute requests          //
  ///////////////////////////////////////

  async hasOpenDisputeAsync(
    dispute: Partial<IBalanceDispute>
  ): Promise<boolean> {
    const found = await this.disputes().findOne({
      ...dispute,
      status: 'open'
    })
    return found !== undefined
  }

  async insertDisputeAsync(dispute: IBalanceDispute): Promise<void> {
    await this.disputes().save(dispute)
  }

  async getOpenDisputesAsync(): Promise<IBalanceDispute[]> {
    return await this.disputes().find({
      status: 'open'
    })
  }

  async getDisputeByIdAsync(id: string): Promise<IBalanceDispute | null> {
    return await this.disputes().findOne({ id })
  }

  async updateDisputeAsync(dispute: IBalanceDispute): Promise<void> {
    await this.disputes().update(dispute)
  }

  ///////////////////////////////////////
  //         Proof                     //
  ///////////////////////////////////////

  async getSolvencyTree(
    asset: AssetAddress,
    round: Round
  ): Promise<SolvencyTree> {
    const wallets = await this.wallets().find((builder: knex.QueryBuilder) => {
      return builder.where('roundJoined', '<', round).orderBy('id')
    })

    const accounts: IAccount[] = []

    for (const wallet of wallets) {
      accounts.push({
        address: wallet.wallet,
        sum: await this.openingBalance(asset, wallet.wallet, round),
        round
      })
    }

    return new SolvencyTree(accounts)
  }

  async completeProof(
    asset: AssetAddress,
    wallet: Address,
    round: Round
  ): Promise<Proof> {
    const partialProof: IPartialProof = await this.getPartialProof(
      asset,
      wallet,
      round
    )

    const account: IAccount = {
      address: wallet,
      sum: await this.openingBalance(asset, wallet, round),
      round
    }

    return Proof.fromProofOfLiability(partialProof, account, asset)
  }

  async getPartialProof(
    asset: AssetAddress,
    wallet: Address,
    round: Round
  ): Promise<IPartialProof> {
    const tree = await this.getSolvencyTree(asset, round)

    const account: IAccount = {
      address: wallet,
      sum: await this.openingBalance(asset, wallet, round),
      round: round
    }

    const res: IPartialProof = {
      liabilities: tree.getLiabilities(account),
      height: tree.getHeight(),
      width: tree.getWidth(),
      round: round
    }

    return res
  }

  ///////////////////////////////////////
  //         Withdrawal                //
  ///////////////////////////////////////

  async insertWithdrawalAsync(
    withdrawal: Omit<IWithdrawal, 'id'>
  ): Promise<void> {
    await this.withdrawals().save(withdrawal)
  }

  async getWithdrawalAsync(
    status: IWithdrawal['status']
  ): Promise<IWithdrawal[]> {
    return this.withdrawals().find({
      status: status
    })
  }

  async getWithdrawalByIdAsync(txHash: string): Promise<IWithdrawal | null> {
    return this.withdrawals().findOne({ txHash })
  }

  async cancelWithdrawalAsync(
    asset: AssetAddress,
    wallet: Address
  ): Promise<void> {
    await this.persistence.transaction(async trx => {
      const withdrawal = await this.withdrawals(trx).findOne(
        (builder: knex.QueryBuilder) =>
          builder
            .where({
              asset,
              wallet
            })
            .whereIn('status', ['pending', 'unchecked'])
      )

      if (withdrawal === null) {
        throw Error('There is no withdrawal to cancel')
      }

      if (withdrawal.status === 'pending') {
        const account = await this.findOrCreateAccount(
          asset,
          wallet,
          withdrawal.round,
          trx
        )

        account.withdrawn = account.withdrawn.minus(withdrawal.amount)
        await this.ledgerAccounts(trx).update(account)

        this.updateCachedBalance(
          asset,
          wallet,
          withdrawal.round,
          withdrawal.amount
        )
      }

      withdrawal.status = 'canceled'

      await this.withdrawals(trx).update(withdrawal)
    })
  }

  async confirmWithdrawalAsync(
    asset: AssetAddress,
    wallet: Address
  ): Promise<void> {
    await this.updateWithdrawalAsync(asset, wallet, 'pending', 'confirmed')
  }

  async withdraw(
    withdrawal: Omit<IWithdrawal, 'id' | 'status'>
  ): Promise<void> {
    await this.validateWithdrawal(withdrawal)

    const { asset, wallet, amount, round, txHash } = withdrawal

    await this.persistence.transaction(async trx => {
      await this.withdrawals(trx).save({
        txHash,
        asset,
        wallet,
        amount,
        round,
        status: 'pending'
      })

      const account = await this.findOrCreateAccount(asset, wallet, round, trx)
      account.withdrawn = account.withdrawn.plus(amount)
      await this.ledgerAccounts(trx).update(account)

      this.updateCachedBalance(asset, wallet, round, amount.negated())
    })
  }

  async approveWithdrawal(withdrawal: IWithdrawal): Promise<void> {
    await this.validateWithdrawal(withdrawal)

    const { asset, wallet, amount, round } = withdrawal

    await this.persistence.transaction(async trx => {
      const uncheckedWithdrawal = await this.withdrawals(trx).findOne({
        id: withdrawal.id
      })

      if (uncheckedWithdrawal === null) {
        throw Error('Withdrawal request is unavailable')
      }

      uncheckedWithdrawal.status = 'pending'
      await this.withdrawals(trx).update(uncheckedWithdrawal)

      const account = await this.findOrCreateAccount(asset, wallet, round, trx)
      account.withdrawn = account.withdrawn.plus(amount)
      await this.ledgerAccounts(trx).update(account)

      this.updateCachedBalance(asset, wallet, round, amount.negated())
    })
  }

  async isWithdrawalValid(request: IWithdrawalRequest): Promise<boolean> {
    let isValid = true

    try {
      await this.validateWithdrawal(request)
    } catch (err) {
      isValid = false
    }

    return isValid
  }

  private async updateWithdrawalAsync(
    asset: AssetAddress,
    wallet: Address,
    oldStatus: IWithdrawal['status'],
    newStatus: IWithdrawal['status']
  ) {
    await this.persistence.transaction(async trx => {
      const existingWithdrawal = await this.withdrawals(trx).findOne({
        asset,
        wallet,
        status: oldStatus
      })

      if (existingWithdrawal === null) {
        throw Error(`No ${oldStatus} withdrawal`)
      }

      existingWithdrawal.status = newStatus

      await this.withdrawals(trx).update(existingWithdrawal)
    })
  }

  async validateWithdrawal(request: IWithdrawalRequest): Promise<void> {
    const { asset, wallet, amount, round } = request
    if (amount.lte(0)) {
      throw RangeError(`Withdrawal amount must be > 0. Given ${amount}`)
    }

    const availableBalance = await this.balance(asset, wallet, round)

    if (availableBalance.lt(amount)) {
      throw new InsufficientBalanceError(
        `Insufficient balance for withdrawal. ` +
          `Asset: ${asset} Available: ${availableBalance} Requested: ${amount}`
      )
    }

    if (round <= 0) {
      throw Error(`Withdrawal round must be > 0. Given ${round}`)
    }

    const pendingWithdrawal = await this.withdrawals().findOne({
      asset,
      wallet,
      status: 'pending'
    })

    if (pendingWithdrawal !== null) {
      throw new DoubleWithdrawalError(
        `An existing withdrawal already exists from round ${
          pendingWithdrawal.round
        }`
      )
    }
  }

  ///////////////////////////////////////
  //         Round Management          //
  ///////////////////////////////////////
  async getLastProcessedBlock(): Promise<number> {
    return this.lastProcessedBlock().get()
  }

  async saveLastProcessedBlock(blockNumber: number) {
    await this.lastProcessedBlock().save(blockNumber)
  }

  ///////////////////////////////////////
  //         Asset Management          //
  ///////////////////////////////////////

  private isRegisteredAsset(asset: AssetAddress): boolean {
    return this._assets.has(asset)
  }

  ///////////////////////////////////////
  //             Recovery              //
  ///////////////////////////////////////

  async isRecovered(asset: AssetAddress, wallet: Address): Promise<boolean> {
    const recovered = await this.recoveries().findOne({ asset, wallet })
    return recovered !== null
  }

  async setRecovered(asset: AssetAddress, wallet: Address): Promise<void> {
    const recovered = await this.recoveries().findOne({ asset, wallet })

    if (recovered !== null) {
      throw Error(`Already recovered asset ${asset} for ${wallet}`)
    }

    await this.recoveries().save({ asset, wallet, recovered: true })
  }

  ///////////////////////////////////////
  //         Data Access               //
  ///////////////////////////////////////

  private async ensureDBInitialized(): Promise<void> {
    await BlockCollection.init(this.persistence)
    await DisputeCollection.init(this.persistence)
    await WithdrawalCollection.init(this.persistence)
    await LedgerAccountCollection.init(this.persistence)
    await ApprovalCollection.init(this.persistence)
    await FillCollection.init(this.persistence)
    await TradeCollection.init(this.persistence)
    await WalletCollection.init(this.persistence)
    await RecoveryCollection.init(this.persistence)
    await DepositCollection.init(this.persistence)
  }

  private ledgerAccounts(conn?: knex) {
    return LedgerAccountCollection.with(conn || this.persistence)
  }

  private approvals(conn?: knex) {
    return ApprovalCollection.with(conn || this.persistence)
  }

  private fills(conn?: knex) {
    return FillCollection.with(conn || this.persistence)
  }

  private trades(conn?: knex) {
    return TradeCollection.with(conn || this.persistence)
  }

  private withdrawals(conn?: knex) {
    return WithdrawalCollection.with(conn || this.persistence)
  }

  private disputes(conn?: knex) {
    return DisputeCollection.with(conn || this.persistence)
  }

  private wallets(conn?: knex) {
    return WalletCollection.with(conn || this.persistence)
  }

  private recoveries(conn?: knex) {
    return RecoveryCollection.with(conn || this.persistence)
  }

  private deposits(conn?: knex) {
    return DepositCollection.with(conn || this.persistence)
  }

  private lastProcessedBlock(conn?: knex) {
    return BlockCollection.with(conn || this.persistence)
  }

  private async findOrCreateAccount(
    asset: Address,
    wallet: Address,
    round: Round,
    conn?: knex
  ): Promise<ILedgerAccount> {
    let account = await this.ledgerAccounts(conn).findOne({
      asset,
      wallet,
      round
    })

    if (account === undefined) {
      account = {
        round,
        asset,
        wallet,
        deposited: D('0'),
        withdrawn: D('0'),
        bought: D('0'),
        sold: D('0'),
        locked: D('0')
      }

      await this.ledgerAccounts(conn).save(account)
    }

    return account
  }
}
