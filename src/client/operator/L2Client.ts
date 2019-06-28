// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import knex from 'knex'
import R from 'ramda'

import { TransactionReceipt } from 'ethers/providers'
import EventEmitter from 'eventemitter3'

import { D } from '@oax/common/BigNumberUtils'

import {
  Quarter,
  SignatureSol,
  AuditResult
} from '@oax/common/types/BasicTypes'

import { IApproval, ISignedApproval } from '@oax/common/types/Approvals'

import { IMediatorAsync } from '@oax/common/mediator/IMediatorAsync'
import { Identity, verifySig } from '@oax/common/identity/Identity'
import { HTTPClient } from '../common/HTTPClient'
import {
  IAuthorizationMessage,
  Proof
} from '@oax/common/types/SmartContractTypes'
import { MediatorAsync } from '@oax/common/mediator/Contracts'
import {
  convertSigToSigSol,
  waitForMining,
  getContract
} from '@oax/common/ContractUtils'
import { loggers } from '@oax/common/Logging'
import { BigNumber } from 'bignumber.js'
import { utils as EthersUtils } from 'ethers'
import {
  AuthorizationMessageValidationError,
  NoActiveWithdrawalError,
  PrematureWithdrawalError,
  SignatureError
} from '@oax/common/Errors'
import { ProofSerDe } from '@oax/common/types/SerDe'
import { FillMediator, ISignedFill } from '@oax/common/types/Fills'
import { WalletCollection } from '@oax/common/persistence/WalletCollection'
import {
  IWalletRegistryEntry,
  IWithdrawalRequest
} from '@oax/common/types/OperatorAndClientTypes'
import { ApprovalsFunctions } from '@oax/common/types/Approvals'
import makeSignedApproval = ApprovalsFunctions.makeSignedApproval
import { PrivateKeyIdentity } from '@oax/common/identity/PrivateKeyIdentity'
import { ProofCollection } from '@oax/common/persistence/ProofCollection'
import { vfAuthorization } from '@oax/common/AuthorizationMessage'
import { ERC20 } from '@oax/contracts/wrappers/ERC20'
import { Mediator } from '@oax/contracts/wrappers/Mediator'
import { MetaLedger } from '@oax/common/accounting/MetaLedger'
import { IL2Order } from '@oax/common/types/ExchangeTypes'
import { AuditError } from '@oax/common/Errors'

const logger = loggers.get('frontend')

const FETCH_FILL_QUARTER = 0
const AUDIT_QUARTER = 1

interface L2ClientOptions {
  operatorAddress: string
  mediator: IMediatorAsync | string
  persistence?: knex
}

export class L2Client {
  public readonly address: string
  public readonly identity: Identity
  public ledger: MetaLedger
  public assets: string[]
  public readonly transport: HTTPClient
  public readonly persistence: knex

  private readonly operatorAddress: string
  readonly mediator: IMediatorAsync
  private readonly eventEmitter: EventEmitter

  private _isConnected: boolean = false
  private _roundJoined: number = -1
  private _round: number
  private _quarter: Quarter
  private _roundSize: BigNumber | undefined
  private _authorization: IAuthorizationMessage | undefined
  private _blockNumberAtCreation: number | undefined

  /**
   * Constructor
   *
   * @param identity A JsonRPCIdentity or PrivateKeyIdentity object for the user's wallet.
   * @param transport Used for communicating with the server.
   * @param options Various configuration options including the operatorAddress, etc.
   **/
  constructor(
    identity: Identity,
    transport: HTTPClient | string,
    options: L2ClientOptions
  ) {
    this.assets = []
    this.operatorAddress = options.operatorAddress
    this.identity = identity
    this.address = identity.address
    if (typeof transport == 'string') {
      this.transport = new HTTPClient(new URL(transport))
    } else {
      this.transport = transport as HTTPClient
    }
    if (typeof options.mediator === 'string') {
      const mediatorAddress = EthersUtils.getAddress(options.mediator)

      const mediator = getContract(
        mediatorAddress,
        'Mediator',
        identity
      ) as Mediator
      this.mediator = new MediatorAsync(identity, mediator)
    } else {
      this.mediator = options.mediator as IMediatorAsync
    }
    this._round = 0
    this._quarter = 0

    this.eventEmitter = new EventEmitter()

    this.persistence =
      options.persistence !== undefined
        ? options.persistence
        : knex({
            client: 'sqlite3',
            connection: ':memory:',
            useNullAsDefault: true
          })

    this.ledger = new MetaLedger({
      operatorAddress: this.operatorAddress,
      mediatorAddress: this.mediator.contractAddress,
      assets: this.assets,
      persistence: this.persistence
    })
  }

  /**
   * Initialize the client
   **/
  async init(): Promise<void> {
    await ProofCollection.init(this.persistence)

    this.assets = await this.getRegisteredAssets()

    this.ledger = new MetaLedger({
      operatorAddress: this.operatorAddress,
      mediatorAddress: this.mediator.contractAddress,
      assets: this.assets,
      persistence: this.persistence
    })

    await this.ledger.start()
  }

  /**
   * Returns the current round
   **/
  get round() {
    return this._round
  }

  /**
   * Returns the current quarter
   **/
  get quarter() {
    return this._quarter
  }

  /**
   * Returns the authorization message signed by the operator when joining
   **/
  get authorization(): IAuthorizationMessage {
    if (this._authorization === undefined) {
      throw Error('Authorization message unavailable.')
    }

    return this._authorization
  }

  /**
   * Checks if the client has been authorized to join the exchange
   * Assumes the join() function took care of verifying the authorization
   * token
   */
  hasAuthorization(): boolean {
    return this._authorization !== undefined
  }

  /**
   * Joins the layer 2 network
   *
   * @throws {SignatureError}
   */
  async join(): Promise<void> {
    if (this.isConnected) {
      return
    }
    const mediatorAddress = EthersUtils.getAddress(
      await this.transport.mediator()
    )

    if (mediatorAddress !== this.mediator.contractAddress) {
      throw Error(`Operator using Mediator contract at ${mediatorAddress}`)
    }

    if (await this.isHalted()) {
      throw Error('Unable to join: the mediator is halted.')
    }

    await this.syncTime()

    const existingAccount = await this.getAccount()
    if (existingAccount) {
      this._authorization = existingAccount.authorization
      this._roundJoined = existingAccount.roundJoined
    } else {
      this._authorization = await this.getAuthorization()
      this._roundJoined = this.round

      await this.saveAccount()
    }

    if (this._roundSize === undefined) {
      this._roundSize = await this.mediator.roundSize()
    }

    this.registerEventListeners()

    await this.ledger.register(this.address, this.round)

    this._isConnected = true

    await this.syncStateWithExchange()
  }

  /**
   * Gracefull cleanup
   **/
  async leave(): Promise<void> {
    this._isConnected = false

    const contract = this.mediator.getContractWrapper()
    contract.provider.removeAllListeners('block')
    contract.removeAllListeners('Halted')
  }

  /**
   * Computes locally the round number from a block number
   * @param blockNumber number of the block from which we want to deduce the round
   */
  async getRoundFromBlockNumber(blockNumber: number) {
    if (this._blockNumberAtCreation === undefined) {
      this._blockNumberAtCreation = await this.mediator.getBlockNumberAtCreation()
    }

    const round = Math.floor(
      (blockNumber - this._blockNumberAtCreation!) / this.roundSize!.toNumber()
    )

    return round
  }

  /**
   * Deposit asset from client wallet to the mediator
   *
   * @param asset Address of the asset to deposit
   * @param amount Amount of asset to deposit (in wei)
   * @param approve Whether to call ERC20.approve before doing the token transfer
   **/
  async deposit(asset: string, amount: BigNumber, approve: boolean) {
    if (await this.isHalted()) {
      throw Error('Unable to deposit: the mediator is halted.')
    }

    if (!this.hasAuthorization()) {
      throw Error('Unable to deposit: the client is unauthorized')
    }

    logger.info('Depositing...')

    // By default, approval must have been given prior to calling deposit
    if (approve) {
      const tokenContract = getContract(asset, 'ERC20', this.identity) as ERC20
      const amountString = amount.toString(10)
      const currentAllowance = await tokenContract.functions.allowance(
        this.identity.address,
        this.mediator.contractAddress
      )
      if (currentAllowance.lt(amountString)) {
        const txPromise = tokenContract.functions.approve(
          this.mediator.contractAddress,
          amountString
        )
        await waitForMining(txPromise)
      }
    }

    const txReceipt: TransactionReceipt = await this.mediator.depositsToken(
      asset,
      amount
    )

    const blockNumber = txReceipt.blockNumber

    //Computes the round from the block number
    const roundOfDepositTransaction = await this.getRoundFromBlockNumber(
      blockNumber!
    )

    logger.info(
      `Deposit was made during block ${blockNumber}, and thus round ${roundOfDepositTransaction}`
    )

    await this.ledger.creditDeposit(
      asset,
      this.address,
      amount,
      roundOfDepositTransaction
    )
  }

  /**
   * Checks if a given round has a fill
   *
   * @param round Round number
   * @param fill Fill object to check for
   **/
  async hasFill(round: number, fill: ISignedFill): Promise<boolean> {
    const fills = await this.ledger.getFills({
      round: round,
      fillId: fill.params.fillId
    })

    return fills.length !== 0
  }

  /**
   * Checks if the mediator is in HALTED mode
   **/
  async isHalted(): Promise<boolean> {
    return this.mediator.isHalted()
  }

  /**
   * Retrieves all fills for a given round
   *
   * @param round Round number
   **/
  async fetchFills(round: number): Promise<void> {
    logger.info('Fetching fills from server...')

    const signedFills = await this.transport.fetchFills(this.address, round)

    logger.info(`${signedFills.length} fills received...`)
    logger.info(signedFills.toString())

    for (const signedFill of signedFills) {
      try {
        await this.onReceiveFillAsync(signedFill)
      } catch (err) {
        logger.info('Failed to insert fill')
        logger.info(err.stack)
      }
    }

    await this.updateLastAuditOrFillRound('lastFillRound')

    this.eventEmitter.emit('fetchFillsCompleted', signedFills)
  }

  /**
   * Initiates a new withdrawal for a given asset
   *
   * @param asset Address of the asset to withdraw
   * @param amount Amount to withdraw (in wei)
   **/
  async withdraw(
    asset: string,
    amount: BigNumber
  ): Promise<TransactionReceipt> {
    const round = this.round
    const previousRound = round - 1

    if (await this.isHalted()) {
      throw Error(`Unable to initiate withdrawal when the Mediator is halted.`)
    }

    const request: IWithdrawalRequest = {
      asset,
      wallet: this.address,
      amount,
      round
    }

    await this.ledger.validateWithdrawal(request)

    const proofs = await ProofCollection.with(this.persistence).find({
      asset: asset,
      round: previousRound
    })

    const proof = proofs[0]

    if (proof === undefined) {
      throw Error(
        `Unable to withdraw without proof from round ${previousRound}`
      )
    }

    logger.info(`Withdrawing ${amount} of ${asset} at round ${round}`)

    try {
      const receipt = await this.mediator.initiateWithdrawal(proof, amount)
      await this.ledger.withdraw({
        ...request,
        txHash: receipt.transactionHash!
      })

      return receipt
    } catch (err) {
      logger.error(`Failed to initiate withdrawal: ${err.message}`)
      throw err
    }
  }

  /**
   * Checks that the operator / mediator state is accurate else open a dispute
   **/
  async audit(): Promise<void> {
    const round = this.round

    if (round === 0) {
      throw new AuditError()
    }

    logger.info(`Client ${this.address} auditing for round ${round}`)

    let auditInfo: { result: AuditResult; message?: string }

    try {
      const proofs = await this.fetchProofs(round)
      await this.checkProofsArray(proofs, round)
      await this.storeProofsAsync(proofs, round)
      auditInfo = { result: 'ok' }

      await this.updateLastAuditOrFillRound('lastAuditRound')

      logger.info(
        `Audit successful for client ${this.address} and round ${round}.`
      )
    } catch (err) {
      logger.error(err.message)
      await this.openBalanceDispute(round)
      logger.error(`Audit failed for round ${round}`)
      logger.error(`Error:${err}`)
      auditInfo = { result: 'fail', message: err.message }
    }

    this.eventEmitter.emit('auditComplete', auditInfo)
  }

  /**
   * Returns the list of proofs sorted by registered assets
   * @param round Round of the proofs to be retrieved
   */
  async getSortedProofsArray(round: number): Promise<Proof[]> {
    const proofsArray = []

    const listOfRegisteredTokenAddresses = await this.getRegisteredAssets()

    for (const asset of listOfRegisteredTokenAddresses) {
      const proof = await ProofCollection.with(this.persistence).findOne({
        asset,
        round
      })
      if (proof != undefined) {
        proofsArray.push(proof)
      }
    }

    return proofsArray
  }

  /**
   * Returns the ordered list of registered assets of the mediator
   */
  async getRegisteredAssets(): Promise<string[]> {
    const listOfRegisteredTokenAddresses = await this.mediator.getSortedListOfregisteredTokensAddresses()
    return listOfRegisteredTokenAddresses
  }

  /**
   * Returns all proofs for the given round
   *
   * @param round Round number
   */
  async fetchProofs(round: number) {
    return await this.transport.audit(this.address, round)
  }

  /**
   * Check a whole proofs array sent by the operator
   * @param proofs Array of proofs to check
   * @param round Round number to check against
   */
  async checkProofsArray(proofs: Proof[], round: number): Promise<void> {
    if (proofs.length != this.assets.length) {
      throw Error(
        `Number of proofs does not match number of assets: ${
          proofs.length
        } != ${this.assets.length} `
      )
    }

    for (const [i, proof] of proofs.entries()) {
      const asset = this.assets[i]
      await this.auditAsset(asset, proof, round)
    }
  }

  /**
   * Fetches a proof for the given asset and round number
   *
   * @param asset Address of the asset to get the proof for
   * @param round Round number
   **/
  async getProofAsync(
    asset: string,
    round: number
  ): Promise<Proof | undefined> {
    return ProofCollection.with(this.persistence).findOne({ asset, round })
  }

  /**
   * Stores a set of proofs for a given round
   *
   * @param proofs Array of proofs
   * @param round Round number
   **/
  async storeProofsAsync(proofs: Proof[], round: number): Promise<void> {
    for (const proof of proofs) {
      try {
        logger.info(
          `Storing proof ${ProofSerDe.toJSON(proof)} for round ${round}`
        )
        await ProofCollection.with(this.persistence).save(proof, round)
      } catch (e) {
        logger.error(`Problem while storing proof: ${e.toString()}`)
      }
    }
  }

  /**
   * Opens a new balance dispute
   *
   * The operator will have to answer this challenge within a certain
   * time otherwise the mediator will go into HALTED mode.
   *
   * @param round Round number
   **/
  async openBalanceDispute(round: number) {
    if (await this.isHalted()) {
      throw Error('Unable to open dispute: the mediator is halted.')
    }

    const previousRound = round - 1

    //Get the proofs of the previous round
    const proofsArray = await this.getSortedProofsArray(previousRound)

    //Get the fills and their signatures for the previous round
    const signedFills: ISignedFill[] = R.sort(
      (a, b) => D(a.params.fillId).comparedTo(b.params.fillId),
      await this.ledger.getFills({ round: previousRound })
    )

    try {
      const fills = signedFills.map(fill => FillMediator.fromIFill(fill.params))
      const sigFills = signedFills.map(fill =>
        convertSigToSigSol(fill.signature)
      )

      logger.info(`Opening dispute for round ${round} with:
proofs: ${JSON.stringify(proofsArray)}
fills: ${JSON.stringify(fills)}
sigFills: ${JSON.stringify(sigFills)}
authorization: ${JSON.stringify(this.authorization)}`)

      await this.mediator.openDispute(
        proofsArray,
        fills,
        sigFills,
        this.authorization
      )
    } catch (e) {
      logger.error(`Failed to open a dispute for round ${round}: ${e.stack}.`)
    }
  }

  /**
   * Audits a specific asset and throws if the audit fails
   *
   * @param asset Address of the asset to audit
   * @param proof Proof for the asset at the given round
   * @param round Round number
   **/
  async auditAsset(asset: string, proof: Proof, round: number): Promise<void> {
    const failMsg = (reason: string) =>
      `Audit failed for asset ${asset}, round ${round}: ${reason}`

    if (proof.tokenAddress !== asset) {
      throw Error(failMsg('wrong asset in proof'))
    }

    if (proof.clientAddress !== this.address) {
      throw Error(failMsg('client address not ours'))
    }

    const proofOk = await this.isProofBalanceOk(
      asset,
      round,
      proof.clientOpeningBalance
    )

    const localBalance = await await this.ledger.openingBalance(
      asset,
      this.address,
      round
    )

    if (!proofOk) {
      throw Error(
        failMsg(
          `Client ${this.address}: opening balance ${
            proof.clientOpeningBalance
          } does not match our accounting (${localBalance})`
        )
      )
    }

    try {
      await this.checkProof(proof, round)
      logger.info(`Audit successful for asset ${asset}, round ${round}.`)
    } catch (err) {
      logger.error(
        `Proof verification failed: wallet=${
          this.address
        } asset=${asset} round=${round} proof=${JSON.stringify(proof.toJSON())}`
      )
      throw Error(failMsg(err.message))
    }
  }

  /**
   * Checks that the ledger balance matches the proof balance
   *
   * @param asset Address of the asset to check
   * @param round Round number
   * @param proofBalance Balance amount of the proof
   **/
  async isProofBalanceOk(
    asset: string,
    round: number,
    proofBalance: BigNumber
  ): Promise<boolean> {
    const clientBalance = await this.ledger.openingBalance(
      asset,
      this.address,
      round
    )
    logger.info(
      'asset:' +
        asset +
        '   ' +
        'Proof balance: ' +
        proofBalance.toString(10) +
        ' v/s ' +
        'clientBalance: ' +
        clientBalance.toString(10)
    )

    return proofBalance.eq(clientBalance)
  }

  /**
   * Checks that the proof is valid for the given round
   *
   * @param proof Proof object to validate
   * @param proofRound Round number
   **/
  async checkProof(proof: Proof, proofRound: number): Promise<void> {
    // round zero never has a root
    if (proofRound == 0) {
      return
    }

    if (!(await this.mediator.isProofValid(proof, proofRound))) {
      throw Error(
        `Invalid Proof Of Stake for asset ${
          proof.tokenAddress
        } at round ${proofRound}`
      )
    }

    this.eventEmitter.emit('proofVerified')
  }

  private async syncTime(): Promise<void> {
    const round = await this.mediator.getCurrentRound()
    if (round != this.round) {
      this._round = round
    }

    const quarter = await this.mediator.getCurrentQuarter()
    if (quarter != this.quarter) {
      this._quarter = quarter
    }
  }

  /**
   * Internal use only
   **/
  goToRound(round: number) {
    this._round = round
  }

  /**
   * Internal use only
   **/
  async ensureRound(): Promise<void> {
    const round = await this.mediator.getCurrentRound()
    if (round != this.round) {
      await this.goToRound(round)
    }
  }

  /**
   * Internal use only
   **/
  async ensureQuarter(): Promise<void> {
    const quarter = await this.mediator.getCurrentQuarter()
    if (quarter != this.quarter) {
      await this.goToQuarter(this.round, quarter)
    }
  }

  /**
   * Confirms a withdrawal that has been previously initiated by the user
   *
   * @param asset Address of the asset for withdrawal
   **/
  async confirmWithdrawal(asset: string): Promise<void> {
    const currentRound = this.round
    const currentQuarter = this.quarter

    const requestRound = await this.mediator.getActiveWithdrawalRound(
      asset,
      this.address
    )

    if (requestRound === 0) {
      throw new NoActiveWithdrawalError(
        `No active withdrawal for asset ${asset}`
      )
    }

    let withdrawableRound: number

    if (currentQuarter === 0 || (await this.mediator.isHalted())) {
      withdrawableRound = currentRound - 3
    } else {
      withdrawableRound = currentRound - 2
    }

    // if the last withdrawable round has not caught up to the request round yet

    if (withdrawableRound < requestRound) {
      throw new PrematureWithdrawalError(
        `Too early to claim funds for asset ${asset}.`
      )
    }

    const amount = await this.mediator.requestedWithdrawalAmount(
      requestRound,
      asset,
      this.address
    )
    await this.mediator.confirmWithdrawal(asset)

    await this.ledger.confirmWithdrawalAsync(asset, this.address)

    logger.info(
      `Withdrawal confirmed. asset=${asset} amount=${amount} round=${currentRound}`
    )

    this.eventEmitter.emit('WithdrawalConfirmed')
  }

  /**
   * Internal use only
   **/
  async goToQuarter(round: number, quarter: Quarter): Promise<void> {
    this._quarter = quarter
    logger.info(`Going to round=${round} quarter=${quarter}`)

    if (quarter === FETCH_FILL_QUARTER) {
      try {
        await this.fetchFills(round - 1)
      } catch (err) {
        logger.error(`${err.message}`)
      }
    }

    if (quarter === AUDIT_QUARTER && round > this._roundJoined) {
      try {
        await this.audit()
      } catch (err) {
        logger.error(`${err.message}`)
      }

      for (const asset of this.assets) {
        if (round < 4) {
          break
        }

        logger.info(
          `Confirming withdrawal of asset ${asset} from round ${round - 2}`
        )

        try {
          await this.confirmWithdrawal(asset)
          logger.info(`Confirming withdrawal ok`)
        } catch (err) {
          const expectedError =
            err instanceof NoActiveWithdrawalError ||
            err instanceof PrematureWithdrawalError

          if (!expectedError) {
            logger.error(`Confirming withdrawal failed: ${err.message}`)
          }
        }
      }
    }
  }

  /**
   * Used to watch for specific events
   *
   * @param eventName Name of the event to watch for
   * @param callback Callback function to be invoked when the event happens
   **/
  on(eventName: string, callback: EventEmitter.ListenerFn): void {
    this.eventEmitter.on(eventName, callback)
  }

  /**
   * Used to watch for specific events
   *
   * @param eventName Name of the event to watch for
   * @param callback Callback function to be invoked when the event happens
   **/
  once(eventName: string, callback: EventEmitter.ListenerFn): void {
    this.eventEmitter.once(eventName, callback)
  }

  /**
   * Used to watch for specific events
   *
   * @param eventName Name of the event to watch for
   **/
  waitForEvent(eventName: string): Promise<any> {
    const event = (name: string) =>
      new Promise(resolve => this.once(name, resolve))

    return event(eventName)
  }

  /**
   * Allows the use to recover funds once the mediator has
   * entered HALTED state.
   *
   * @param asset Address of the asset to recover funds for
   **/
  async recoverFunds(asset: string) {
    const isMediatorHalted = await this.mediator.isHalted()

    if (!isMediatorHalted) {
      throw Error('Cannot recover funds while the mediator is still active.')
    }
    const currentRound = await this.mediator.getCurrentRound()

    const isRecovered = await this.ledger.isRecovered(asset, this.address)

    if (isRecovered) {
      throw Error('Already recovered fund for this asset')
    }

    const proof = await ProofCollection.with(this.persistence).findOne({
      asset: asset,
      round: currentRound - 2
    })

    if (proof !== undefined) {
      await this.mediator.recoverAllFunds(proof)

      logger.info('All funds recovered.')
    } else {
      await this.mediator.recoverOnChainFundsOnly(asset)
      logger.info('Onchain funds recovered.')
    }

    await this.ledger.setRecovered(asset, this.address)
  }

  /**
   * Gets the round number when the client first joined the operator
   **/
  get roundJoined(): number {
    return this._roundJoined
  }

  /**
   * Checks if the client is connected to the server
   **/
  get isConnected(): boolean {
    return this._isConnected
  }

  /**
   * Gets the round size for the mediator
   **/
  get roundSize(): BigNumber | undefined {
    return this._roundSize
  }

  private validateAuthorization(authorization: IAuthorizationMessage): void {
    let result: boolean

    result = vfAuthorization(
      authorization,
      this.operatorAddress,
      this.address,
      this.round
    )

    if (!result) {
      throw new AuthorizationMessageValidationError(
        'The authorization message is not valid.'
      )
    }
  }

  private registerEventListeners(): void {
    const contract = this.mediator.getContractWrapper()

    if (contract === null || contract === undefined) {
      return
    }

    contract.provider.on('block', async (blockNumber: number) => {
      logger.info(`New block ${blockNumber}`)

      await this.onNewBlockAsync()
    })

    contract.on('Halted', async () => {
      await this.onMediatorHalt()
    })
  }

  private async onMediatorHalt() {
    for (const asset of this.assets) {
      await this.recoverFunds(asset)
    }

    this.eventEmitter.emit('recoveryCompleted')
  }

  /**
   * Internal use only
   **/
  public async onNewBlockAsync() {
    await this.ensureRound()
    await this.ensureQuarter()
    this.eventEmitter.emit('onNewBlockProcessed')
  }

  /**
   * Internal use only
   **/
  async onReceiveFillAsync(fill: ISignedFill): Promise<void> {
    const digest = FillMediator.fromIFill(fill.params).createDigest()

    if (!verifySig(digest, fill.signature, this.operatorAddress)) {
      const errorMsg = `Invalid signature on fill: ${JSON.stringify(fill)}`

      logger.error(errorMsg)
      throw new SignatureError(errorMsg)
    }

    logger.info('New fill received:')
    logger.info(JSON.stringify(fill.params))

    await this.ledger.insertFill(fill)
  }

  /**
   * Creates a new BUY or SELL order also passing in required fee approval
   *
   * @param order Order Approval object
   * @param fee Fee Approval object
   **/
  async createOrder(order: IApproval, fee: IApproval): Promise<string> {
    if (await this.isHalted()) {
      throw Error('Unable to create order: the mediator is halted.')
    }

    const orderSignedApproval: ISignedApproval = await this.makeSignedApproval(
      order
    )

    const feeSignedApproval: ISignedApproval = await this.makeSignedApproval(
      fee
    )

    const l2Order: IL2Order = {
      orderApproval: orderSignedApproval,
      feeApproval: feeSignedApproval
    }

    await this.ledger.validateOrder(l2Order)

    await this.transport.createOrder(l2Order)

    await this.ledger.insertOrder(l2Order)

    return order.approvalId
  }

  /**
   * Cancels an active order
   *
   * @param approvalId Order Approval ID
   **/
  async cancelOrder(approvalId: string) {
    const approval = (await this.ledger.getApprovals({ approvalId }))[0]

    if (approval === undefined) {
      throw Error(`Cancel order failed: No approval with ID ${approvalId}`)
    }

    const authorization = await this.identity.hashAndSign(approvalId)

    await this.transport.cancelOrder(approvalId, authorization)

    // get all the current fills
    await this.fetchFills(this.round)

    try {
      await this.ledger.cancelApproval(approvalId)
    } catch (err) {
      logger.warn(
        `Order cancellation succeeded remotely but failed locally: ${
          err.message
        }.`
      )
    }
  }

  /**
   * Internal use only
   **/
  async insertFill(fill: ISignedFill) {
    await this.ledger.insertFill(fill)
  }

  /**
   * Internal use only
   **/
  public async signApprovBytes(approvParams: IApproval): Promise<SignatureSol> {
    const sig = await this.identity.signApprov(approvParams)
    const sigAsBytes = [...EthersUtils.arrayify(sig)].map(EthersUtils.hexlify)
    return sigAsBytes
  }

  /**
   * Signs an approval object using the client key
   * @param approvParams Approval object to sign
   */
  public async makeSignedApproval(
    approvParams: IApproval
  ): Promise<ISignedApproval> {
    const signedApproval = makeSignedApproval(approvParams, this
      .identity as PrivateKeyIdentity)

    return signedApproval
  }

  /**
   * Returns the balance of tokens on-chain
   * @param assetAddress Address of the asset to return the balance for
   */
  public async getBalanceTokenOnChain(
    assetAddress: string
  ): Promise<BigNumber> {
    const tokenContract = getContract(
      assetAddress,
      'ERC20',
      this.identity
    ) as ERC20

    const balanceString = await tokenContract.functions.balanceOf(this.address)

    return D(balanceString.toString())
  }

  /**
   * Returns the balance for a specific asset/round
   * @param assetAddress Address of the address
   * @param round Round for computing the balance
   */
  public async getBalanceTokenOffChain(
    assetAddress: string,
    round: number
  ): Promise<BigNumber> {
    return this.ledger.balance(assetAddress, this.address, round)
  }

  private async getAuthorization(): Promise<IAuthorizationMessage> {
    const sig = await this.identity.hashAndSign(this.address)
    const authorization = await this.transport.join(this.address, sig)

    this.validateAuthorization(authorization)

    return authorization
  }

  private async updateLastAuditOrFillRound(
    field: 'lastFillRound' | 'lastAuditRound'
  ): Promise<void> {
    const account = await this.getAccount()

    if (account == null) {
      return
    }

    account[field] = this.round
    await this.updateAccount(account)
  }

  private async getAccount(): Promise<IWalletRegistryEntry | null> {
    return WalletCollection.with(this.persistence).findOne({
      wallet: this.address
    })
  }

  private async saveAccount(): Promise<void> {
    return WalletCollection.with(this.persistence).save({
      wallet: this.address,
      roundJoined: this._roundJoined,
      lastFillRound: this._roundJoined,
      lastAuditRound: this._roundJoined,
      authorization: this._authorization
    })
  }

  private async updateAccount(account: IWalletRegistryEntry): Promise<void> {
    return WalletCollection.with(this.persistence).update(account)
  }

  private async syncStateWithExchange(): Promise<void> {
    const account = await this.getAccount()

    if (account == null) {
      throw Error('Account not found')
    }

    const { lastFillRound, lastAuditRound } = account

    if (this.round > lastFillRound) {
      for (let r = lastFillRound + 1; r < this.round; r++) {
        await this.fetchFills(r)
      }

      if (this.quarter >= FETCH_FILL_QUARTER) {
        await this.fetchFills(this.round)
      }
    }

    if (this.round > lastAuditRound) {
      for (let r = lastAuditRound + 1; r < this.round; r++) {
        const proofs = await this.fetchProofs(r)
        await this.storeProofsAsync(proofs, r)
      }

      if (this.quarter >= AUDIT_QUARTER) {
        await this.audit()
      }

      await this.updateLastAuditOrFillRound('lastAuditRound')
    }
  }

  /**
   * Returns the instanceId (mediator contract address) that
   * the client is connected to
   */
  public getInstanceId(): string {
    return this.mediator.contractAddress
  }
}
