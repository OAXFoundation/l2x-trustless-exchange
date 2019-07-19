// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest */

// import memfs from 'memfs'

import 'jest'
import { JsonRpcProvider, TransactionReceipt } from 'ethers/providers'
import { HashZero } from 'ethers/constants'

import { DepositEvent, IAccount, Round } from '../src/common/types/BasicTypes'
import { PrivateKeyIdentity } from '../src/common/identity/PrivateKeyIdentity'
import { Operator } from '../src/server/operator/Operator'
import { IMediatorAsync } from '../src/common/mediator/IMediatorAsync'
import { MockMediatorAsync } from '../src/server/mediator/MockMediatorAsync'
import { SolvencyTree } from '../src/common/accounting/SolvencyTree'
import { D, toEthersBn } from '../src/common/BigNumberUtils'
import { Identity } from '../src/common/identity/Identity'
import { exchangeFixtures } from './libs/fixtures/Exchange.fixture'
import { MetaLedger } from '../src/common/accounting/MetaLedger'
import { mkRandomHash } from './libs/CryptoUtils'

describe('Off-chain OperatorBlockchain', () => {
  const operatorId = new PrivateKeyIdentity()
  const alice = new PrivateKeyIdentity()
  const bob = new PrivateKeyIdentity()
  let provider = new JsonRpcProvider()
  const USD = exchangeFixtures.USD
  const BTC = exchangeFixtures.BTC
  let mediator: IMediatorAsync
  let operator: Operator
  let metaLedger: MetaLedger
  let mockedCommit: any

  beforeEach(async () => {
    mediator = new MockMediatorAsync()
    metaLedger = new MetaLedger({
      assets: [USD, BTC],
      operatorAddress: operatorId.address,
      mediatorAddress: mediator.contractAddress
    })

    await metaLedger.start()

    operator = new Operator(operatorId, mediator, provider, metaLedger)

    jest.spyOn(mediator, 'totalDeposits').mockResolvedValue(D('0'))
    jest.spyOn(mediator, 'getCommit').mockResolvedValue(HashZero)
    mockedCommit = jest.spyOn(mediator, 'commit')
    mockedCommit.mockResolvedValue({} as TransactionReceipt)
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Scenario: admitting a user', () => {
    it(`Given that a user has already been registered in a round r
        when admit is called again for a user
        an authorization message for round r is returned`, async () => {
      await operator.admit(alice.address)
      const roundJoined = await operator.getCurrentRound()

      // advance time by 1 round
      jest.spyOn(mediator, 'getCurrentRound').mockResolvedValue(roundJoined + 1)
      const currentRound = await operator.getCurrentRound()

      const authMsg = await operator.admit(alice.address)

      expect(currentRound).toEqual(roundJoined + 1)
      expect(authMsg.round).toEqual(roundJoined)
    })
  })

  describe('create', () => {
    beforeEach(async () => {
      await metaLedger.register(alice.address, 0)
      await metaLedger.register(bob.address, 0)
    })

    it('creates an openingBalance commit at the start of a new round', async () => {
      const round = 1
      await operator.goToRound(1)
      const commit = await operator.getCommit(USD, round)
      const accounts = emptyUserAccounts([operatorId, alice, bob], round)

      const tree = new SolvencyTree(accounts)
      expect(commit).toEqual(tree.getRootInfo())
    })
  })
  describe('commit', () => {
    beforeEach(async () => {
      await metaLedger.register(alice.address, 0)
      await metaLedger.register(bob.address, 0)
    })

    it('commits openingBalance merkle tree to Mediator within first quarter', async () => {
      await operator.goToRound(1)

      const commit = await operator.getCommit(USD, 1)
      expect(mockedCommit).toHaveBeenCalledWith(commit, USD)
    })
  })

  describe('handles deposits', () => {
    beforeEach(async () => {
      await metaLedger.register(alice.address, 0)
    })

    it('shows that the correct round of the deposit is stored in metaledger', async () => {
      const depositAmount = D('100')

      const event: DepositEvent = [
        toEthersBn(D('0')),
        USD,
        alice.address,
        toEthersBn(depositAmount),
        { transactionHash: mkRandomHash() }
      ]

      const balanceBefore = await metaLedger.balance(USD, alice.address, 0)

      // We change on purpose the operator round to 1 to ensure that it is the round of the deposit
      // that is considered

      await operator.goToRound(1)

      await operator.onDeposit(event)

      const balanceAfter = await metaLedger.balance(USD, alice.address, 0)

      expect(balanceAfter).toEqual(balanceBefore.plus(D('100')))
    })
  })

  describe('provide openingBalance proof', () => {
    beforeEach(async () => {
      await metaLedger.register(alice.address, 0)
      await metaLedger.register(bob.address, 0)
    })

    it('proof of openingBalance auditing works', async () => {
      const round: Round = 1

      await operator.goToRound(round)

      const accounts = emptyUserAccounts([operatorId, alice, bob], round)
      const tree = new SolvencyTree(accounts)

      const aliceProof = tree.getProof(accounts[1], round)
      const bobProof = tree.getProof(accounts[2], round)

      await expect(
        metaLedger.getPartialProof(USD, alice.address, 1)
      ).resolves.toEqual(aliceProof)
      await expect(
        metaLedger.getPartialProof(USD, bob.address, 1)
      ).resolves.toEqual(bobProof)
    })
  })
})

function emptyUserAccounts(clients: Identity[], round: Round): IAccount[] {
  return clients.map(
    (id: Identity): IAccount => ({
      address: id.address,
      sum: D('0'),
      round: round
    })
  )
}
