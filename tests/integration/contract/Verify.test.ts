// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/
import 'jest'

import { BigNumber } from 'bignumber.js'
import { D, etherToD } from '../../../src/common/BigNumberUtils'
import { Address, IAccount } from '../../../src/common/types/BasicTypes'

import { IRootInfo } from '../../../src/common/types/OperatorAndClientTypes'

import {
  BlockchainClient,
  EthereumBlockchain,
  OperatorBlockchain
} from '../../libs/EthereumBlockchain'
import { Proof } from '../../../src/common/types/SmartContractTypes'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'

describe('Validation of Merkle tree proofs for a specific client', () => {
  let aliceDepositBigNumber: BigNumber
  let blockchain: EthereumBlockchain
  let alice: BlockchainClient
  let operator: OperatorBlockchain
  let proof: Proof
  let contractUsedByOperator: MediatorAsync
  let aliceAddress: Address

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    alice = new BlockchainClient(blockchain.alice, blockchain)
    operator = new OperatorBlockchain(blockchain)

    contractUsedByOperator = blockchain.getMediatorContract(blockchain.operator)

    aliceAddress = await alice.getAddress()

    // Commits the root during round 1
    aliceDepositBigNumber = etherToD('3')
    await alice.depositWETHTokensIntoMediator(aliceDepositBigNumber)

    await blockchain.skipToNextRound()

    const currentRound = await contractUsedByOperator.getCurrentRound()

    let accountsWETH: IAccount[] = [
      {
        address: aliceAddress,
        sum: D(aliceDepositBigNumber.toString()),
        round: currentRound
      },
      {
        address: '0x28f79858ad6f46ea8b0e022b77bd4a031087adcd',
        sum: D('0'),
        round: currentRound
      },
      {
        address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
        sum: D('0'),
        round: currentRound
      },
      {
        address: '0x408e05ee6c7051509dca1875829b57486ef29b26',
        sum: D('0'),
        round: currentRound
      }
    ]

    let accountsOAX: IAccount[] = [
      {
        address: aliceAddress,
        sum: D('0'),
        round: currentRound
      },
      {
        address: '0x28f79858ad6f46ea8b0e022b77bd4a031087adcd',
        sum: D('0'),
        round: currentRound
      },
      {
        address: '0x43bbb816444eccfaa8bffec37e1665e3092dc753',
        sum: D('0'),
        round: currentRound
      },
      {
        address: '0x408e05ee6c7051509dca1875829b57486ef29b26',
        sum: D('0'),
        round: currentRound
      }
    ]

    operator.setAccounts(accountsWETH, blockchain.WETHContract.address)
    operator.setAccounts(accountsOAX, blockchain.OAXContract.address)

    const rootWETH = operator.getRootInfo(blockchain.WETHContract.address)
    const rootOAX = operator.getRootInfo(blockchain.OAXContract.address)

    await contractUsedByOperator.commit(
      rootWETH,
      blockchain.WETHContract.address
    )
    await contractUsedByOperator.commit(rootOAX, blockchain.OAXContract.address)

    const aliceIndex = 0
    proof = operator.computeProof(
      aliceIndex,
      blockchain.WETHContract.address,
      currentRound
    )
  })

  it('A valid proof is accepted', async () => {
    const round = 1

    const res = await contractUsedByOperator.isProofValid(proof, round)
    expect(res).toBeTruthy()
  })

  it('If the root is not set then an error is raised', async () => {
    const round = 0

    const res = await contractUsedByOperator.isProofValid(proof, round)

    expect(res).toBeFalsy()
  })

  it('An invalid proof is rejected', async () => {
    const round = 1

    const incorrectBalance = etherToD('1')

    const proofWithIncorrectBalance = new Proof(
      incorrectBalance,
      proof.clientAddress,
      proof.hashes,
      proof.sums,
      blockchain.WETHContract.address,
      D('2'),
      D('4'),
      round
    )

    const res = await contractUsedByOperator.isProofValid(
      proofWithIncorrectBalance,
      round
    )
    expect(res).toBeFalsy()

    const newRoot: IRootInfo = {
      content:
        '0xff4801ad46e24917a0eb3069b3fb7f7593e1cb2432bc812d290d6c69b07f5e72',
      height: D('2'),
      width: D('4')
    }

    await blockchain.skipToNextRound()

    await contractUsedByOperator.commit(
      newRoot,
      blockchain.WETHContract.address
    )

    const nextRound = 2

    // Alice's proof is not valid anymore
    const newRes = await contractUsedByOperator.isProofValid(proof, nextRound)
    expect(newRes).toBeFalsy()
  })
})
