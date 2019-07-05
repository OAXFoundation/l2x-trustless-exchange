// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/

import 'jest'

import { D, etherToD } from '../../../src/common/BigNumberUtils'
import { BigNumber } from 'bignumber.js'
import { Round } from '../../../src/common/types/BasicTypes'

import {
  ALICE_INDEX,
  BlockchainClient,
  EthereumBlockchain,
  NULL_ADDRESS,
  NULL_SIG,
  OperatorBlockchain,
  setBalancesAndCommit
} from '../../libs/EthereumBlockchain'

import { Proof } from '../../../src/common/types/SmartContractTypes'

import { FillMediator } from '../../../src/common/types/Fills'

import { MediatorAsync } from '../../../src/common/mediator/Contracts'

describe('what happens when a client opens a balance dispute', () => {
  let blockchain: EthereumBlockchain

  let alice: BlockchainClient
  let aliceAddress: string
  let operator: OperatorBlockchain

  let aliceDepositETH: BigNumber
  let aliceDepositOAX: BigNumber
  let contractUsedByAlice: MediatorAsync
  let contractUsedByOperator: MediatorAsync

  let currentRound: Round
  let proofETH: Proof
  let proofOAX: Proof

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

    currentRound = await contractUsedByOperator.getCurrentRound()

    proofETH = operator.computeProof(
      ALICE_INDEX,
      blockchain.WETHContract.address,
      currentRound
    )

    proofOAX = operator.computeProof(
      ALICE_INDEX,
      blockchain.OAXContract.address,
      currentRound
    )

    contractUsedByAlice = blockchain.getMediatorContract(alice.signer)

    await blockchain.skipToNextRound()

    /////////////////////////////// Round 2 begins  //////////////////////////////

    currentRound = await contractUsedByOperator.getCurrentRound()
  })

  it('lets Alice raise a valid balance dispute, but only once', async () => {
    const proofs = [proofETH, proofOAX]
    const fills: any = []
    const sigFills: any = []
    const authorizationMessage = await operator.getDummyAuthorizationMessage()

    //At the beginning there is no open dispute
    let dispute = await contractUsedByAlice.disputes(aliceAddress)
    expect(dispute.open).toBeFalsy()

    await contractUsedByAlice.openDispute(
      proofs,
      fills,
      sigFills,
      authorizationMessage
    )

    //Check some relevant fields of dispute
    dispute = await contractUsedByAlice.disputes(aliceAddress)
    expect(dispute.open).toBeTruthy()

    let disputeCounter = await contractUsedByAlice.openDisputeCounters(
      currentRound
    )
    expect(disputeCounter).toEqual(1)

    //Trying again to open a dispute does not work
    await contractUsedByAlice.openDispute(
      proofs,
      fills,
      sigFills,
      authorizationMessage
    )

    //The counter of dispute remains unchanged
    disputeCounter = await contractUsedByAlice.openDisputeCounters(currentRound)
    expect(disputeCounter).toEqual(1)
  })

  it('checks that it is not possible to open a dispute when the contract is halted.', async () => {
    const proofs = [proofETH, proofOAX]
    const fills: any = []
    const sigFills: any = []
    const authorizationMessage = await operator.getDummyAuthorizationMessage()

    await contractUsedByOperator.halt()

    await expect(
      contractUsedByAlice.openDispute(
        proofs,
        fills,
        sigFills,
        authorizationMessage
      )
    ).rejects.toThrow()
  })

  it('should fail when the address of the proofs differs from the address of the client', async () => {
    const wrongAddress = NULL_ADDRESS

    //Changing the client address of the first proof
    proofETH.clientAddress = wrongAddress

    let proofs = [proofETH, proofOAX]
    const fills: any = []
    const sigFills: any = []
    const authorizationMessage = await operator.getDummyAuthorizationMessage()

    await expect(
      contractUsedByAlice.openDispute(
        proofs,
        fills,
        sigFills,
        authorizationMessage
      )
    ).rejects.toThrow()

    //Changing the client address of the second proof
    proofETH.clientAddress = aliceAddress
    proofOAX.clientAddress = NULL_ADDRESS

    proofs = [proofETH, proofOAX]
    await expect(
      contractUsedByAlice.openDispute(
        proofs,
        fills,
        sigFills,
        authorizationMessage
      )
    ).rejects.toThrow()

    //Back to good addresses again
    proofOAX.clientAddress = aliceAddress

    proofs = [proofETH, proofOAX]
    //Does not throw
    await contractUsedByAlice.openDispute(
      proofs,
      fills,
      sigFills,
      authorizationMessage
    )
  })

  it('checks that the proof array is valid.', async () => {
    const authorizationMessage = await operator.getDummyAuthorizationMessage()
    const fills: any = []
    const sigFills: any = []

    // There are two proof that correspond to the same token => raise an exception
    let proofs = [proofETH, proofETH]

    await expect(
      contractUsedByAlice.openDispute(
        proofs,
        fills,
        sigFills,
        authorizationMessage
      )
    ).rejects.toThrow()

    //The proofs are not in the right order => raise an exception
    proofs = [proofOAX, proofETH]

    await expect(
      contractUsedByAlice.openDispute(
        proofs,
        fills,
        sigFills,
        authorizationMessage
      )
    ).rejects.toThrow()

    //There is an extra proof => raise an exception
    proofs = [proofETH, proofOAX, proofOAX]

    await expect(
      contractUsedByAlice.openDispute(
        proofs,
        fills,
        sigFills,
        authorizationMessage
      )
    ).rejects.toThrow()
  })

  it('checks that the proofs must be valid.', async () => {
    const authorizationMessage = await operator.getDummyAuthorizationMessage()

    const ETHsums = proofETH.sums
    const OAXsums = proofOAX.sums

    //ETH proof is invalid
    proofETH.sums = []
    let proofs = [proofETH, proofOAX]

    const fills: any = []
    const sigFills: any = []
    await expect(
      contractUsedByAlice.openDispute(
        proofs,
        fills,
        sigFills,
        authorizationMessage
      )
    ).rejects.toThrow()

    //OAX proof is invalid
    proofETH.sums = ETHsums
    proofOAX.sums = []
    proofs = [proofETH, proofOAX]

    await expect(
      contractUsedByAlice.openDispute(
        proofs,
        fills,
        sigFills,
        authorizationMessage
      )
    ).rejects.toThrow()

    //Now it works again (all proofs are valid)
    proofOAX.sums = OAXsums
    proofs = [proofETH, proofOAX]
    await contractUsedByAlice.openDispute(
      proofs,
      fills,
      sigFills,
      authorizationMessage
    )

    //Check that the balances are stored correctly
    const balance1 = await contractUsedByOperator.getBalanceFromDispute(
      aliceAddress,
      0
    )
    expect(balance1).toEqual(proofs[0].clientOpeningBalance)

    const balance2 = await contractUsedByOperator.getBalanceFromDispute(
      aliceAddress,
      1
    )
    expect(balance2).toEqual(proofs[1].clientOpeningBalance)
  })

  it('checks that all the fills must have a unique ID.', async () => {
    const sameId = '751761'

    const fill1 = new FillMediator(
      sameId,
      '876876',
      currentRound - 1,
      D('1'),
      blockchain.WETHContract.address,
      D('1'),
      blockchain.OAXContract.address,
      aliceAddress,
      blockchain.contract.address
    )

    const sig1 = operator.signFill(fill1)

    const fill2 = new FillMediator(
      sameId,
      '415415',
      currentRound - 1,
      D('3'),
      blockchain.WETHContract.address,
      D('4'),
      blockchain.OAXContract.address,
      aliceAddress,
      blockchain.contract.address
    )

    const sig2 = operator.signFill(fill2)

    const fills: any = [fill1, fill2]

    let sigFills: any = [sig1, sig2]

    const authorizationMessage = await operator.computeAuthorizationMessage(
      aliceAddress,
      currentRound - 1
    )
    await expect(
      contractUsedByAlice.openDispute([], fills, sigFills, authorizationMessage)
    ).rejects.toThrow()
  })

  describe('when Alice has no proof (only authorization message)', () => {
    it('checks that Alice can open a dispute only with an authorization (ie no proof nor fill).', async () => {
      const fills: any = []
      const sigFills: any = []
      const authorizationMessage = await operator.computeAuthorizationMessage(
        aliceAddress,
        currentRound - 1
      )
      await contractUsedByAlice.openDispute(
        [],
        fills,
        sigFills,
        authorizationMessage
      )

      const disputeCounter = await contractUsedByAlice.openDisputeCounters(
        currentRound
      )

      const firstBalance = await contractUsedByOperator.getBalanceFromDispute(
        aliceAddress,
        0
      )
      const secondBalance = await contractUsedByOperator.getBalanceFromDispute(
        aliceAddress,
        1
      )

      expect(firstBalance).toEqual(D('0'))
      expect(secondBalance).toEqual(D('0'))

      expect(disputeCounter).toEqual(1)
    })

    it('checks that the authorization must be contain the right address.', async () => {
      const fills: any = []
      const sigFills: any = []

      const wrongAddress = operator.contractAddress

      const authorizationMessage = await operator.computeAuthorizationMessage(
        wrongAddress,
        currentRound - 1
      )
      await expect(
        contractUsedByAlice.openDispute(
          [],
          fills,
          sigFills,
          authorizationMessage
        )
      ).rejects.toThrow()
    })

    it('checks that the authorization must be created at least a round before opening the dispute.', async () => {
      const fills: any = []
      const sigFills: any = []

      const authorizationMessage = await operator.computeAuthorizationMessage(
        aliceAddress,
        currentRound
      )
      await expect(
        contractUsedByAlice.openDispute(
          [],
          fills,
          sigFills,
          authorizationMessage
        )
      ).rejects.toThrow()
    })

    it('checks that the signature of the authorization must be correct', async () => {
      const fills: any = []
      const sigFills: any = []

      let authorizationMessage = await operator.computeAuthorizationMessage(
        aliceAddress,
        currentRound - 1
      )

      authorizationMessage.sig = NULL_SIG

      await expect(
        contractUsedByAlice.openDispute(
          [],
          fills,
          sigFills,
          authorizationMessage
        )
      ).rejects.toThrow()
    })

    it('checks that the authorization message can only be used during roundJoined+1', async () => {
      const fills: any = []
      const sigFills: any = []
      const authorizationMessage = await operator.computeAuthorizationMessage(
        aliceAddress,
        currentRound - 2
      )
      await expect(
        contractUsedByAlice.openDispute(
          [],
          fills,
          sigFills,
          authorizationMessage
        )
      ).rejects.toThrow()
    })
  })

  it('checks that there are as many fills as signatures.', async () => {
    const fill = new FillMediator(
      '176598',
      '7676622',
      currentRound,
      D('3'),
      blockchain.WETHContract.address,
      D('4'),
      blockchain.OAXContract.address,
      aliceAddress,
      blockchain.contract.address
    )

    const fills: any = [fill]
    const sigFills: any = []

    const authorizationMessage = await operator.computeAuthorizationMessage(
      aliceAddress,
      currentRound - 1
    )
    await expect(
      contractUsedByAlice.openDispute([], fills, sigFills, authorizationMessage)
    ).rejects.toThrow()
  })

  it('checks every fill is signed correctly.', async () => {
    const fill1 = new FillMediator(
      '751761',
      '323243',
      currentRound - 1,
      D('1'),
      blockchain.WETHContract.address,
      D('1'),
      blockchain.OAXContract.address,
      aliceAddress,
      blockchain.contract.address
    )

    const sig1 = await operator.signFill(fill1)

    const fill2 = new FillMediator(
      '17659877',
      '8737626',
      currentRound - 1,
      D('3'),
      blockchain.WETHContract.address,
      D('4'),
      blockchain.OAXContract.address,
      aliceAddress,
      blockchain.contract.address
    )

    const sig2 = await operator.signFill(fill2)

    const fills: any = [fill1, fill2]

    //The second signature is not valid
    let sigFills: any = [sig1, sig1]

    const authorizationMessage = await operator.computeAuthorizationMessage(
      aliceAddress,
      currentRound - 1
    )
    await expect(
      contractUsedByAlice.openDispute([], fills, sigFills, authorizationMessage)
    ).rejects.toThrow()

    //Now te first signature is not valid
    sigFills = [sig2, sig2]
    await expect(
      contractUsedByAlice.openDispute([], fills, sigFills, authorizationMessage)
    ).rejects.toThrow()

    //Now both signature is valid. No exception is raised
    sigFills = [sig1, sig2]
    await contractUsedByAlice.openDispute(
      [],
      fills,
      sigFills,
      authorizationMessage
    )
  })

  it('checks that all the fills are correctly stored in the dispute', async () => {
    const fill1 = new FillMediator(
      '751761',
      '323243',
      currentRound - 1,
      D('1'),
      blockchain.WETHContract.address,
      D('1'),
      blockchain.OAXContract.address,
      aliceAddress,
      blockchain.contract.address
    )

    const sig1 = await operator.signFill(fill1)

    const fill2 = new FillMediator(
      '17659877',
      '8737626',
      currentRound - 1,
      D('3'),
      blockchain.WETHContract.address,
      D('4'),
      blockchain.OAXContract.address,
      aliceAddress,
      blockchain.contract.address
    )

    const sig2 = await operator.signFill(fill2)

    const fills: any = [fill1, fill2]

    const sigFills = [sig1, sig2]

    const authorizationMessage = await operator.computeAuthorizationMessage(
      aliceAddress,
      currentRound - 1
    )

    await contractUsedByAlice.openDispute(
      [],
      fills,
      sigFills,
      authorizationMessage
    )

    const disputeId = (await contractUsedByAlice.totalDisputes()).toString()

    //Check the information of each fill.
    expect(
      (await contractUsedByOperator.disputes(aliceAddress)).fillCount.toString()
    ).toEqual('2')

    const fill1FromStorage = await contractUsedByOperator.getFillFromDispute(
      disputeId,
      fill1.fillId
    )
    expect(fill1FromStorage).toEqual(fill1)

    const fill2FromStorage = await contractUsedByOperator.getFillFromDispute(
      disputeId,
      fill2.fillId
    )
    expect(fill2FromStorage).toEqual(fill2)
  })

  it('checks the round of a fill is correct.', async () => {
    const wrongRound = 40

    const fill1 = new FillMediator(
      '751761',
      '215126',
      wrongRound,
      D('1'),
      blockchain.WETHContract.address,
      D('1'),
      blockchain.OAXContract.address,
      aliceAddress,
      blockchain.contract.address
    )

    const sig1 = operator.signFill(fill1)

    const fills: any = [fill1]
    const sigFills: any = [sig1]

    const authorizationMessage = await operator.computeAuthorizationMessage(
      aliceAddress,
      currentRound - 1
    )
    await expect(
      contractUsedByAlice.openDispute([], fills, sigFills, authorizationMessage)
    ).rejects.toThrow()
  })

  it("checks all fills contain the client's address.", async () => {
    const fill1 = new FillMediator(
      '73627632',
      '87876',
      currentRound - 1,
      D('1'),
      blockchain.WETHContract.address,
      D('1'),
      blockchain.OAXContract.address,
      aliceAddress,
      blockchain.contract.address
    )

    const sig1 = operator.signFill(fill1)

    const wrongClientAddress = operator.contractAddress
    const fill2 = new FillMediator(
      '436743',
      '514514',
      currentRound - 1,
      D('3'),
      blockchain.WETHContract.address,
      D('4'),
      blockchain.OAXContract.address,
      wrongClientAddress,
      blockchain.contract.address
    )

    const sig2 = operator.signFill(fill2)

    const fills: any = [fill1, fill2]

    let sigFills: any = [sig1, sig2]

    const authorizationMessage = await operator.computeAuthorizationMessage(
      aliceAddress,
      currentRound - 1
    )
    await expect(
      contractUsedByAlice.openDispute([], fills, sigFills, authorizationMessage)
    ).rejects.toThrow()
  })
})
