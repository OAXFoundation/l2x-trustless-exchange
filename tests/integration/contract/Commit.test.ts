// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import {
  EthereumBlockchain,
  BlockchainClient,
  OperatorBlockchain
} from '../../libs/EthereumBlockchain'

import 'jest'
import { IRootInfo } from '../../../src/common/types/OperatorAndClientTypes'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'
import { D, etherToD } from '../../../src/common/BigNumberUtils'
import { Address } from '../../../src/common/types/BasicTypes'

describe('OperatorBlockchain commits the root of the merkle inside the Mediator contract', () => {
  let proofHash: string
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let aliceAddress: Address
  let operator: OperatorBlockchain

  let contractUsedByOperator: MediatorAsync
  let contractUsedByAlice: MediatorAsync

  blockchain = new EthereumBlockchain()

  let root: IRootInfo

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    alice = new BlockchainClient(blockchain.alice, blockchain)
    operator = new OperatorBlockchain(blockchain)

    aliceAddress = await alice.getAddress()

    proofHash =
      '0xff4801ad46e24917a0eb3069b3fb7f7593e1cb2432bc812d290d6c69b07f5e72'

    root = { content: proofHash, height: D('2'), width: D('4') }

    contractUsedByOperator = blockchain.getMediatorContract(blockchain.operator)
    contractUsedByAlice = blockchain.getMediatorContract(alice.signer)
  })

  it('is not possible to commit a root at round 0', async () => {
    const root: IRootInfo = {
      content: proofHash,
      height: D('2'),
      width: D('4')
    }

    await expect(
      contractUsedByOperator.commit(root, blockchain.WETHContract.address)
    ).rejects.toThrow()
  })

  it('is only allowed to commit during quarter 0', async () => {
    await blockchain.skipToNextRound()

    await blockchain.skipToNextQuarter()

    // Commit fails because quarter is not 0
    await expect(
      contractUsedByOperator.commit(root, blockchain.WETHContract.address)
    ).rejects.toThrow()
  })

  it('Only the operator can commit a root', async () => {
    await blockchain.skipToNextRound()

    //Check that round == 1
    const result = await contractUsedByOperator.getCurrentRound()
    expect(result).toBe(1)

    await expect(
      contractUsedByAlice.commit(root, blockchain.WETHContract.address)
    ).rejects.toThrow()
  })

  it('verifies that only one root can be committed during a single round', async () => {
    await blockchain.skipToNextRound()

    //Check that round == 1
    const result = await contractUsedByOperator.getCurrentRound()
    expect(result).toBe(1)

    // First commit is OK
    await contractUsedByOperator.commit(root, blockchain.WETHContract.address)

    // Second attempt to commit raises an error
    await expect(
      contractUsedByOperator.commit(root, blockchain.WETHContract.address)
    ).rejects.toThrow()
  })

  it('checks that it is not possible to commit a new root when the contract is halted.', async () => {
    await blockchain.skipToNextRound()

    await blockchain.skipToNextQuarter() //to halt

    await expect(
      contractUsedByOperator.commit(root, blockchain.WETHContract.address)
    ).rejects.toThrow()
  })

  it('checks that it is not possible to commit a root for an unregistered token.', async () => {
    await blockchain.skipToNextRound()

    await contractUsedByOperator.unregisterToken(
      blockchain.WETHContract.address
    )

    await expect(
      contractUsedByOperator.commit(root, blockchain.WETHContract.address)
    ).rejects.toThrow()
  })

  it('checks that the opening balance is updated when committing a new root', async () => {
    const aliceDeposit = etherToD('3')

    await alice.depositWETHTokensIntoMediator(aliceDeposit)

    await blockchain.skipToNextRound()

    await contractUsedByOperator.commit(root, blockchain.WETHContract.address)

    const currentRound = await contractUsedByOperator.getCurrentRound()

    const openingBalanceWETH = await contractUsedByOperator
      .getContractWrapper()
      .functions.openingBalances(currentRound, blockchain.WETHContract.address)

    expect(openingBalanceWETH.toString()).toEqual(aliceDeposit.toString())
  })

  it('checks that if the operator skips one round or more w/o committing then it is not possible to commit anymore.', async () => {
    await blockchain.skipToNextRound()

    await blockchain.skipToNextRound()

    await blockchain.skipToNextRound()

    const currentRound = await contractUsedByOperator.getCurrentRound()

    const committedRounds = await contractUsedByOperator
      .getContractWrapper()
      .functions.committedRounds()

    expect(committedRounds.toString()).toEqual('0')

    expect(currentRound).toEqual(3)

    //Now the value for halted state is going to be checked
    await expect(
      contractUsedByOperator.commit(root, blockchain.WETHContract.address)
    ).rejects.toThrow()
  })

  it('checks that the operator can commit even if some disputes from the previous round were not closed.', async () => {
    // Note that the operator should anyways close all the disputes before committing

    await blockchain.skipToNextRound()
    let currentRound = await contractUsedByOperator.getCurrentRound()

    ////////////////////// Round 1 begins //////////////////////////////////////

    //It is needed to commit both assets
    await contractUsedByOperator.commit(root, blockchain.WETHContract.address)
    await contractUsedByOperator.commit(root, blockchain.OAXContract.address)

    const authorizationMessage = await operator.computeAuthorizationMessage(
      aliceAddress,
      currentRound - 1
    )

    // Alice opens a dispute
    await contractUsedByAlice.openDispute([], [], [], authorizationMessage)

    await blockchain.skipToNextRound()

    ////////////////////// Round 2 begins //////////////////////////////////////

    currentRound = await contractUsedByOperator.getCurrentRound()
    const currentQuarter = await contractUsedByOperator.getCurrentQuarter()

    expect(currentRound).toEqual(2)
    expect(currentQuarter).toEqual(0)

    await expect(
      contractUsedByOperator.commit(root, blockchain.WETHContract.address)
    ).resolves.not.toThrow()
  })

  describe('retries', () => {
    beforeEach(async () => {
      await blockchain.skipToNextRound()

      const result = await contractUsedByOperator.getCurrentRound()
      expect(result).toBe(1)
    })

    describe('concurrent commits', () => {
      it('do not require retries', async () => {
        jest
          .spyOn(contractUsedByOperator, 'retryLimit', 'get')
          .mockReturnValue(1)
        const commits = [blockchain.WETHContract, blockchain.OAXContract].map(
          token => contractUsedByOperator.commit(root, token.address)
        )
        await expect(Promise.all(commits)).resolves.not.toThrow()
      })
    })

    describe('when failing to submit transaction', () => {
      it('retries', async () => {
        const mocked = jest.spyOn(contractUsedByOperator, 'submitTx')
        mocked.mockRejectedValueOnce(new Error('Failed to submit transaction'))

        const promise = contractUsedByOperator.commit(
          root,
          blockchain.WETHContract.address
        )

        await expect(promise).resolves.not.toThrow()
      })

      it('throws if retries exhausted', async () => {
        const mocked = jest.spyOn(contractUsedByOperator, 'submitTx')
        mocked.mockRejectedValue(new Error('Failed to submit transaction'))

        const promise = contractUsedByOperator.commit(
          root,
          blockchain.WETHContract.address
        )

        await expect(promise).rejects.toThrow('Failed to submit transaction')
      })
    })

    describe('when transaction is not mined', () => {
      beforeEach(async () => {
        await blockchain.provider.send('miner_stop', [])
      })

      afterEach(async () => {
        await blockchain.provider.send('miner_start', [])
      })

      it('throws if retries exhausted', async () => {
        const promise = contractUsedByOperator.commit(
          root,
          blockchain.WETHContract.address
        )

        await expect(promise).rejects.toThrow('Failed to mine transaction')
      })

      it('retries', async () => {
        const promise = contractUsedByOperator.commit(
          root,
          blockchain.WETHContract.address
        )

        const pollInterval = blockchain.provider.pollingInterval

        await new Promise(r => setTimeout(r, 30 * pollInterval))

        await blockchain.provider.send('miner_start', [])

        await expect(promise).resolves.not.toThrow()
      })
    })
  })
})
