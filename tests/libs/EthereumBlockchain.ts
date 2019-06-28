// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import {
  getContractFactory,
  waitForMining
} from '../../src/common/ContractUtils'
import { Contract, providers, Signer, utils } from 'ethers'
import { BigNumber } from 'bignumber.js'
import { D, toEthersBn } from '../../src/common/BigNumberUtils'
import { SolvencyTree } from '../../src/common/accounting/SolvencyTree'
import {
  IAccount,
  Address,
  Amount,
  SignatureSol,
  Round,
  Signature
} from '../../src/common/types/BasicTypes'

import { IRootInfo } from '../../src/common/types/OperatorAndClientTypes'

import { arrayify, hexlify } from 'ethers/utils'
import { MediatorMock } from '../../src/contracts/wrappers/MediatorMock'
import {
  IAuthorizationMessage,
  Proof
} from '../../src/common/types/SmartContractTypes'

import { FillMediator } from '../../src/common/types/Fills'

import { IApproval, Approval } from '../../src/common/types/Approvals'

import { OAXToken } from '../../src/contracts/wrappers/OAXToken'
import { ETHToken } from '../../src/contracts/wrappers/ETHToken'
import { TokenAsync, MediatorAsync } from '../../src/common/mediator/Contracts'
import { GETH_RPC_URL } from '../../config/environment'

//Global parameters of the blockchain
export const ROUNDSIZE = 100

export const NULL_ADDRESS = '0x0000000000000000000000000000000000000000'
export const SOME_ADDRESS = '0x6f663747290000CC618f1D1081EEB40479E0F3Ae'

const INITIAL_AMOUNT_USERS = utils.parseEther('100').toTwos(10)
export const INITIAL_AMOUNT_OAX_TOKENS = D('1000')

export const ALICE_INDEX = 0
export const BOB_INDEX = 1

export const NULL_SIG =
  '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'

export const NULL_AUTHORIZATION_MESSAGE: IAuthorizationMessage = {
  clientAddress: NULL_ADDRESS,
  round: 0,
  sig: NULL_SIG
}

export class EthereumBlockchain {
  public operator: Signer
  public alice: Signer
  public eve: Signer
  public bob: Signer
  public thejoker: Signer
  private _contract?: MediatorMock
  private OAXTokenContract?: OAXToken
  private WETHTokenContract?: ETHToken
  public provider: providers.JsonRpcProvider
  public signer: Signer

  private bobAddress?: Address
  private eveAddress?: Address
  private aliceAddress?: Address
  private thejokerAddress?: Address
  private operatorAddress?: Address

  constructor(pollingInterval: number = 10) {
    //Initializes the operator and other participants

    this.provider = new providers.JsonRpcProvider(GETH_RPC_URL)
    this.provider.pollingInterval = pollingInterval

    this.signer = this.provider.getSigner()
    this.operator = this.provider.getSigner(1)
    this.alice = this.provider.getSigner(2)
    this.bob = this.provider.getSigner(3)
    this.eve = this.provider.getSigner(4)
    this.thejoker = this.provider.getSigner(5)
  }

  public async start() {
    this.bobAddress = await this.bob.getAddress()
    this.aliceAddress = await this.alice.getAddress()
    this.operatorAddress = await this.operator.getAddress()
    this.eveAddress = await this.eve.getAddress()
    this.thejokerAddress = await this.thejoker.getAddress()
    await this.fillWalletsWithETH()
  }

  public async deploy(roundSize = ROUNDSIZE) {
    const OAXContracAddress = await this.deployOAXTokenContract()
    const WETHContractAddress = await this.deployETHTokenContract()
    await this.deployMediatorContract(roundSize)
    const contractUsedByOperator = await this.getMediatorContract(this.operator)
    await contractUsedByOperator.registerToken(WETHContractAddress)
    await contractUsedByOperator.registerToken(OAXContracAddress)

    await this.fillWalletsWithOAX()
  }

  public async fillWalletETH(address: Address | undefined) {
    await waitForMining(
      this.signer.sendTransaction({
        to: address,
        value: INITIAL_AMOUNT_USERS
      })
    )
  }

  public async fillWalletOAX(address: Address) {
    //OAX Tokens
    await waitForMining(
      this.OAXTokenContract!.functions.transfer(
        address,
        INITIAL_AMOUNT_OAX_TOKENS.toString(10)
      )
    )
  }

  private async fillWalletsWithETH() {
    //ETHERS
    await this.fillWalletETH(this.operatorAddress)
    await this.fillWalletETH(this.aliceAddress)
    await this.fillWalletETH(this.bobAddress)
    await this.fillWalletETH(this.eveAddress)
    await this.fillWalletETH(this.thejokerAddress)
  }

  private async fillWalletsWithOAX() {
    await this.fillWalletOAX(this.bobAddress!)
    await this.fillWalletOAX(this.aliceAddress!)
  }

  get contract(): MediatorMock {
    return this._contract!
  }

  get OAXContract(): OAXToken {
    return this.OAXTokenContract!
  }

  get WETHContract(): ETHToken {
    return this.WETHTokenContract!
  }

  public getMediatorContract(signer: Signer): MediatorAsync {
    return new MediatorAsync(signer, this._contract!)
  }

  public getOAXTokenContract(signer: Signer): TokenAsync {
    return new TokenAsync(signer, this.OAXContract)
  }

  public getWETHTokenContract(signer: Signer): TokenAsync {
    return new TokenAsync(signer, this.WETHContract)
  }

  public async goToRound0() {
    return waitForMining(this.contract.functions.goToRound0())
  }

  public async skipToNextRound() {
    return waitForMining(this.contract.functions.skipToNextRound())
  }

  public async halt() {
    return waitForMining(this.contract.functions.halt())
  }

  public async skipBlocks(n: number) {
    await waitForMining(this.contract.functions.skipBlocks(n))
  }

  public async skipToNextQuarter() {
    await waitForMining(this.contract.functions.skipToNextQuarter())
    //Add extra time some that events can be processed
    await delay(200)
  }

  private async deployOAXTokenContract(): Promise<Address> {
    const factory = getContractFactory('OAXToken', this.signer)
    this.OAXTokenContract = (await factory.deploy()) as OAXToken
    await this.OAXTokenContract.deployed()

    return this.OAXContract.address
  }

  private async deployETHTokenContract(): Promise<Address> {
    const factory = getContractFactory('ETHToken', this.signer)
    this.WETHTokenContract = (await factory.deploy()) as ETHToken
    await this.WETHTokenContract.deployed()
    return this.WETHContract.address
  }

  private async deployMediatorContract(roundSize: number) {
    const operatorAddress = await this.operator.getAddress()
    const factory = getContractFactory('MediatorMock', this.signer)

    this._contract = (await factory.deploy(
      roundSize,
      operatorAddress
    )) as MediatorMock
    await this._contract.deployed()
  }
}

export class BlockchainClient {
  signer: Signer
  blockchain: EthereumBlockchain
  MediatorContractAddress: string

  constructor(signer: Signer, blockchain: EthereumBlockchain) {
    this.signer = signer
    this.blockchain = blockchain
    this.MediatorContractAddress = blockchain.contract.address
  }

  /*
   * This methods converts ethers into Ethers tokens and then deposits
   *  the tokens inside the Mediator contract
   * @param amount amount in wei to deposit
   */
  public async depositWETHTokensIntoMediator(amount: BigNumber) {
    //Get the ETH tokens
    await this.depositWETHTokens(amount)

    //Transfer the tokens to the Mediator
    const WETHTokenContract = this.blockchain.getWETHTokenContract(this.signer)

    await WETHTokenContract.approve(this.blockchain.contract.address, amount)
    const MediatorUsedByClient = this.blockchain.getMediatorContract(
      this.signer
    )
    await MediatorUsedByClient.depositsToken(
      WETHTokenContract.contractAddress,
      amount
    )
  }

  /**
   * This methods enables a client to deposit OAX tokens into the Mediator contract
   * @param amount amount in wei to deposit
   * */
  public async depositOAXTokensIntoMediator(amount: BigNumber) {
    //Transfer the tokens to the Mediator
    const OAXTokenContract = this.blockchain.getOAXTokenContract(this.signer)

    await OAXTokenContract.approve(this.blockchain.contract.address, amount)
    const MediatorUsedByClient = this.blockchain.getMediatorContract(
      this.signer
    )
    await MediatorUsedByClient.depositsToken(
      OAXTokenContract.contractAddress,
      amount
    )
  }

  public async depositWETHTokens(amount: BigNumber) {
    let WETHTokenContractAddress = this.blockchain.WETHContract.address

    await waitForMining(
      this.signer.sendTransaction({
        to: WETHTokenContractAddress,
        value: toEthersBn(amount)
      })
    )
  }

  async getAddress(): Promise<string> {
    return this.signer.getAddress()
  }

  public async getBalance(): Promise<BigNumber> {
    const provider = this.signer.provider!
    const address = await this.signer.getAddress()
    const balanceObj = await provider.getBalance(address)
    return D(balanceObj)
  }

  /**
   * Returns the balance of the client in ETH tokens
   */
  public async getBalanceWETHToken(): Promise<BigNumber> {
    const ETHTokenContract = this.blockchain.getWETHTokenContract(this.signer)
    const myAddress = await this.signer.getAddress()
    const res = await ETHTokenContract.balanceOf(myAddress)
    return res
  }

  async signApproval(approvParams: IApproval): Promise<SignatureSol> {
    const approvParamsObj = new Approval(approvParams)
    const hash = approvParamsObj.createDigest()

    const sig = await this.signer.signMessage(arrayify(hash))
    const sigAsBytes = [...arrayify(sig)].map(hexlify)
    return sigAsBytes
  }
}

class AccountsTree {
  accounts: IAccount[]
  tree: SolvencyTree

  constructor(accounts: IAccount[]) {
    this.accounts = accounts
    this.tree = new SolvencyTree(accounts)
  }

  public setAccounts(accounts: IAccount[]) {
    this.tree = new SolvencyTree(accounts)
  }

  public getRoot() {
    return this.tree.getRoot()
  }

  public getProofHashes(position: number): string[] {
    const account = this.accounts[position]
    return this.tree.getLiabilities(account).map(n => n.hash)
  }

  public getProofSums(position: number): BigNumber[] {
    const account = this.accounts[position]
    return this.tree.getLiabilities(account).map(n => n.sum)
  }

  public computeProof(
    position: number,
    tokenAddress: Address,
    round: Round
  ): Proof {
    const hashes = this.getProofHashes(position)
    const sums = this.getProofSums(position)

    const amount = this.accounts[position].sum
    const address = this.accounts[position].address

    const height = this.tree.getHeight()
    const width = this.tree.getWidth()

    let proof = new Proof(
      amount,
      address,
      hashes,
      sums,
      tokenAddress,
      height,
      width,
      round
    )

    return proof
  }
}

export interface AccountsTreeHash {
  [tokenAddress: string]: AccountsTree
}

export class OperatorBlockchain {
  signer: Signer
  blockchain: EthereumBlockchain
  contractAddress: string
  accountsTreeHash: AccountsTreeHash

  constructor(blockchain: EthereumBlockchain) {
    this.blockchain = blockchain
    this.signer = blockchain.operator
    this.contractAddress = this.blockchain.contract.address
    this.accountsTreeHash = {}
  }

  public setAccounts(accounts: IAccount[], tokenAddress: Address) {
    this.accountsTreeHash[tokenAddress] = new AccountsTree(accounts)
  }

  public getRootInfo(tokenAddress: Address): IRootInfo {
    return this.accountsTreeHash[tokenAddress].tree.getRootInfo()
  }

  public computeProof(
    position: number,
    tokenAddress: Address,
    round: Round
  ): Proof {
    return this.accountsTreeHash[tokenAddress].computeProof(
      position,
      tokenAddress,
      round
    )
  }

  public async getDummyAuthorizationMessage(): Promise<IAuthorizationMessage> {
    const message = '0x0000000000000000000000000000000000000'
    const sig = await this.signHash(message)
    return { clientAddress: SOME_ADDRESS, round: 0, sig: sig }
  }

  /**
   * Computes the authorization message from the client's address
   * @param clientAddress: address of the client expecting the authorization
   */
  public async computeAuthorizationMessage(
    clientAddress: Address,
    round: Round
  ): Promise<IAuthorizationMessage> {
    const hash = utils.solidityKeccak256(
      ['address', 'uint256'],
      [clientAddress, round]
    )

    const sig = await this.signHash(hash)

    const authorizationMessage: IAuthorizationMessage = {
      clientAddress: clientAddress,
      round: round,
      sig: sig
    }
    return authorizationMessage
  }

  private async signHash(input: string): Promise<Signature> {
    const digest = arrayify(input)
    const sig = await this.signer.signMessage(digest)
    return sig
  }

  private async signHashSol(input: string): Promise<SignatureSol> {
    const digest = arrayify(input)
    const sig = await this.signer.signMessage(digest)
    const sigAsBytes = [...arrayify(sig)].map(hexlify)
    return sigAsBytes
  }

  public async signFill(fill: FillMediator): Promise<SignatureSol> {
    const fillsSummaryHash = fill.createDigest()
    return await this.signHashSol(fillsSummaryHash)
  }
}

/**
 * Emables to log some interval variable of the smart contract.
 * Example of use:
 *  let showAddressEvent = new EventManager(contract).getEvent('ShowAddress')
 *   // Do something with the smart contract
 *  let event = await showAddressEvent
 *  console.log(event)
 */
export class EventManager {
  contract: Contract

  constructor(contract: Contract) {
    this.contract = contract
  }

  public async getEvent(eventName: string) {
    const event = new Promise((resolve, reject) => {
      this.contract.on(eventName, (value, event) => {
        event.removeListener()

        resolve({
          value: value
        })
      })

      setTimeout(() => {
        reject(new Error('timeout'))
      }, 60000)
    })

    return event
  }
}

export async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Helper function to set the balances of participants
 * @param aliceAddress address of Alice
 * @param bobAddress address of Bob
 * @param aliceBalances array of dimension 2 with the balances of Alice.
 *        aliceBalances[0] WETH deposit
 *        aliceBalances[1] OAX deposit
 * @param bobBalances array of dimension 2 with the balances of Bob.
 *        bobBalances[0] WETH deposit
 *        aliceBalances[1] OAX deposit
 * @param blockchain blockchain object that contains the addresses of the contracts
 * @param operator operator object that will set the accounts
 */
export async function setBalancesAndCommit(
  aliceAddress: Address,
  bobAddress: Address,
  aliceBalances: Amount[],
  bobBalances: Amount[],
  blockchain: EthereumBlockchain,
  operator: OperatorBlockchain
) {
  const round = await blockchain
    .getMediatorContract(operator.signer)
    .getCurrentRound()

  const accountsETH = [
    { address: aliceAddress, sum: aliceBalances[0], round: round },
    { address: bobAddress, sum: bobBalances[0], round: round },
    {
      address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
      sum: D('0'),
      round: round
    },
    {
      address: '0x408e05ee6c7051509dca1875829b57486ef29b26',
      sum: D('0'),
      round: round
    }
  ]

  const accountsOAX = [
    { address: aliceAddress, sum: aliceBalances[1], round: round },
    { address: bobAddress, sum: bobBalances[1], round: round },
    {
      address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
      sum: D('0'),
      round: round
    },
    {
      address: '0x408e05ee6c7051509dca1875829b57486ef29b26',
      sum: D('0'),
      round: round
    }
  ]

  operator.setAccounts(accountsETH, blockchain.WETHContract.address)
  operator.setAccounts(accountsOAX, blockchain.OAXContract.address)

  const contractUsedByOperator = blockchain.getMediatorContract(
    blockchain.operator
  )

  const rootETH = operator.getRootInfo(blockchain.WETHContract.address)
  const rootOAX = operator.getRootInfo(blockchain.OAXContract.address)

  await contractUsedByOperator.commit(rootETH, blockchain.WETHContract.address)
  await contractUsedByOperator.commit(rootOAX, blockchain.OAXContract.address)
}

/**
 * Helper function in order to execute the round operations easily
 * @param contractUsedByOperator
 * @param blockchain blockchain object
 * @param operator OperatorBlockchain object
 * @param aliceAddress Alice Address
 * @param bobAddress Bob Address
 * @param aliceETH Alice's WETH balance at the beginning of the round
 * @param aliceOAX Alice's OAX balance at the beginning of the round
 * @param bobETH Bob's WETH balance at the beginning of the round
 * @param bobOAX Bob's OAX balance at the beginning of the round
 */
export async function setUpRound(
  blockchain: EthereumBlockchain,
  operator: OperatorBlockchain,
  aliceAddress: Address,
  bobAddress: Address,
  aliceETH: Amount,
  aliceOAX: Amount,
  bobETH: Amount,
  bobOAX: Amount
) {
  const round = await blockchain
    .getMediatorContract(operator.signer)
    .getCurrentRound()

  await setBalancesAndCommit(
    aliceAddress,
    bobAddress,
    [aliceETH, aliceOAX],
    [bobETH, bobOAX],
    blockchain,
    operator
  )

  const proofETHDisputeRoundAlice = operator.computeProof(
    ALICE_INDEX,
    blockchain.WETHContract.address,
    round
  )

  const proofOAXDisputeRoundAlice = operator.computeProof(
    ALICE_INDEX,
    blockchain.OAXContract.address,
    round
  )

  const proofETHDisputeRoundBob = operator.computeProof(
    BOB_INDEX,
    blockchain.WETHContract.address,
    round
  )

  //Compute a proof for bob
  const proofOAXDisputeRoundBob = operator.computeProof(
    BOB_INDEX,
    blockchain.OAXContract.address,
    round
  )

  const res = {
    proofETHAlice: proofETHDisputeRoundAlice,
    proofOAXAlice: proofOAXDisputeRoundAlice,
    proofETHBob: proofETHDisputeRoundBob,
    proofOAXBob: proofOAXDisputeRoundBob
  }
  return res
}
