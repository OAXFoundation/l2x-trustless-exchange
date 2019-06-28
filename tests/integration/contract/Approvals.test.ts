// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

/* eslint-env jest*/
import 'jest'

import { D } from '../../../src/common/BigNumberUtils'

import { IApproval } from '../../../src/common/types/Approvals'

import { EthereumBlockchain } from '../../libs/EthereumBlockchain'

import { MediatorAsync } from '../../../src/common/mediator/Contracts'
import { L2Client } from '../../../src/client/operator/L2Client'
import { PrivateKeyIdentity } from '../../../src/common/identity/PrivateKeyIdentity'
import { GETH_RPC_URL } from '../../../config/environment'
import { providers } from 'ethers'
import { HTTPClient } from '../../../src/client/common/HTTPClient'
import { Identity } from '../../../src/common/identity/Identity'

describe('How the Mediator validates an approval signature', () => {
  let blockchain: EthereumBlockchain
  let alice: L2Client
  let mediatorAlice: MediatorAsync

  let approvalParams: IApproval
  let aliceId: Identity
  let provider: providers.JsonRpcProvider

  blockchain = new EthereumBlockchain()

  provider = new providers.JsonRpcProvider(GETH_RPC_URL)
  provider.pollingInterval = 10

  beforeAll(async () => {
    await blockchain.start()
  })

  beforeEach(async () => {
    await blockchain.deploy()

    const port = 22222
    const operatorURL = `http://localhost:${port}`

    const operatorId = new PrivateKeyIdentity()
    const operatorAddress = operatorId.address

    const aliceTransport = new HTTPClient(new URL(operatorURL))

    aliceId = new PrivateKeyIdentity(undefined, provider)
    mediatorAlice = blockchain.getMediatorContract(aliceId)

    alice = new L2Client(aliceId, aliceTransport, {
      operatorAddress,
      mediator: mediatorAlice
    })
  })

  it('checks the validation of a signature on an approval', async () => {
    approvalParams = {
      approvalId: '12345',
      buy: { asset: blockchain.OAXContract.address, amount: D('2') },
      sell: { asset: blockchain.WETHContract.address, amount: D('2') },
      round: 1,
      intent: 'buyAll',
      owner: 'bob',

      instanceId: blockchain.contract.address
    }

    let sig = await alice.signApprovBytes(approvalParams)

    await expect(
      mediatorAlice.checkApproval(approvalParams, sig, alice.address)
    ).resolves.not.toThrow()

    const wrongApprovalId = '11111'
    approvalParams.approvalId = wrongApprovalId

    await expect(
      mediatorAlice.checkApproval(approvalParams, sig, alice.address)
    ).rejects.toThrow()
  })
})
