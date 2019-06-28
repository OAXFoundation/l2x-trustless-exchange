// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/
import 'jest'
import { D, etherToD } from '../../../src/common/BigNumberUtils'
import { Address, Amount } from '../../../src/common/types/BasicTypes'

import {
  ALICE_INDEX,
  BlockchainClient,
  EthereumBlockchain,
  OperatorBlockchain,
  setBalancesAndCommit,
  setUpRound,
  SOME_ADDRESS
} from '../../libs/EthereumBlockchain'
import { Proof } from '../../../src/common/types/SmartContractTypes'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'

describe('Early open dispute attack', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let bob: BlockchainClient
  let aliceAddress: Address
  let bobAddress: Address
  let operator: OperatorBlockchain

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  describe('The attack', () => {
    it(
      'shows that a malicious client can open a dispute that the operator cannot ' +
        "close because the current committed roots do not contain the client 's balances",
      async () => {
        await blockchain.deploy()

        /////////////////////////////// Round 0 begins  //////////////////////////////

        // So far we assume that only alice and bob are registered

        alice = new BlockchainClient(blockchain.alice, blockchain)
        aliceAddress = await alice.getAddress()

        operator = new OperatorBlockchain(blockchain)
        bob = new BlockchainClient(blockchain.bob, blockchain)
        bobAddress = await bob.getAddress()

        let eve: BlockchainClient
        let eveAddress: Address

        let contractUsedByEve: MediatorAsync
        //let contractUsedByOperator: MediatorAsync

        eve = new BlockchainClient(blockchain.eve, blockchain)
        contractUsedByEve = blockchain.getMediatorContract(eve.signer)
        //contractUsedByOperator = blockchain.getMediatorContract(operator.signer)

        eveAddress = await eve.getAddress()

        await blockchain.skipToNextRound()

        await setBalancesAndCommit(
          aliceAddress,
          bobAddress,
          [D('0'), D('0')],
          [D('0'), D('0')],
          blockchain,
          operator
        )

        await blockchain.skipToNextRound()

        /////////////////////////////// Round 1 begins  //////////////////////////////

        const currentRound = await contractUsedByEve.getCurrentRound()

        await setUpRound(
          blockchain,
          operator,
          aliceAddress,
          bobAddress,
          D('0'),
          D('0'),
          D('0'),
          D('0')
        )

        // Now Eve gets registered
        const eveAuthorization = await operator.computeAuthorizationMessage(
          eveAddress,
          currentRound
        )

        // Eve tries to open a dispute even though her balances were not committed

        // The attack is prevented

        await expect(
          contractUsedByEve.openDispute([], [], [], eveAuthorization)
        ).rejects.toThrow()

        // Remaining code of the attack

        // // The operator tries to close the dispute yet only proofs for alice and bob are available
        // const proofs: Proof[] = [
        //   valuesRound1.proofETHAlice,
        //   valuesRound1.proofOAXAlice
        // ]
        //
        //
        // await expect(
        //   contractUsedByOperator.closeDispute(
        //     proofs,
        //     [],
        //     [],
        //     [],
        //     [],
        //     eveAddress
        //   )
        // ).rejects.toThrow()
      }
    )
  })
})

describe('Withdraw and recovery attack', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let aliceAddress: Address
  let operator: OperatorBlockchain
  let bob: BlockchainClient
  let bobAddress: Address
  let bobDeposit: Amount

  let aliceDeposit: Amount

  let contractUsedByAlice: MediatorAsync

  let proofAliceRound1: Proof
  //let proofAliceRound2: Proof

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  describe('The attack', () => {
    beforeEach(async () => {
      await blockchain.deploy()

      /////////////////////////////// Round 0 begins  //////////////////////////////

      alice = new BlockchainClient(blockchain.alice, blockchain)
      aliceAddress = await alice.getAddress()

      operator = new OperatorBlockchain(blockchain)
      bob = new BlockchainClient(blockchain.bob, blockchain)
      bobAddress = await bob.getAddress()

      aliceDeposit = etherToD('3')

      bobDeposit = aliceDeposit //Bob deposits the same amount as Alice

      await alice.depositWETHTokensIntoMediator(aliceDeposit)
      await bob.depositWETHTokensIntoMediator(bobDeposit)

      contractUsedByAlice = blockchain.getMediatorContract(alice.signer)

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 1 begins  //////////////////////////////

      let currentRound = await contractUsedByAlice.getCurrentRound()

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [aliceDeposit, D('0')],
        [bobDeposit, D('0')],
        blockchain,
        operator
      )

      proofAliceRound1 = operator.computeProof(
        ALICE_INDEX,
        blockchain.WETHContract.address,
        currentRound
      )

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 2 begins  //////////////////////////////

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [aliceDeposit, D('0')],
        [bobDeposit, D('0')],
        blockchain,
        operator
      )

      // proofAliceRound2 = operator.computeProof(
      //   ALICE_INDEX,
      //   blockchain.WETHContract.address
      // )

      await contractUsedByAlice.initiateWithdrawal(
        proofAliceRound1,
        aliceDeposit
      )

      await blockchain.skipToNextRound()

      /////////////////////////////// Round 3 begins  //////////////////////////////

      //Nothing happens

      await setBalancesAndCommit(
        aliceAddress,
        bobAddress,
        [D('0'), D('0')],
        [bobDeposit, D('0')],
        blockchain,
        operator
      )

      await blockchain.skipToNextRound()
    })

    it('shows how the attack gets finally executed', async () => {
      /////////////////////////////// Round 4 begins  //////////////////////////////

      // Triggers halted=true
      await blockchain.skipToNextQuarter()

      // Alice confirms the withdrawal: attack is prevented
      await expect(
        contractUsedByAlice.confirmWithdrawal(blockchain.WETHContract.address)
      ).rejects.toThrow()

      // Remaining code of the attack
      // Alice recovers her balance from round 2
      // await contractUsedByAlice.recoverAllFunds(proofAliceRound2)
      // //Check that Alice now owns twice her deposit
      // const aliceBalanceAfterRefund = await alice.getBalanceWETHToken()
      //
      // // Attack is prevented
      // expect(aliceBalanceAfterRefund).toEqual(aliceDeposit.multipliedBy(2))
    })
  })
})

describe('Token registering attack', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let aliceAddress: string
  let operator: OperatorBlockchain

  let aliceDepositETH: Amount
  let aliceDepositOAX: Amount
  let contractUsedByAlice: MediatorAsync
  let contractUsedByOperator: MediatorAsync

  // let proofETH: Proof
  // let proofOAX: Proof

  blockchain = new EthereumBlockchain()

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    /////////////////////////////// Round 0 begins  //////////////////////////////

    alice = new BlockchainClient(blockchain.alice, blockchain)
    operator = new OperatorBlockchain(blockchain)

    aliceAddress = await alice.getAddress()

    aliceDepositETH = etherToD('3')
    await alice.depositWETHTokensIntoMediator(aliceDepositETH)

    aliceDepositOAX = D('200')
    await alice.depositOAXTokensIntoMediator(aliceDepositOAX)

    await blockchain.skipToNextRound()

    /////////////////////////////// Round 1 begins  //////////////////////////////

    contractUsedByOperator = blockchain.getMediatorContract(blockchain.operator)

    //The operator commits to the new roots
    await setBalancesAndCommit(
      aliceAddress,
      '0x28f79858ad6f46ea8b0e022b77bd4a031087adcd',
      [aliceDepositETH, aliceDepositOAX],
      [D('0'), D('0')],
      blockchain,
      operator
    )

    // proofETH = operator.computeProof(
    //   ALICE_INDEX,
    //   blockchain.WETHContract.address
    // )
    //
    // proofOAX = operator.computeProof(
    //   ALICE_INDEX,
    //   blockchain.OAXContract.address
    // )

    contractUsedByAlice = blockchain.getMediatorContract(alice.signer)

    await blockchain.skipToNextRound()

    /////////////////////////////// Round 2 begins  //////////////////////////////

    //The operator commits to the new roots
    await setBalancesAndCommit(
      aliceAddress,
      '0x28f79858ad6f46ea8b0e022b77bd4a031087adcd',
      [aliceDepositETH, aliceDepositOAX],
      [D('0'), D('0')],
      blockchain,
      operator
    )
  })

  it('shows that Alice cannot open a dispute during round r despite she owns a valid proofs array of round r-1', async () => {
    // const proofs = [proofETH, proofOAX]
    // const fills: any = []
    // const sigFills: any = []
    // const authorizationMessage = await operator.getDummyAuthorizationMessage()

    //At the beginning there is no open dispute
    let dispute = await contractUsedByAlice.disputes(aliceAddress)
    expect(dispute.open).toBeFalsy()

    await contractUsedByOperator.skipToNextQuarter()

    await expect(
      contractUsedByOperator.registerToken(SOME_ADDRESS)
    ).rejects.toThrow()

    // Remaining code of the attack
    // await expect(
    //   contractUsedByAlice.openDispute(
    //     proofs,
    //     fills,
    //     sigFills,
    //     authorizationMessage
    //   )
    // ).rejects.toThrow()
    //
    // dispute = await contractUsedByAlice.disputes(aliceAddress)
    // expect(dispute.open).toBeFalsy()
  })
})
