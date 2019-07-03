// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import { Contract, Signer } from 'ethers'
import { AddressZero } from 'ethers/constants'
import { JsonRpcProvider } from 'ethers/providers'
import {
  fundEther,
  fundWETH,
  fundToken,
  getContractFactory
} from '../../src/common/ContractUtils'
import { Operator, OperatorMock } from '../../src/server/operator/Operator'
import { MetaLedger } from '../../src/common/accounting/MetaLedger'
import { PrivateKeyIdentity } from '../../src/common/identity/PrivateKeyIdentity'
import {
  Address,
  Amount,
  Signature,
  Round,
  Quarter
} from '../../src/common/types/BasicTypes'
import { Exchange, ExchangeConfig } from '../../src/server/exchange/Exchange'
import { MediatorAsync } from '../../src/common/mediator/Contracts'
import { ERC20 } from '../../src/contracts/wrappers/ERC20'
import { Identity } from '../../src/common/identity/Identity'
import { D, toEthersBn } from '../../src/common/BigNumberUtils'

import {
  IAuthorizationMessage,
  Proof
} from '../../src/common/types/SmartContractTypes'

import { MediatorMock } from '../../src/contracts/wrappers/MediatorMock'
import { FillMediator } from '../../src/common/types/Fills'
// import { L2Client } from '../../src/client/operator/L2Client'
import { Mediator } from '../../src/contracts/wrappers/Mediator'

import { HTTPServer } from '../../src/server/HTTPServer'
// import { HTTPClient } from '../../src/client/common/HTTPClient'
import { InMemoryTransportClient } from './InMemoryTransportClient'
import { IBalanceDispute } from '../../src/common/types/OperatorAndClientTypes'
// import { ExchangeClient } from '../../src/client/exchange/ExchangeClient'
import { loggers } from '../../src/common/Logging'

import { ExchangeClient, HTTPClient } from '@oax/client'
import { FEE_AMOUNT_WEI } from '../../config/environment'
import { L2ClientForTest } from './L2ClientForTest'

// ==============================
// Constants
// ==============================
export const CONSTANT_FEE = FEE_AMOUNT_WEI
export const SOME_ADDRESS = '0x6f663747290000CC618f1D1081EEB40479E0F3Ae'
export const SOME_SIGNATURE =
  '0xebd9280a9a7ebb8358ec6f4e359257778f2457f7edee9f96637bb7293f5245ab119238457a8f2340d08e827d260092dd2bd6b2c5874fde6bec9f73c45b5f165b1b'
export const WETH_CONTRACT_NAME = 'ETHToken'
export const OAX_CONTRACT_NAME = 'OAXToken'

const logger = loggers.get('backend')

// ==============================
// Type Declarations
// ==============================

interface SystemFixtureConfig {
  assets: string[] // IAsset names
  roundSize: number
  provider: JsonRpcProvider
  operator: {
    // Operator always need some ETH to register tokens
    initialETH: Amount
  }
  runServer: boolean
  mockMediator?: boolean
}

export interface SignerConfig {
  initialETH?: Amount
  initialTokens?: { [contractName: string]: Amount }
  approveMediatorForTransfer?: { [contractName: string]: Amount }
}

interface ExecutorCommand {
  execute(fixture: SystemFixture): Promise<void>
}

type ExecutorQuarters = 'Q0' | 'Q1' | 'Q2' | 'Q3'

interface ExecutorConfig {
  stopAtEndOfQuarter: ExecutorQuarters
}

export interface FixtureRound {
  // quarter should look like Q0, Q1, Q2, Q3
  [quarter: string]: ExecutorCommand[]
}

// ==============================
// Fixture Generator Class
// ==============================

export class SystemFixture {
  readonly assets: string[]
  readonly provider: JsonRpcProvider
  readonly balances: Map<string, Map<Address, Amount>> = new Map()
  readonly isMediatorMocked: boolean
  readonly roundSize: number
  readonly quarterSize: number

  private readonly config: SystemFixtureConfig
  private readonly deployer: Signer
  private readonly operatorId: Identity

  private serverUrl: string
  private server: HTTPServer | undefined

  private tokenContracts: Map<string, Contract> = new Map()
  private metaLedger: MetaLedger | undefined
  private operator: OperatorMock | undefined
  private exchange: Exchange | undefined

  private mediator: MediatorMock | Mediator | undefined
  public mediatorUsedByOperator: MediatorAsync | undefined
  private clients: L2ClientForTest[]

  constructor(config: SystemFixtureConfig) {
    this.config = config
    this.provider = config.provider
    this.provider.pollingInterval = 20
    this.assets = config.assets

    // the first account is assumed to be unlocked and is the dev account
    this.deployer = this.provider.getSigner(0)

    // needed to have this outside of makeOperator to make MetaLedger happy
    this.operatorId = new PrivateKeyIdentity(undefined, this.provider)

    if (config.mockMediator !== undefined) {
      this.isMediatorMocked = config.mockMediator
    } else {
      this.isMediatorMocked = true
    }

    if (config.roundSize % 4 !== 0) {
      throw Error(
        `Round size must be divisible by 4. Given: ${config.roundSize}`
      )
    }

    this.roundSize = config.roundSize
    this.quarterSize = this.roundSize / 4

    this.serverUrl = ''

    this.clients = []
  }

  /**
   * Initializes all the system components
   */
  async initializeAsync(): Promise<void> {
    // Fund operator
    if (this.config.operator.initialETH !== undefined) {
      await this.fundETHWalletAsync(
        this.operatorId.address,
        this.config.operator.initialETH
      )
    }

    await this.deployAssetContractsAsync()

    this.mediator = await this.deployMediatorAsync()
    this.mediatorUsedByOperator = new MediatorAsync(
      this.operatorId,
      this.mediator
    )

    this.metaLedger = this.makeLedger()
    this.operator = this.makeOperator()

    const exchangeConfig: ExchangeConfig = {
      decimalPlaces: 18,
      fee: {
        asset: this.getAssetContractAddress(OAX_CONTRACT_NAME),
        amount: CONSTANT_FEE
      }
    }

    this.exchange = this.makeExchange(exchangeConfig)

    await this.metaLedger.start()

    if (this.config.runServer) {
      await this.startServer()
    }
  }

  /**
   * Execute one round of commands, and make time progresses to the next round.
   *
   * Missing quarters are skipped.
   *
   * Waits for the last "new quarter" event to be detected by the operator.
   * @param round
   * @param config
   */
  async executeRoundAsync(
    round: FixtureRound,
    config?: ExecutorConfig
  ): Promise<void> {
    for (let quarter of ['Q0', 'Q1', 'Q2', 'Q3']) {
      if (round[quarter] !== undefined) {
        const commands = round[quarter]

        for (const cmd of commands) {
          await this.executeCommandAsync(cmd)
        }
      }

      if (config !== undefined && quarter === config.stopAtEndOfQuarter) {
        break
      }

      if (this.isMediatorMocked) {
        await this.skipToNextQuarterAndTriggerEvents()
      } else {
        await this.skipToNextQuarterNoMock()
      }
    }
  }

  /**
   * Executes a command without advancing time
   * @param cmd
   */
  async executeCommandAsync(cmd: ExecutorCommand): Promise<void> {
    await cmd.execute(this)
  }

  // ==============================
  // Contracts Setup
  // ==============================

  async deployContractAsync(
    contractName: string,
    constructorArgs: any[]
  ): Promise<Contract> {
    const factory = getContractFactory(contractName, this.deployer)
    const contract = await factory.deploy(...constructorArgs)

    await contract.deployed()

    return contract
  }

  /**
   * Deploys mediator with dev account and registers all assets
   */
  private async deployMediatorAsync(): Promise<MediatorMock | Mediator> {
    const contractName = this.isMediatorMocked ? 'MediatorMock' : 'Mediator'

    const mediator = await this.deployContractAsync(contractName, [
      this.config.roundSize,
      this.operatorId.address
    ])
    const operatorMediator = mediator.connect(this.operatorId)

    for (const contract of this.tokenContracts.values()) {
      await operatorMediator.functions.registerToken(contract.address)
    }

    if (this.isMediatorMocked) {
      return mediator as MediatorMock
    } else {
      return mediator as Mediator
    }
  }

  private async deployAssetContractsAsync(): Promise<void> {
    for (const asset of this.assets) {
      const contract = await this.deployContractAsync(asset, [])
      this.tokenContracts.set(asset, contract)
    }
  }

  // ==============================
  // Off-chain Components Setup
  // ==============================

  private makeLedger(): MetaLedger {
    const assetsAddress = this.assets.map(assetName =>
      this.getAssetContractAddress(assetName)
    )

    return new MetaLedger({
      assets: assetsAddress,
      operatorAddress: this.operatorId.address,
      mediatorAddress: this.getMediatorAddress()
    })
  }

  private makeExchange(config: ExchangeConfig = {}): Exchange {
    if (this.metaLedger === undefined) {
      throw Error('MetaLedger has not been setup. Did you call .start()?')
    }

    if (this.operator === undefined) {
      throw Error('Operator has not been setup. Did you call .start()?')
    }

    let exchange = new Exchange(this.operator, this.metaLedger, config)

    const OAXAddress = this.getAssetContractAddress(OAX_CONTRACT_NAME)
    const WETHAddress = this.getAssetContractAddress(WETH_CONTRACT_NAME)
    exchange.addAsset('OAX', OAXAddress)
    exchange.addAsset('WETH', WETHAddress)

    return exchange
  }

  /**
   * Create and fund
   */
  private makeOperator(): OperatorMock {
    return new OperatorMock(
      this.operatorId,
      new MediatorAsync(this.operatorId, this.getMediator(
        this.operatorId
      ) as MediatorMock),
      this.provider,
      this.getMetaLedger()
    )
  }

  /**
   * Launch the server
   */
  private async startServer() {
    let operator = this.operator
    let exchange = this.exchange

    this.server = new HTTPServer(operator!, exchange!, { port: 0 })
    await this.server.start()
    await this.server.listen()

    if (this.server.address === undefined) {
      throw Error('HTTP Server was not able to initialize properly')
    }

    this.serverUrl = `http://127.0.0.1:${this.server.address.port}`
  }

  /**
   * Cleanly shuts down the server
   */
  public async stopServer() {
    await this.server!.close()
  }

  private async fundETHWalletAsync(
    address: Address,
    amount: Amount
  ): Promise<void> {
    await fundEther(address, amount, this.deployer)
  }

  private async fundTokenWalletAsync(
    address: Address,
    tokenName: string,
    amount: Amount,
    signer: Signer
  ): Promise<void> {
    // Transform ETH into WETH
    const asset = this.getAssetContractAddress(tokenName)
    if (tokenName == WETH_CONTRACT_NAME) {
      await fundWETH(asset, amount, signer)
    } else {
      await fundToken(asset, address, amount, this.deployer)
    }
  }

  private async approveMediatorForToken(
    wallet: Identity,
    tokenName: string,
    amount: Amount
  ): Promise<void> {
    const erc20 = this.getAssetContract(tokenName, wallet)
    const tx = await erc20.functions.approve(
      await this.getMediatorAddress(),
      amount.toString(10)
    )
    await tx.wait()
  }

  private getHTTPClient(): HTTPClient {
    let httpClient: HTTPClient

    if (this.config.runServer) {
      httpClient = new HTTPClient(new URL(this.serverUrl))
    } else {
      httpClient = new InMemoryTransportClient(this)
    }

    return httpClient
  }

  // ==============================
  // Time manipulation
  // ==============================

  /**
   * Skip to the next quarter with a real mediator.
   * Done by waiting for several blocks in a row until the next quarter is reached.
   */
  async skipToNextQuarterNoMock(): Promise<void> {
    const mediator = this.mediatorUsedByOperator!
    const quarter = await mediator.getCurrentQuarter()
    logger.info(
      `skipping quarter: Round ${await mediator.getCurrentRound()} / Quarter ${quarter}`
    )

    while (quarter == (await mediator.getCurrentQuarter())) {
      const events = [
        this.waitForEventOperator('onNewBlockProcessed'),
        ...this.clients.map(c => c.waitForEvent('onNewBlockProcessed'))
      ]

      const tx = await this.deployer.sendTransaction({
        to: AddressZero,
        value: 0
      })
      await tx.wait()

      for (const event of events) {
        await event
      }
    }
  }

  /**
   * Skip to the next quarter with a mocked mediator.
   * Done by setting the new quarter directly into the mediator
   * and waiting for the events to be processed
   */
  public async skipToNextQuarterMock() {
    const newBlockProcessedOperator = this.waitForEventOperator(
      'onNewBlockProcessed'
    )

    const blockNumberInit: number = await this.provider.getBlockNumber()

    await this.mediatorUsedByOperator!.skipToNextQuarter()

    const events = [
      this.waitForEventOperator('onNewBlockProcessed'),
      ...this.clients.map(c => c.waitForEvent('onNewBlockProcessed'))
    ]

    // Fill the current block with transactions to trigger the onNewBlock event

    while (blockNumberInit === (await this.provider.getBlockNumber())) {
      const tx = await this.deployer.sendTransaction({
        to: AddressZero,
        value: 0
      })
      await tx.wait()
    }

    for (const event of events) {
      await event
    }

    await newBlockProcessedOperator
  }

  // ==============================
  // Getters
  // ==============================

  getMediator(signer: Signer): Mediator | MediatorMock {
    if (this.mediator === undefined) {
      throw Error('Mediator has not been setup. Did you call .start()?')
    }

    const signerMediator = this.mediator.connect(signer)

    if (this.isMediatorMocked) {
      return signerMediator as MediatorMock
    } else {
      return signerMediator as Mediator
    }
  }

  /**
   * Returns a MediatorAsync object where the signer is the operator
   */
  getMediatorOperatorAsync(): MediatorAsync {
    if (this.mediator === undefined) {
      throw Error('Mediator has not been setup. Did you call .start()?')
    }

    return new MediatorAsync(this.operatorId, this.mediator)
  }

  getMediatorAddress(): Address {
    if (this.mediator === undefined) {
      throw Error('Mediator has not been setup. Did you call .start()?')
    }

    return this.mediator.address
  }

  getMetaLedger(): MetaLedger {
    if (this.metaLedger === undefined) {
      throw Error('MetaLedger has not been setup. Did you call .start()?')
    }

    return this.metaLedger
  }

  getExchange(): Exchange {
    if (this.exchange === undefined) {
      throw Error('Exchange has not been setup. Did you call .start()?')
    }

    return this.exchange
  }

  getOperator(): OperatorMock {
    if (this.operator === undefined) {
      throw Error('Operator has not been setup. Did you call .start()?')
    }

    return this.operator
  }

  getAssetContract(assetName: string, signer: Signer): ERC20 {
    const contract = this.tokenContracts.get(assetName)

    if (contract === undefined) {
      throw Error(
        `Contract '${assetName}' has not been deployed. Did you call .start()?`
      )
    }

    return contract.connect(signer) as ERC20
  }

  getAssetContractAddress(assetName: string): Address {
    const contract = this.tokenContracts.get(assetName)

    if (contract === undefined) {
      throw Error(
        `Contract '${assetName}' has not been deployed. Did you call .start()?`
      )
    }

    return contract.address
  }

  /**
   * Returns the (personal balance) of a user for an asset
   * @param assetName: name of the asset
   * @param signer: signer object of the client
   */
  async getBalance(assetName: string, signer: Signer): Promise<Amount> {
    const contract = this.getAssetContract(assetName, signer)
    const clientAddress = await signer.getAddress()
    const amountUser: Amount = D(
      (await contract.functions.balanceOf(clientAddress)).toString()
    )

    return amountUser
  }

  async getAuthorizationAsync(
    signer: Signer,
    round: Round
  ): Promise<IAuthorizationMessage> {
    const operator: Operator = this.getOperator()
    const clientAddress = await signer.getAddress()

    const authorizationMessage = await operator.computeAuthorizationMessage(
      clientAddress,
      round
    )
    return authorizationMessage
  }

  /**
   * Get a hub client and insert it into the fixture state
   */
  async getClientAsync(config: SignerConfig): Promise<L2ClientForTest> {
    const identity = await this.getIdentityAsync(config)

    let httpClient: HTTPClient

    httpClient = this.getHTTPClient()

    const clientConfig = {
      operatorAddress: this.getOperator().address,
      mediator: this.getMediatorAddress()
    }

    const client = new L2ClientForTest(identity, httpClient, clientConfig)

    await client.init()

    this.clients.push(client)

    return client
  }

  /**
   * Gets the exchange client from the L2 client.
   * @param l2Client: l2 client from which we want to obtain the exchange client
   * @returns exchange client based on the l2 client and the fixture exchange
   */
  getExchangeClient(l2Client: L2ClientForTest): ExchangeClient {
    //Generate a different nonce for each client
    // const nonce = '0x' + randomBytes(32).toString('hex')

    const exchangeClient = new ExchangeClient(
      l2Client.identity,
      l2Client,
      this.exchange!.getAssetsRegistry(),
      {
        transport: this.getHTTPClient(),
        mediatorAddress: this.mediator!.address,
        fee: {
          asset: this.getAssetContractAddress(OAX_CONTRACT_NAME),
          amount: CONSTANT_FEE
        }
      }
    )

    return exchangeClient
  }

  /**
   * Returns the current round using the mediator
   */
  async getCurrentRound(): Promise<Round> {
    const res = (await this.getMediator(
      this.operatorId
    ).functions.getCurrentRound()).toNumber() as Round

    return res
  }

  /**
   * Returns the current quarter using the mediator
   */
  async getCurrentQuarter(): Promise<Quarter> {
    const res = (await this.getMediator(
      this.operatorId
    ).functions.getCurrentQuarter()).toNumber() as Quarter

    return res
  }

  /**
   * Get a wallet and insert it into the fixture state
   * @param config
   */
  async getIdentityAsync(config: SignerConfig): Promise<Identity> {
    const signer = new PrivateKeyIdentity(undefined, this.provider)

    // Fund with ETH
    if (config.initialETH !== undefined) {
      await this.fundETHWalletAsync(signer.address, config.initialETH)
    }

    // Fund with tokens
    if (config.initialTokens !== undefined) {
      for (const token of Object.entries<Amount>(config.initialTokens)) {
        const [tokenName, amount] = token
        await this.fundTokenWalletAsync(
          signer.address,
          tokenName,
          amount,
          signer
        )
      }
    }

    // Approve mediator for transfer
    if (config.approveMediatorForTransfer !== undefined) {
      for (const token of Object.entries<Amount>(
        config.approveMediatorForTransfer
      )) {
        const [tokenName, amount] = token
        await this.approveMediatorForToken(signer, tokenName, amount)
      }
    }

    return signer
  }

  // ==============================
  // Check functions
  // ==============================

  public async checkNumberOfCommits(
    expectedNumberOfCommits: number
  ): Promise<boolean> {
    let res: boolean

    let currentRound = await this.mediatorUsedByOperator!.getCurrentRound()

    const commitsCounterCurrentRound = await this.mediatorUsedByOperator!.getContractWrapper().functions.commitCounters(
      currentRound
    )

    res = commitsCounterCurrentRound == expectedNumberOfCommits

    const commitsCounterNextRound = await this.mediatorUsedByOperator!.getContractWrapper().functions.commitCounters(
      currentRound + 1
    )

    res = res && commitsCounterNextRound == 0

    return res
  }

  // ==============================
  // Events handling
  // ==============================

  /**
   * Enables the operator to wait for a specific event
   * @param eventName Name of the event to wait for
   * @returns promise of the event
   */
  public waitForEventOperator(eventName: string): Promise<any> {
    const eventHandler = new Promise(resolve =>
      this.getOperator().once(eventName, resolve)
    )

    return eventHandler
  }

  /**
   * Enables to skip to the next quarter
   * while ensuring that the operator updates his internal state.
   * as well as the clients.
   */
  public async skipToNextQuarterAndTriggerEvents() {
    if (this.isMediatorMocked) {
      await this.skipToNextQuarterMock()
    } else {
      await this.skipToNextQuarterNoMock()
    }
  }

  /**
   * Enables to skip to the next quarter
   * but does not trigger any event
   */
  public async skipToNextQuarter() {
    await this.mediatorUsedByOperator!.skipToNextQuarter()
  }

  /**
   * Enables to skip to the next round
   * while ensuring that the operator updates his internal state
   * as well as the clients.
   */
  public async skipToNextRoundAndTriggerEvents() {
    const round = await this.mediatorUsedByOperator!.getCurrentRound()
    await this.skipToNextQuarterAndTriggerEvents()

    while (round === (await this.mediatorUsedByOperator!.getCurrentRound())) {
      await this.skipToNextQuarterAndTriggerEvents()
    }
  }

  /**
   * Skip to next round w/o triggering events.
   * Only works when the mediator is mocked.
   */
  public async skipToNextRoundNoEvent() {
    if (!this.isMediatorMocked) {
      throw Error('This method can only be called when the mediator is mocked')
    }

    await this.mediatorUsedByOperator!.skipToNextRound()
  }
}

// ==============================
// Commands
// ==============================

/**
 * Make a wallet join the exchange
 */
export class JoinCommand implements ExecutorCommand {
  constructor(private readonly client: Identity | L2ClientForTest) {}

  async execute(fixtures: SystemFixture): Promise<void> {
    if (this.client instanceof Signer) {
      const exchange = fixtures.getExchange()
      const address = await this.client.getAddress()
      const addrSig = await this.client.hashAndSign(address)

      await exchange.admit(this.client.address, addrSig)
    } else {
      await this.client.join()
    }
  }
}

/**
 * Deposits token for a wallet into the mediator
 */
export class SignerDepositCommand implements ExecutorCommand {
  constructor(
    private readonly wallet: Identity,
    private readonly assetName: string,
    private readonly amount: Amount
  ) {}

  async execute(fixtures: SystemFixture): Promise<void> {
    const mediator = fixtures.getMediator(this.wallet)
    const assetAddress = fixtures.getAssetContractAddress(this.assetName)
    const amount = this.amount.toString(10)

    const operatorReceivedDeposit = fixtures.waitForEventOperator(
      'depositEventReceived'
    )

    const tx = await mediator.functions.depositTokens(assetAddress, amount)
    await tx.wait()

    await operatorReceivedDeposit

    let assetBalances = fixtures.balances.get(this.assetName)

    if (assetBalances === undefined) {
      assetBalances = new Map()
      fixtures.balances.set(this.assetName, assetBalances)
    }

    const currentBalance = assetBalances.get(this.wallet.address) || D('0')

    assetBalances.set(this.wallet.address, currentBalance.plus(amount))
  }
}

/**
 * Deposit some amount using through a Client object
 */
export class ClientDepositCommand implements ExecutorCommand {
  constructor(
    private readonly client: L2ClientForTest,
    private readonly assetName: string,
    private readonly amount: Amount
  ) {}

  async execute(fixtures: SystemFixture): Promise<void> {
    const assetAddress = fixtures.getAssetContractAddress(this.assetName)

    const operatorReceivedDeposit = fixtures.waitForEventOperator(
      'depositEventReceived'
    )

    // Need to mock this.client.getRoundFromBlockNumber() when we are mocking the mediator
    const currentRound = await fixtures.getCurrentRound()
    jest
      .spyOn(this.client, 'getRoundFromBlockNumber')
      .mockResolvedValue(currentRound)

    await this.client.deposit(assetAddress, this.amount, false)

    await operatorReceivedDeposit
  }
}

export class ClientWithdrawCommand implements ExecutorCommand {
  constructor(
    private readonly client: L2ClientForTest,
    private readonly assetAddress: Address,
    private readonly amount: Amount
  ) {}

  async execute(fixtures: SystemFixture): Promise<void> {
    const operatorReceivedInitWithdrawalEvent = fixtures.waitForEventOperator(
      'withdrawalRequestReceived'
    )

    await this.client.withdraw(this.assetAddress, this.amount)

    await operatorReceivedInitWithdrawalEvent
  }
}

/**
 * Client makes an audit
 */

export class ClientAuditCommand implements ExecutorCommand {
  constructor(private readonly client: L2ClientForTest) {}

  async execute(_fixtures: SystemFixture): Promise<void> {
    const auditCompleteEvent = this.client.waitForEvent('auditComplete')

    await this.client.audit()

    await auditCompleteEvent
  }
}

/**
 * Executes a withdrawal.
 *
 * Waits for the operator to have received the withdrawal before finishing
 */
export class SignerWithdrawalCommand implements ExecutorCommand {
  constructor(
    private readonly signer: Signer,
    private readonly proof: Proof,
    private readonly amount: Amount
  ) {}

  async execute(fixtures: SystemFixture): Promise<void> {
    const withdrawerMediator = fixtures.getMediator(this.signer)

    const operatorHasWithdrawalReq = fixtures.waitForEventOperator(
      'withdrawalRequestReceived'
    )

    await withdrawerMediator.functions.initiateWithdrawal(
      this.proof.toSol(),
      toEthersBn(this.amount).toString()
    )

    await operatorHasWithdrawalReq
  }
}

/**
 * Opens a balance dispute
 *
 * Waits for the operator to have received the dispute event
 */
export class SignerDispute implements ExecutorCommand {
  constructor(
    private readonly signer: Identity,
    private readonly proofs: Proof[],
    private readonly fills: FillMediator[],
    private readonly fillSigs: Signature[]
  ) {}

  async execute(fixtures: SystemFixture): Promise<void> {
    const signerMediator = fixtures.getMediator(this.signer)

    const currentRound = await fixtures.getCurrentRound()
    let authorization = await fixtures.getAuthorizationAsync(
      this.signer,
      currentRound - 1
    )

    const operatorHasWithdrawalReq = fixtures.waitForEventOperator(
      'disputeReceived'
    )

    await signerMediator.openDispute(
      this.proofs.map(p => p.toSol()),
      this.fills.map(f => f.toSol()),
      this.fillSigs,
      authorization
    )

    await operatorHasWithdrawalReq
  }
}

/**
 * Let the operator close all the opened disputes.
 */
export class OperatorClosesDispute implements ExecutorCommand {
  constructor(
    private readonly roundOfDispute: Round,
    private readonly clientAddress: Address
  ) {}

  async execute(fixtures: SystemFixture): Promise<void> {
    const waitForClosedDisputesEvent = fixtures.waitForEventOperator(
      'disputeProcessed'
    )

    const operator = fixtures.getOperator()

    const openDispute: IBalanceDispute = {
      round: this.roundOfDispute,
      wallet: this.clientAddress,
      status: 'open'
    }

    await operator.closeDispute(openDispute)

    await waitForClosedDisputesEvent
  }
}

// ==============================
// Helpers
// ==============================

export async function createSystemFixture(
  config: SystemFixtureConfig
): Promise<SystemFixture> {
  const fixtures = new SystemFixture(config)
  await fixtures.initializeAsync()

  return fixtures
}
