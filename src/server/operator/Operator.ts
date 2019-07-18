// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import BigNumber from 'bignumber.js'
import { JsonRpcProvider, TransactionReceipt, Log } from 'ethers/providers'
import { HashZero } from 'ethers/constants'
import R from 'ramda'

import EventEmitter from 'eventemitter3'
import {
  Address,
  Round,
  AssetAddress,
  Quarter,
  SignatureSol,
  ContractDisputeEvent,
  DepositEvent,
  WithdrawalEvent,
  ConfirmWithdrawalEvent,
  Signature,
  Omit
} from '../../common/types/BasicTypes'

import { Mutex } from '../Mutex'

import {
  IRootInfo,
  IBalanceDispute,
  IWithdrawal
} from '../../common/types/OperatorAndClientTypes'

import {
  Approval,
  IApproval,
  ISignedApproval
} from '../../common/types/Approvals'

import { IMediatorAsync } from '../../common/mediator/IMediatorAsync'
import { Identity } from '../../common/identity/Identity'
import { loggers } from '../../common/Logging'
import {
  convertSigToSigSol,
  ethersBNToBigNumber,
  filterLogs
} from '../../common/ContractUtils'
import { MetaLedger } from '../../common/accounting/MetaLedger'

import { D } from '../../common/BigNumberUtils'
import { ApprovalsFunctions } from '../../common/types/Approvals'
import { FillMediator, IFill, ISignedFill } from '../../common/types/Fills'
import {
  IAuthorizationMessage,
  Proof
} from '../../common/types/SmartContractTypes'
import { mkAuthorization } from '../../common/AuthorizationMessage'

const logger = loggers.get('backend')

export class Operator {
  readonly identity: Identity
  readonly mediator: IMediatorAsync
  readonly provider: JsonRpcProvider
  private _round: Round = 0
  private _quarter: Quarter = 0
  private _numCommitRetries = 5
  private metaLedger: MetaLedger
  private eventEmitter: EventEmitter
  private _mediatorCreationBlockNumber = -1
  private _roundSize: number = 0
  private readonly newQuarterLock: Mutex

  constructor(
    identity: Identity,
    mediator: IMediatorAsync,
    provider: JsonRpcProvider,
    metaLedger: MetaLedger
  ) {
    this.identity = identity
    this.mediator = mediator
    this.provider = provider
    this.metaLedger = metaLedger
    this.eventEmitter = new EventEmitter()
    this.newQuarterLock = new Mutex()

    this.registerEventListeners()
  }

  get address(): Address {
    return this.identity.address
  }

  get round() {
    return this._round
  }

  get quarter() {
    return this._quarter
  }

  get mediatorAddress(): Address {
    return this.mediator.contractAddress
  }

  /**
   * Computes the authorization message using the client address and the round
   *
   * @param clientAddress: address of the client
   * @param round: round of creation of the authorization message
   */
  async computeAuthorizationMessage(
    clientAddress: Address,
    round: Round
  ): Promise<IAuthorizationMessage> {
    const authorizationMessage: IAuthorizationMessage = await mkAuthorization(
      clientAddress,
      round,
      this.identity
    )

    return authorizationMessage
  }

  /**
   * Registers an account on the ledger and returns an admission authorization.
   *
   * Used by exchange to register a user.
   *
   * @param clientAddress
   */
  async admit(clientAddress: Address): Promise<IAuthorizationMessage> {
    await this.metaLedger.register(clientAddress, this.round)
    const roundJoined = await this.metaLedger.roundJoined(clientAddress)
    const authorizationMessage = await this.computeAuthorizationMessage(
      clientAddress,
      roundJoined
    )
    return authorizationMessage
  }

  async getCommit(asset: AssetAddress, round: Round): Promise<IRootInfo> {
    const tree = await this.metaLedger.getSolvencyTree(asset, round)
    return tree.getRootInfo()
  }

  once(eventName: string, callback: EventEmitter.ListenerFn): void {
    this.eventEmitter.once(eventName, callback)
  }

  async commit(round: Round): Promise<TransactionReceipt[]> {
    logger.info(`Starting commit at round ${round}.`)
    const receipts: TransactionReceipt[] = []

    for (const asset of this.metaLedger.assets) {
      const rootOnChain = await this.mediator.getCommit(round, asset)
      if (rootOnChain !== HashZero) {
        logger.info(`Root for asset ${asset} already on chain.`)
        continue
      }

      const root = await this.getCommit(asset, round)

      if (!root) {
        throw Error(
          `No rootNode available for ledger ${asset} at round ${round}.`
        )
      }

      logger.info(
        `Committing root ${root.content} for asset ${asset} at round ${round}.`
      )

      const operatorDeposits = await this.metaLedger.totalDeposits(
        round - 1,
        asset
      )

      const contractDeposits = await this.mediator.totalDeposits(
        round - 1,
        asset
      )

      if (!operatorDeposits.eq(contractDeposits)) {
        logger.error(
          `Deposits mismatch: round=${round -
            1} asset=${asset} operator deposits=${operatorDeposits} contract deposits=${contractDeposits}`
        )
      }

      try {
        const receipt = await this.mediator.commit(root, asset)
        receipts.push(receipt)
        logger.info(`Commit ok for asset ${asset}.`)
      } catch (err) {
        const quarter = await this.mediator.getCurrentQuarter()
        const msg = `Commit for asset=${asset} round=${round} quarter=${quarter} failed: ${JSON.stringify(
          root
        )}`
        logger.error(msg)
        logger.error('Stack for commit error: ' + err.stack)
        throw err
      }
    }

    return receipts
  }

  async getCurrentRound(): Promise<Round> {
    return this.mediator.getCurrentRound()
  }

  async audit(client: Address, round: Round): Promise<Proof[]> {
    return Promise.all(
      this.metaLedger.assets.map(asset =>
        this.getProofClient(asset, client, round)
      )
    )
  }

  async hasBalanceDisputeAsync(
    dispute: Partial<IBalanceDispute>
  ): Promise<boolean> {
    return this.metaLedger.hasOpenDisputeAsync(dispute)
  }

  private registerEventListeners(): void {
    const contract = this.mediator.getContractWrapper()

    contract.on(
      'WithdrawalConfirmed',
      async (...event: ConfirmWithdrawalEvent) => {
        try {
          await this.onConfirmWithdrawal(event)
        } catch (err) {
          console.error(err.stack || err.toString())
        }
      }
    )

    this.provider.on('block', (blockNumber: number) => {
      this.processBlocksUpTo(blockNumber).catch(e => logger.error(e))
    })
  }

  /**
   * Process block events from the last processed block up to the block
   * number specified
   *
   * @param blockNumber
   */
  async processBlocksUpTo(blockNumber: number) {
    try {
      await this.newQuarterLock.lockAsync()

      await this.ensureRoundSettingsInitialized()

      const lastProcessedBlock = await this.metaLedger.getLastProcessedBlock()

      if (lastProcessedBlock >= 0 && blockNumber <= lastProcessedBlock) {
        logger.info(
          `Asked to process blocks up to ${blockNumber} but already up to date.`
        )
        return
      }

      const firstStart =
        this._mediatorCreationBlockNumber === 0
          ? blockNumber
          : this._mediatorCreationBlockNumber + 1

      const startBlock =
        lastProcessedBlock >= 0 ? lastProcessedBlock + 1 : firstStart

      logger.info(
        `Starting to process blocks from ${startBlock} to ${blockNumber}.`
      )

      for (let curBlock = startBlock; curBlock <= blockNumber; curBlock++) {
        let isHalted = await this.mediator.isHalted()

        if (isHalted) {
          logger.error('Mediator is halted. Skipping block processing.')
          return
        }

        const round = await this.calculateCurrentRound(curBlock)
        const quarter = await this.calculateCurrentQuarter(curBlock)

        await this.processSingleBlock(curBlock, round, quarter)

        await this.metaLedger.saveLastProcessedBlock(curBlock)
      }
    } catch (err) {
      logger.error(`Block processing failed: ${err.message}`)

      try {
        await this.mediator.updateHaltedState()
      } catch (err2) {
        logger.error(
          `Commit failed and updateHaltedState also failed: ${err2.message}.`
        )
      }
    } finally {
      this.newQuarterLock.unlock()
    }
  }

  protected async calculateCurrentRound(blockNumber: number): Promise<number> {
    return Math.floor(
      (blockNumber - this._mediatorCreationBlockNumber) / this._roundSize
    )
  }

  protected async calculateCurrentQuarter(
    blockNumber: number
  ): Promise<Quarter> {
    return Math.floor(
      ((blockNumber - this._mediatorCreationBlockNumber) % this._roundSize) /
        (this._roundSize / 4)
    ) as Quarter
  }

  private async ensureRoundSettingsInitialized() {
    if (this._mediatorCreationBlockNumber === -1) {
      this._mediatorCreationBlockNumber = await this.mediator.getBlockNumberAtCreation()
    }

    if (this._roundSize === 0) {
      this._roundSize = (await this.mediator.roundSize()).toNumber()
    }
  }

  private async processSingleBlock(
    blockNumber: number,
    round: number,
    quarter: Quarter
  ) {
    logger.info(`New block ${blockNumber}, round ${round}, quarter ${quarter}`)

    const logs = await this.provider.getLogs({
      address: this.mediatorAddress,
      fromBlock: blockNumber,
      toBlock: blockNumber
    })

    await this.processDepositCompletedEvents(logs)
    await this.processWithdrawalInitiatedEvents(logs)
    await this.processDisputeOpenedEvents(logs)

    if (quarter !== this.quarter) {
      await this.onNewQuarter(round, quarter as Quarter)
    }

    logger.info(`Block ${blockNumber} processed`)

    this.eventEmitter.emit('onNewBlockProcessed')
  }

  async processDepositCompletedEvents(logs: Log[]) {
    const contract = this.mediator.getContractWrapper()
    const contractEvents = contract.interface.events

    const depositLogs = filterLogs(contract, 'DepositCompleted', logs)

    for (const log of depositLogs) {
      const { data, topics } = log
      try {
        const e = contractEvents['DepositCompleted'].decode(data, topics)

        const txInfo = { transactionHash: log.transactionHash! }

        await this.onDeposit([e[0], e[1], e[2], e[3], txInfo])
      } catch (err) {
        logger.error(err.stack || err.toString())
      }
    }
  }

  async processWithdrawalInitiatedEvents(logs: Log[]) {
    const contract = this.mediator.getContractWrapper()
    const contractEvents = contract.interface.events

    const withdrawalLogs = filterLogs(contract, 'WithdrawalInitiated', logs)

    for (const log of withdrawalLogs) {
      const { data, topics } = log
      try {
        const e = contractEvents['WithdrawalInitiated'].decode(data, topics)

        const txInfo = { transactionHash: log.transactionHash! }

        await this.onInitiateWithdrawal([e[0], e[1], e[2], e[3], txInfo])
      } catch (err) {
        logger.error(err.stack || err.toString())
      }
    }
  }

  async processDisputeOpenedEvents(logs: Log[]) {
    const contract = this.mediator.getContractWrapper()
    const contractEvents = contract.interface.events

    const disputeLogs = filterLogs(contract, 'DisputeOpened', logs)

    for (const log of disputeLogs) {
      const { data, topics } = log

      try {
        const e = contractEvents['DisputeOpened'].decode(data, topics)

        const txInfo = { transactionHash: log.transactionHash! }

        await this.onOpenDispute([e[0], e[1], e[2], txInfo])
      } catch (err) {
        logger.error(err.stack || err.toString())
      }
    }
  }

  async onDeposit(event: DepositEvent) {
    const [round, asset, wallet, ethersAmount, txInfo] = event

    // Converts an Ether big number into a big number or otherwise do nothing
    const amount = ethersBNToBigNumber(ethersAmount)

    logger.info(
      `New deposit round ${round}, asset ${asset}, client ${wallet}, amount ${amount}.`
    )

    const roundOfEvent = round.toNumber()

    const processedDeposit = await this.metaLedger.getDepositRecordByIdAsync(
      txInfo.transactionHash
    )

    if (processedDeposit !== null) {
      logger.info('Deposit has already been processed. Skipping.', event)
      return
    }

    await this.metaLedger.creditDeposit(asset, wallet, amount, roundOfEvent)
    await this.metaLedger.saveDepositRecord({
      asset,
      wallet: wallet,
      round: roundOfEvent,
      txHash: txInfo.transactionHash,
      amount
    })

    this.eventEmitter.emit('depositEventReceived', event)
  }

  async onConfirmWithdrawal(event: ConfirmWithdrawalEvent) {
    const [round, asset, client, ethersAmount] = event

    const amount = ethersBNToBigNumber(ethersAmount)

    logger.info(
      `WithdrawalConfirmed round=${round} asset=${asset} client=${client} amount=${amount}`
    )
    await this.metaLedger.confirmWithdrawalAsync(asset, client)
  }

  /**
   * Process an InitiateWithdrawal event
   *
   * A withdrawal object is created to track the lifecycle of the
   * withdrawal request.
   *
   * Initially, the withdrawal object is marked as "unchecked". The operator
   * must call moderateWithdrawalRequest() in the next quarter to process the
   * request.
   *
   * @param event
   */
  async onInitiateWithdrawal(event: WithdrawalEvent) {
    const [ethersRound, asset, client, ethersAmount, eventInfo] = event

    if (eventInfo.transactionHash === undefined) {
      let msg = 'Transaction hash not found in event object'
      logger.error(msg, eventInfo)
      throw Error(msg)
    }

    const processedWithdrawal = await this.metaLedger.getWithdrawalByIdAsync(
      eventInfo.transactionHash
    )

    if (processedWithdrawal !== null) {
      logger.info('Withdrawal has already been processed. Skipping.', event)
      return
    }

    const round = parseInt(ethersRound.toString())
    const amount: BigNumber = D(ethersAmount.toString())

    logger.info(
      `WithdrawalInitiated round ${round}, asset ${asset}, client ${client}, amount ${amount}`
    )

    const withdrawal: Omit<IWithdrawal, 'id'> = {
      txHash: eventInfo.transactionHash,
      round: round,
      asset: asset,
      wallet: client,
      amount: amount,
      status: 'unchecked'
    }

    await this.metaLedger.insertWithdrawalAsync(withdrawal)
    this.eventEmitter.emit('withdrawalRequestReceived', withdrawal)
  }

  async closeDispute(dispute: IBalanceDispute): Promise<void> {
    logger.info(`Closing dispute for client ${dispute.wallet}...`)

    //Build the proof array
    const listOfRegisteredTokenAddresses = await this.mediator.getSortedListOfregisteredTokensAddresses()
    let proofsArray: Proof[] = []

    const clientAddress: Address = dispute.wallet
    const disputeRound: Round = dispute.round
    const lastConfirmedRound: Round = disputeRound - 1

    let signedApprovals: ISignedApproval[]
    let signedFills: ISignedFill[]

    let approvals: IApproval[]
    let sigApprovals: SignatureSol[]

    let fills: FillMediator[]
    let sigFills: SignatureSol[]

    //Fetch the proofs
    for (let registeredToken of listOfRegisteredTokenAddresses) {
      let proof = await this.getProofClient(
        registeredToken,
        clientAddress,
        disputeRound
      )
      proofsArray.push(proof!)
    }

    //Get the fills and their respective signature
    signedFills = await this.metaLedger.getFills({
      wallet: clientAddress,
      round: lastConfirmedRound
    })
    signedFills = signedFills.sort((a, b) =>
      D(a.params.fillId).comparedTo(D(b.params.fillId))
    )

    fills = signedFills.map(fill => FillMediator.fromIFill(fill.params))
    sigFills = signedFills.map(fill => convertSigToSigSol(fill.signature))

    // From the fills array built, generate the list of approvals
    // We must have that each fill matches its own approval (i.e. approvals may be repeated)
    signedApprovals = []

    for (let fill of fills) {
      let approvalId = fill.approvalId
      let signedApproval = (await this.metaLedger.getApprovals({
        approvalId
      }))[0]
      signedApprovals.push(signedApproval)
    }

    approvals = signedApprovals.map(a => Approval.fromIApproval(a.params))
    sigApprovals = signedApprovals.map(a => convertSigToSigSol(a.ownerSig))

    logger.info(`Closing dispute with
proofs: ${JSON.stringify(proofsArray)}
approvals: ${JSON.stringify(approvals)}
sigApprovals: ${JSON.stringify(sigApprovals)}
fills: ${JSON.stringify(fills)}
sigFills: ${JSON.stringify(sigFills)}
clientAddress: ${clientAddress}`)

    try {
      await this.mediator.closeDispute(
        proofsArray,
        approvals,
        sigApprovals,
        fills,
        sigFills,
        clientAddress
      )

      await this.metaLedger.updateDisputeAsync({
        ...dispute,
        status: 'closed'
      })

      logger.info(`Dispute closed successfully for client ${clientAddress}.`)
    } catch (err) {
      logger.error(`Closing dispute failed ${err.message}`)
      throw err
    }

    this.eventEmitter.emit('disputeProcessed', dispute)
  }

  async getProofClient(
    assetAddress: AssetAddress,
    clientAddress: Address,
    round: Round
  ): Promise<Proof> {
    return this.metaLedger.completeProof(assetAddress, clientAddress, round)
  }

  /**
   * Process a DisputeOpened event
   *
   * A BalanceDispute object is stored to keep track of the lifecycle of the
   * dispute.
   *
   * @param event
   */
  async onOpenDispute(event: ContractDisputeEvent) {
    const [id, ethersBigNumberRound, client, eventInfo] = event

    if (eventInfo.transactionHash === undefined) {
      let msg = 'Transaction hash not found in event object'
      logger.error(msg, eventInfo)
      throw Error(msg)
    }

    const processedDispute = await this.metaLedger.getDisputeByIdAsync(id)

    if (processedDispute !== null) {
      logger.info('Dispute has already been processed. Skipping.', event)
      return
    }

    const round = ethersBigNumberRound.toNumber()

    await this.metaLedger.insertDisputeAsync({
      round,
      wallet: client,
      status: 'open'
    })

    this.eventEmitter.emit('disputeReceived')
  }

  async moderateWithdrawalRequest(request: IWithdrawal) {
    const { asset, wallet, amount, round } = request

    const isWithdrawalValid = await this.metaLedger.isWithdrawalValid(request)

    if (isWithdrawalValid) {
      const available = await this.metaLedger.balance(asset, wallet, round)
      logger.info(
        `Allowing withdrawal: asset=${asset} wallet=${wallet} requested=${amount} available=${available} round=${round}`
      )
      await this.metaLedger.approveWithdrawal(request)
    } else {
      let signedApprovals = R.sort(
        (a, b) => D(a.params.approvalId).comparedTo(D(b.params.approvalId)),
        await this.metaLedger.getApprovals({
          wallet,
          round,
          sellAsset: asset
        })
      )

      const approvals = signedApprovals.map(a => a.params)
      const sigs: SignatureSol[] = signedApprovals.map(a =>
        ApprovalsFunctions.extractSignatureSol(a)
      )

      try {
        await this.mediator.cancelWithdrawal(approvals, sigs, asset, wallet)
        await this.metaLedger.cancelWithdrawalAsync(asset, wallet)
        logger.info(`Cancelled withdrawal`)
      } catch (err) {
        logger.error(`Cancelling withdrawal failed ${err.message}`)
      }
    }

    this.eventEmitter.emit('withdrawalModerated')
  }

  async processWithdrawalRequests(): Promise<void> {
    let withdrawalRequests = await this.metaLedger.getWithdrawalAsync(
      'unchecked'
    )

    if (withdrawalRequests.length > 0) {
      logger.info(
        `There are ${
          withdrawalRequests.length
        } pending withdrawal requests to handle...`
      )

      for (const req of withdrawalRequests) {
        await this.moderateWithdrawalRequest(req)
      }
    }
  }

  async processOpenDisputes(): Promise<void> {
    logger.info('Processing disputes')
    const disputes = await this.metaLedger.getOpenDisputesAsync()
    for (const dispute of disputes) {
      await this.closeDispute(dispute)
    }
  }

  async onNewQuarter(round: Round, quarter: Quarter) {
    logger.info(`Processing new quarter ${quarter}...`)

    this._round = round
    this._quarter = quarter

    // Moderate withdrawal requests
    await this.processWithdrawalRequests()

    // Close disputes
    await this.processOpenDisputes()

    if (quarter == 0) {
      // This is a new round
      await this.goToRound(round)
    }

    logger.info(`Done processing new quarter ${quarter}`)

    this.eventEmitter.emit('newQuarterEventReceived')
  }

  async commitWithRetry(round: Round) {
    for (let attempt = 0; attempt < this._numCommitRetries; attempt++) {
      try {
        await this.commit(round)
        break
      } catch (err) {
        if (attempt == this._numCommitRetries - 1) {
          throw err
        }
        logger.error(err)
        logger.error('Retrying commit')
      }
    }
  }

  async goToRound(round: Round) {
    this._round = round
    await this.commitWithRetry(round)
  }

  async signFill(fill: IFill): Promise<Signature> {
    const hash = FillMediator.fromIFill(fill).createDigest()
    return await this.identity.signHash(hash)
  }

  async signApproval(approval: IApproval): Promise<Signature> {
    const hash = Approval.fromIApproval(approval).createDigest()
    return await this.identity.signHash(hash)
  }
}

export class OperatorMock extends Operator {
  protected async calculateCurrentRound(_blockNumber: number): Promise<number> {
    return await this.mediator.getCurrentRound()
  }

  protected async calculateCurrentQuarter(
    _blockNumber: number
  ): Promise<Quarter> {
    return await this.mediator.getCurrentQuarter()
  }
}
