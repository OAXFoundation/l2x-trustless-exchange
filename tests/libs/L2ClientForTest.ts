import BigNumber from 'bignumber.js'
import EventEmitter from 'eventemitter3'
import { utils as EthersUtils } from 'ethers'

import { getContract, HTTPClient, L2Client } from '@oax/client'
import { Identity } from '@oax/common/identity/Identity'
import { L2ClientOptions } from '@oax/client/operator/L2Client'
import { Proof } from '@oax/common/types/SmartContractTypes'
import { Quarter, SignatureSol } from '@oax/common/types/BasicTypes'
import { ISignedFill } from '@oax/common/types/Fills'
import { IApproval } from '@oax/common/types/Approvals'
import { ERC20 } from '@oax/contracts/wrappers/ERC20'
import { D } from '@oax/common/BigNumberUtils'
import { ProofCollection } from '@oax/common/persistence/ProofCollection'
import { Round } from '../../src/common/types/BasicTypes'
import { loggers } from '@oax/common/Logging'

const logger = loggers.get('frontend')

/**
 * A specialized L2Client used for testing only.
 *
 * Protected methods and getters are exposed for verification.
 */
export class L2ClientForTest extends L2Client {
  constructor(
    identity: Identity,
    transport: HTTPClient | string,
    options: L2ClientOptions
  ) {
    super(identity, transport, options)
  }

  public get authorization() {
    return super.authorization
  }

  public hasAuthorization() {
    return super.hasAuthorization()
  }

  public getRoundFromBlockNumber(blockNumber: number) {
    return super.getRoundFromBlockNumber(blockNumber)
  }

  public async audit() {
    return super.audit()
  }

  public async getRegisteredAssets() {
    return super.getRegisteredAssets()
  }

  public async fetchProofs(round: number) {
    return super.fetchProofs(round)
  }

  public async storeProofsAsync(proofs: Proof[], round: number) {
    return super.storeProofsAsync(proofs, round)
  }

  public async checkProof(proof: Proof, proofRound: number) {
    return super.checkProof(proof, proofRound)
  }

  /**
   * Fetches a proof for the given asset and round number
   *
   * @param asset Address of the asset to get the proof for
   * @param round Round number
   **/
  public async getProofAsync(
    asset: string,
    round: number
  ): Promise<Proof | undefined> {
    return ProofCollection.with(this.persistence).findOne({ asset, round })
  }

  public async goToQuarter(round: number, quarter: Quarter) {
    return super.goToQuarter(round, quarter)
  }

  public async ensureRound() {
    return super.ensureRound()
  }

  public once(eventName: string, callback: EventEmitter.ListenerFn) {
    return super.once(eventName, callback)
  }

  public async isProofBalanceOk(
    asset: string,
    round: number,
    proofBalance: BigNumber
  ) {
    return super.isProofBalanceOk(asset, round, proofBalance)
  }

  public async openBalanceDispute(round: number) {
    return super.openBalanceDispute(round)
  }

  public goToRound(round: number) {
    return super.goToRound(round)
  }

  public async recoverFunds(asset: string) {
    return super.recoverFunds(asset)
  }

  public async onReceiveFillAsync(fill: ISignedFill) {
    return super.onReceiveFillAsync(fill)
  }

  public hasFill(round: number, fill: ISignedFill) {
    return super.hasFill(round, fill)
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

  public async makeSignedApproval(approvParams: IApproval) {
    return super.makeSignedApproval(approvParams)
  }

  public waitForEvent(eventName: string) {
    return super.waitForEvent(eventName)
  }

  public async insertFill(fill: ISignedFill) {
    await this.ledger.insertFill(fill)
  }

  public async signApprovBytes(approvParams: IApproval): Promise<SignatureSol> {
    const sig = await this.identity.signApprov(approvParams)
    const sigAsBytes = [...EthersUtils.arrayify(sig)].map(EthersUtils.hexlify)
    return sigAsBytes
  }
}

/**
 * A specialized L2Client used for chaos testing only.
 *
 * Protected methods and getters are exposed for verification / inserting random behaviour
 */
export class L2ClientChaos extends L2ClientForTest {
  private randomFailProbability: number

  constructor(
    identity: Identity,
    transport: HTTPClient | string,
    options: L2ClientOptions
  ) {
    super(identity, transport, options)
    this.randomFailProbability = 0
  }

  public setRandomFailureProbability(prob: number) {
    this.randomFailProbability = prob
  }

  public async fetchFills(round: Round) {
    if (Math.random() > this.randomFailProbability) {
      logger.info(
        `Fetchfill successful for client ${this.address} and round ${round}.`
      )
      return super.fetchFills(round)
    } else {
      logger.info(
        `Fetchfill failed for client ${this.address} and round ${round}.`
      )
    }
  }

  public async fetchProofs(round: number) {
    if (Math.random() > this.randomFailProbability) {
      logger.info(
        `Fetchproof successful for client ${this.address} and round ${round}.`
      )
      return super.fetchProofs(round)
    } else {
      logger.info(
        `Fetchproof failed for client ${this.address} and round ${round}.`
      )
      return []
    }
  }
}
