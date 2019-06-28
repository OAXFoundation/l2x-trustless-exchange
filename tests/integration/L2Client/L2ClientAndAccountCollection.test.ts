// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

/* eslint-env jest */
import 'jest'
import knex from 'knex'
import { mock, instance, when, reset } from 'ts-mockito'
import { L2Client } from '../../../src/client/operator/L2Client'
import { PrivateKeyIdentity } from '../../../src/common/identity/PrivateKeyIdentity'
import { HTTPClient } from '../../../src/client/common/HTTPClient'
import { WalletCollection } from '../../../src/common/persistence/WalletCollection'
import { IMediatorAsync } from '../../../src/common/mediator/IMediatorAsync'
import { MediatorAsync } from '../../../src/common/mediator/Contracts'
import { Digest } from '../../../src/common/types/BasicTypes'
import { NULL_AUTHORIZATION_MESSAGE } from '../../libs/EthereumBlockchain'
import { mkAuthorization } from '../../../src/common/AuthorizationMessage'
import { IAuthorizationMessage } from '../../../src/common/types/SmartContractTypes'

const mockedHTTPClient: HTTPClient = mock(HTTPClient)
const mockedMediatorAsync: IMediatorAsync = mock(MediatorAsync)

describe('OperatorClient-AccountCollection Integration', () => {
  let operatorClient: L2Client
  let dbConn: knex

  const wallet = new PrivateKeyIdentity(
    '0x670b05774bd4a105cef87a7ef629de213b3cd17077a87c620afcd3b57aa04f6d'
  )
  const operatorWallet = new PrivateKeyIdentity(
    '0xa4bc28ef8b68784718dc71f8016b5228185c640c6b70f44d09a664a1eb998c10'
  )
  const mediatorAddress = '0x35C0961156F00b725499E741d6379A144ba28E93'

  beforeEach(async () => {
    const assets = ['0xFe05F7EeFBd08ED7a6AA10F37706CF2CAfC8E8b9']
    const httpClient: HTTPClient = instance(mockedHTTPClient)
    const mediator: IMediatorAsync = instance(mockedMediatorAsync)

    dbConn = knex({
      client: 'sqlite3',
      connection: ':memory:',
      useNullAsDefault: true
    })

    operatorClient = new L2Client(wallet, httpClient, {
      operatorAddress: operatorWallet.address,
      mediator,
      persistence: dbConn
    })

    //Inject the assets
    jest.spyOn(operatorClient, 'getRegisteredAssets').mockResolvedValue(assets)

    await operatorClient.init()

    when(mockedHTTPClient.mediator()).thenResolve(mediatorAddress)
    when(mockedMediatorAsync.contractAddress).thenReturn(mediatorAddress)
    when(mockedMediatorAsync.getContractWrapper())
  })

  afterEach(() => {
    reset(mockedHTTPClient)
    reset(mockedMediatorAsync)
  })

  describe('Joining the operator without saved state', () => {
    let addrSig: Digest
    let auth: IAuthorizationMessage

    const roundJoined = 3

    beforeEach(async () => {
      addrSig = await wallet.hashAndSign(wallet.address)
      auth = await mkAuthorization(
        wallet.address,
        roundJoined,
        operatorWallet as PrivateKeyIdentity
      )

      when(mockedMediatorAsync.getCurrentRound()).thenResolve(roundJoined)
      when(mockedHTTPClient.join(wallet.address, addrSig)).thenResolve(auth)
    })

    it('The authorization is stored', async () => {
      await operatorClient.join()

      const account = await WalletCollection.with(dbConn).findOne({
        wallet: wallet.address
      })

      expect(account!.authorization).toEqual(auth)
    })

    it('The round joined is stored', async () => {
      await operatorClient.join()

      const account = await WalletCollection.with(dbConn).findOne({
        wallet: wallet.address
      })

      expect(account!.roundJoined).toEqual(roundJoined)
    })
  })

  describe('Joining the operator with saved state', () => {
    const auth = NULL_AUTHORIZATION_MESSAGE
    const roundJoined = 10

    beforeEach(async () => {
      await WalletCollection.with(dbConn).save({
        wallet: wallet.address,
        roundJoined,
        lastAuditRound: roundJoined,
        lastFillRound: roundJoined,
        authorization: auth
      })
    })

    it('The authorization is restored', async () => {
      await operatorClient.join()

      expect(operatorClient.authorization).toEqual(auth)
    })

    it('The round joined is restored', async () => {
      await operatorClient.join()

      expect(operatorClient.roundJoined).toEqual(roundJoined)
    })
  })
})
