// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

// /* eslint-env jest */
import 'jest'
import { mock, instance, reset, when, anything } from 'ts-mockito'
import R from 'ramda'
import lolex from 'lolex'
import {
  Address,
  Amount,
  ApprovalId,
  IBalances,
  Round,
  Intent
} from '../src/common/types/BasicTypes'

import { IL2Order, IMarket } from '../src/common/types/ExchangeTypes'

import {
  ExchangeConfig,
  Exchange,
  mkPair,
  remainsToFill,
  isBidApproval,
  isAskApproval,
  orderPrice,
  orderAmount,
  symbolOf
} from '../src/server/exchange/Exchange'
import { TOKEN_DECIMALS } from '../src/common/Constants'
import { D } from '../src/common/BigNumberUtils'
import { PrivateKeyIdentity } from '../src/common/identity/PrivateKeyIdentity'
import { Operator } from '../src/server/operator/Operator'
import {
  approvalFixtures,
  makeApprovalFixture
} from './libs/fixtures/Approval.fixture'
import { MockMediatorAsync } from '../src/server/mediator/MockMediatorAsync'
import { AssetRegistry } from '../src/common/AssetRegistry'
import { exchangeFixtures } from './libs/fixtures/Exchange.fixture'
import {
  AmountError,
  FeeWrongFormatError,
  PrecisionError,
  RoundMismatchError,
  SignatureError,
  UnregisteredUserError,
  WrongFeeStructureError,
  WrongInstanceIdError
} from '../src/common/Errors'

import { MetaLedger } from '../src/common/accounting/MetaLedger'
import {
  SOME_ADDRESS,
  SOME_SIGNATURE,
  CONSTANT_FEE
} from './libs/SystemFixture'
import {
  computeFeeApproval,
  IApproval,
  ISignedApproval
} from '../src/common/types/Approvals'

import { ISignedFill } from '../src/common/types/Fills'
import { NULL_ADDRESS } from './libs/EthereumBlockchain'

import { IAuthorizationMessage } from '../src/common/types/SmartContractTypes'
import { mkAuthorization } from '../src/common/AuthorizationMessage'

const { BTC, USD, OAX } = exchangeFixtures

const BOB = '0xb0b0000000000000000000000000000000000000'
const ALICE = '0xa71ce00000000000000000000000000000000000'
const FEE_SALT =
  '0xb5dc242b7fc467034518eaeb9869a8052c3c40ae1480f9090ac22d80080ce984'
const ownerSig = approvalFixtures.signedApproval.ownerSig

const operatorWallet = new PrivateKeyIdentity()
const mockedOperator: Operator = mock(Operator)

async function mkExchange(config?: ExchangeConfig): Promise<Exchange> {
  const verifier = new MockMediatorAsync() // only used for contractAddress
  const metaLedger = new MetaLedger({
    assets: [USD, BTC, OAX],
    mediatorAddress: verifier.contractAddress,
    operatorAddress: operatorWallet.address
  })

  await metaLedger.start()

  await metaLedger.register(ALICE, 0)
  await metaLedger.register(BOB, 0)

  when(mockedOperator.address).thenReturn(operatorWallet.address)
  when(mockedOperator.mediatorAddress).thenReturn(SOME_ADDRESS)
  when(mockedOperator.round).thenReturn(0)
  const operator: Operator = instance(mockedOperator)

  return new Exchange(operator, metaLedger, config)
}

/**
 * Enables to credit the balances of the user so that an order
 * is backed.
 * @param order: order to back with assets
 * @param exchange: exchange that handles the accounts
 */
async function creditDepositForOrder(order: IL2Order, exchange: Exchange) {
  const orderApproval = order.orderApproval
  const feeApproval = order.feeApproval

  await creditDepositApproval(orderApproval, exchange)
  await creditDepositApproval(feeApproval, exchange)
}

/**
 * Credit deposit from an approval
 * @param approval: approval with the credit information
 * @param ex: exchange
 */
async function creditDepositApproval(approval: ISignedApproval, ex: Exchange) {
  await ex.metaLedger.creditDeposit(
    approval.params.sell.asset,
    approval.params.owner,
    approval.params.sell.amount,
    approval.params.round
  )
}

describe('Pair', () => {
  it('is independent of order', () => {
    expect(mkPair('a', 'b')).toEqual(mkPair('a', 'b'))
    expect(mkPair('a', 'b')).toEqual(mkPair('b', 'a'))
    expect(mkPair('a', 'b') == mkPair('a', 'b')).toBe(true)
    expect(mkPair('a', 'b') == mkPair('b', 'a')).toBe(true)
  })

  it('is is different for different assets', () => {
    expect(mkPair('a', 'b') == mkPair('a', 'c')).toBe(false)
    expect(mkPair('a', 'b') == mkPair('b', 'c')).toBe(false)
  })
})

describe('remainsToFill', () => {
  const buy = D('1e11')
  const sell = D('5e10')

  describe('with buy intent', () => {
    const intent: Intent = 'buyAll'
    const approval = { intent, buy: { amount: buy }, sell: { amount: sell } }

    describe('without fills', () => {
      it('returns the full amounts', () => {
        const remains = remainsToFill(approval, [])
        expect(remains.buy.amount).toEqual(buy)
        expect(remains.sell.amount).toEqual(sell)
      })
    })

    describe('with a fill at a better price', () => {
      const fill = {
        buy: { amount: D('6e10') },
        sell: { amount: D('1e10') }
      }

      it('calculates correct amount to buy all', () => {
        const remains = remainsToFill(approval, [fill])
        expect(remains.buy.amount).toEqual(D('4e10'))
        expect(remains.sell.amount).toEqual(D('2e10'))
      })
    })
  })
  describe('with sell intent', () => {
    const intent: Intent = 'sellAll'
    const approval = { intent, buy: { amount: buy }, sell: { amount: sell } }

    describe('without fills', () => {
      it('returns the full amounts', () => {
        const remains = remainsToFill(approval, [])
        expect(remains.buy.amount).toEqual(buy)
        expect(remains.sell.amount).toEqual(sell)
      })
    })

    describe('with a fill at a better price', () => {
      const fill = {
        buy: { amount: D('8e10') },
        sell: { amount: D('2e10') }
      }

      it('calculates correct amounts to sell all', () => {
        const remains = remainsToFill(approval, [fill])
        expect(remains.buy.amount).toEqual(D('6e10'))
        expect(remains.sell.amount).toEqual(D('3e10'))
      })
    })
  })
})

describe('Exchange', () => {
  let ex: Exchange

  const taker: ISignedApproval = {
    params: {
      approvalId: 'left',
      buy: { asset: BTC, amount: D('2e10') },
      sell: { asset: USD, amount: D('4e10') },
      round: 0,
      intent: 'buyAll',
      owner: ALICE,

      instanceId: SOME_ADDRESS
    },
    ownerSig
  }

  const feeTaker: ISignedApproval = {
    params: {
      approvalId: 'fee left',
      buy: { asset: OAX, amount: D('0') },
      sell: { asset: OAX, amount: CONSTANT_FEE },
      round: 0,
      intent: 'sellAll',
      owner: ALICE,

      instanceId: SOME_ADDRESS
    },
    ownerSig
  }

  const orderTaker: IL2Order = { orderApproval: taker, feeApproval: feeTaker }

  const maker: ISignedApproval = {
    params: {
      approvalId: 'right',
      buy: { asset: USD, amount: D('4e10') },
      sell: { asset: BTC, amount: D('2e10') },
      round: 0,
      intent: 'buyAll',
      owner: BOB,

      instanceId: SOME_ADDRESS
    },
    ownerSig
  }

  const feeMaker: ISignedApproval = {
    params: {
      approvalId: 'right fee',
      buy: { asset: OAX, amount: D('0') },
      sell: { asset: OAX, amount: CONSTANT_FEE },
      round: 0,
      intent: 'sellAll',
      owner: BOB,

      instanceId: SOME_ADDRESS
    },
    ownerSig
  }

  const orderMaker: IL2Order = { orderApproval: maker, feeApproval: feeMaker }

  const feeApprovalTemplate: ISignedApproval = {
    params: {
      approvalId: 'template fee',
      buy: { asset: OAX, amount: D('0') },
      sell: { asset: OAX, amount: CONSTANT_FEE },
      round: 0,
      intent: 'sellAll',
      owner: BOB,

      instanceId: SOME_ADDRESS
    },
    ownerSig
  }

  function mkFeeWith(params: Partial<IApproval>) {
    return R.mergeDeepRight(feeApprovalTemplate, {
      params: params
    })
  }

  beforeEach(async () => {
    ex = await mkExchange({
      fee: { asset: OAX, amount: CONSTANT_FEE },
      pairs: ['USD/BTC', 'BTC/USD']
    })
    ex.addAsset('BTC', BTC)
    ex.addAsset('USD', USD)
  })

  afterEach(async () => {
    jest.restoreAllMocks()
    reset(mockedOperator)
  })

  describe('when admitting user', () => {
    const user = new PrivateKeyIdentity()

    describe('given a valid address-signature pair', () => {
      const sig = user.hashAndSign(user.address)

      it('returns an operator signed authorization message', async () => {
        const authorization: IAuthorizationMessage = await mkAuthorization(
          user.address,
          0,
          operatorWallet
        )
        when(mockedOperator.admit(user.address)).thenResolve(authorization)

        const result = await ex.admit(user.address, await sig)

        expect(result).toEqual(authorization)
      })
    })

    describe('given an invalid address-signature pair', () => {
      it('throws error if recovered address does not match claimed address', async () => {
        const randomAddr = new PrivateKeyIdentity().address
        const sig = await user.hashAndSign(randomAddr)

        await expect(ex.admit(randomAddr, sig)).rejects.toThrow(SignatureError)
      })
    })
  })

  describe('remaining sell amount', () => {
    it('works if there are no fills', async () => {
      await creditDepositForOrder(orderMaker, ex)
      await ex.addOrder(orderMaker)
      await expect(ex.remainingSellAmount(maker.params)).resolves.toEqual(
        maker.params.sell.amount
      )
    })
  })

  describe('orderRemainingAmount', () => {
    beforeEach(async () => {
      await creditDepositForOrder(orderMaker, ex)

      await creditDepositForOrder(orderTaker, ex)
    })

    it('works with no fills', async () => {
      await ex.addOrder(orderMaker)

      const remainingAmount = await ex.orderRemainingAmount(maker)

      expect(remainingAmount).toEqual(maker.params.buy.amount)
    })

    it('works with full fills(taker fully filled)', async () => {
      await ex.addOrder(orderMaker)
      await ex.addOrder(orderTaker)

      const remainingAmount = await ex.orderRemainingAmount(maker)

      expect(remainingAmount).toEqual(D('0'))
    })

    it('works with partial fills (taker fully filled)', async () => {
      const partialTaker = makeApprovalFixture(
        {
          params: {
            buy: { amount: maker.params.sell.amount.div(2) },
            sell: { amount: maker.params.buy.amount.div(2) }
          }
        },
        taker
      )

      const partialTakerOrder: IL2Order = {
        orderApproval: partialTaker,
        feeApproval: feeTaker
      }

      await ex.addOrder(orderMaker)
      await ex.addOrder(partialTakerOrder)

      const remainingAmount = await ex.orderRemainingAmount(maker)

      expect(remainingAmount).toEqual(maker.params.buy.amount.div(2))
    })
  })

  describe('asset management', () => {
    it('addAsset works', () => {
      const symbol = 'OAX'
      const address = '0x701C244b988a513c945973dEFA05de933b23Fe1D'

      expect(() => ex.addAsset(symbol, address)).not.toThrow()
    })
  })

  describe('openApprovals', () => {
    const makerBuy = {
      asset: USD,
      amount: D('6e10')
    }

    const makerSell = {
      asset: BTC,
      amount: D('1.2e11')
    }

    const makerApproval = makeApprovalFixture({
      params: {
        approvalId: 'right',
        buy: { asset: makerBuy.asset, amount: makerBuy.amount },
        sell: { asset: makerSell.asset, amount: makerSell.amount },
        intent: 'buyAll',
        owner: BOB
      }
    })

    const localOrderMaker: IL2Order = {
      orderApproval: makerApproval,
      feeApproval: feeMaker
    }

    const takerTemplate = makeApprovalFixture({
      params: {
        approvalId: 'left',
        buy: { asset: makerSell.asset, amount: makerSell.amount },
        sell: { asset: makerBuy.asset, amount: makerBuy.amount },
        intent: 'sellAll',
        owner: ALICE
      }
    })

    beforeEach(async () => {
      await ex.metaLedger.creditDeposit(
        makerApproval.params.sell.asset,
        makerApproval.params.owner,
        makerApproval.params.sell.amount.times(10),
        makerApproval.params.round
      )

      await ex.metaLedger.creditDeposit(
        feeMaker.params.sell.asset,
        feeMaker.params.owner,
        feeMaker.params.sell.amount.times(10),
        feeMaker.params.round
      )

      await creditDepositForOrder(localOrderMaker, ex)
    })

    it('works with no order', async () => {
      const openApprovals = await ex.openApprovals()

      expect(openApprovals).toEqual([])
    })

    it('works with no fills', async () => {
      await creditDepositForOrder(localOrderMaker, ex)

      await ex.addOrder(localOrderMaker)

      const openApprovals = await ex.openApprovals()

      expect(openApprovals).toEqual([makerApproval])
    })

    it('works with partial fills (taker fully filled)', async () => {
      const partialTaker = makeApprovalFixture(
        {
          params: {
            buy: { amount: makerSell.amount.div(2) },
            sell: { amount: makerBuy.amount.div(2) }
          }
        },
        takerTemplate
      )

      const orderPartialTaker: IL2Order = {
        orderApproval: partialTaker,
        feeApproval: feeTaker
      }

      await ex.addOrder(localOrderMaker)

      await creditDepositForOrder(orderPartialTaker, ex)

      await ex.addOrder(orderPartialTaker)

      const openApprovals = await ex.openApprovals()

      expect(openApprovals).toEqual([makerApproval])
    })

    it('works with full fills(taker fully filled)', async () => {
      const fullTaker = makeApprovalFixture(
        {
          params: {
            buy: { amount: makerSell.amount },
            sell: { amount: makerBuy.amount }
          }
        },
        takerTemplate
      )

      const orderFullTaker: IL2Order = {
        orderApproval: fullTaker,
        feeApproval: feeTaker
      }

      await creditDepositForOrder(orderFullTaker, ex)

      await ex.addOrder(localOrderMaker)
      await ex.addOrder(orderFullTaker)

      await expect(ex.openApprovals()).resolves.toEqual([])

      when(mockedOperator.round).thenReturn(1)

      await expect(ex.openApprovals()).resolves.toEqual([])
    })

    it('works with full fills(taker partially filled)', async () => {
      const fullTaker = makeApprovalFixture(
        {
          params: {
            buy: { amount: makerSell.amount.times(2) },
            sell: { amount: makerBuy.amount.times(2) }
          }
        },
        takerTemplate
      )

      const orderFullTaker: IL2Order = {
        orderApproval: fullTaker,
        feeApproval: feeTaker
      }

      await creditDepositForOrder(orderFullTaker, ex)

      await ex.addOrder(localOrderMaker)
      await ex.addOrder(orderFullTaker)

      const openApprovals = await ex.openApprovals()

      expect(openApprovals).toEqual([fullTaker])
    })
  })

  describe('approvalStatus', () => {
    const makerBuy = {
      asset: BTC,
      amount: D('1.2e13')
    }

    const makerSell = {
      asset: USD,
      amount: D('3e10')
    }

    const makerApproval = makeApprovalFixture({
      params: {
        approvalId: 'right',
        buy: { asset: makerBuy.asset, amount: makerBuy.amount },
        sell: { asset: makerSell.asset, amount: makerSell.amount },
        intent: 'buyAll',
        owner: BOB
      }
    })

    const localOrderMaker: IL2Order = {
      orderApproval: makerApproval,
      feeApproval: feeMaker
    }

    const takerApproval = makeApprovalFixture({
      params: {
        approvalId: 'left',
        buy: { asset: makerSell.asset, amount: makerSell.amount },
        sell: { asset: makerBuy.asset, amount: makerBuy.amount },
        intent: 'sellAll',
        owner: ALICE
      }
    })

    const localOrderTaker: IL2Order = {
      orderApproval: takerApproval,
      feeApproval: feeTaker
    }

    beforeEach(async () => {
      await creditDepositForOrder(localOrderMaker, ex)

      await creditDepositForOrder(localOrderTaker, ex)
    })

    it('works for open approval', async () => {
      await ex.addOrder(localOrderMaker)

      const status = await ex.approvalStatus(makerApproval)

      expect(status).toEqual('open')
    })

    it('works for closed approval', async () => {
      await ex.addOrder(localOrderMaker)
      await ex.addOrder(localOrderTaker)

      const status = await ex.approvalStatus(makerApproval)

      expect(status).toEqual('closed')
    })
  })

  describe('orderFilledAmount', () => {
    beforeEach(async () => {
      await creditDepositForOrder(orderMaker, ex)

      await creditDepositForOrder(orderTaker, ex)
    })

    it('works with no fills', async () => {
      await ex.addOrder(orderMaker)

      const remainingAmount = await ex.orderFilledAmount(maker)

      expect(remainingAmount).toEqual(D('0'))
    })

    it('works with full fills(taker fully filled)', async () => {
      await ex.addOrder(orderMaker)
      await ex.addOrder(orderTaker)

      const remainingAmount = await ex.orderFilledAmount(maker)

      expect(remainingAmount).toEqual(maker.params.buy.amount)
    })

    it('works with partial fills (taker fully filled)', async () => {
      const partialTaker = makeApprovalFixture(
        {
          params: {
            buy: { amount: maker.params.sell.amount.div(2) },
            sell: { amount: maker.params.buy.amount.div(2) }
          }
        },
        taker
      )

      const partialTakerOrder: IL2Order = {
        orderApproval: partialTaker,
        feeApproval: feeTaker
      }

      await ex.addOrder(orderMaker)
      await ex.addOrder(partialTakerOrder)

      const remainingAmount = await ex.orderFilledAmount(maker)

      expect(remainingAmount).toEqual(maker.params.buy.amount.div(2))
    })
  })

  describe('approvalToOrder', () => {
    describe('without fills', () => {
      let clock: lolex.Clock

      beforeEach(() => {
        clock = lolex.install()
      })

      afterEach(() => {
        clock.uninstall()
      })

      it('without fees', async () => {
        await creditDepositForOrder(orderMaker, ex)
        await ex.addOrder(orderMaker)

        const order = await ex.approvalToOrder(maker)

        const expectedOrder = {
          id: maker.params.approvalId,
          status: 'open',
          symbol: 'USD/BTC',
          type: 'limit',
          side: 'buy',
          price: D('0.5'),
          amount: maker.params.buy.amount,
          filled: D('0'),
          remaining: maker.params.buy.amount,
          trades: [],
          timestamp: 0,
          datetime: '1970-01-01T00:00:00.000Z'
        }

        expect(order).toMatchObject(expectedOrder)
      })
    })
  })

  describe('orderBook', () => {
    const bids = [
      makeApprovalFixture({
        params: {
          approvalId: '1',
          buy: { asset: USD, amount: D('2e10') },
          sell: { asset: BTC, amount: D('8e10') },
          intent: 'buyAll',
          owner: BOB
        }
      }),
      makeApprovalFixture({
        params: {
          approvalId: '2',
          buy: { asset: USD, amount: D('1e10') },
          sell: { asset: BTC, amount: D('4e10') },
          intent: 'buyAll',
          owner: BOB
        }
      }),
      makeApprovalFixture({
        params: {
          approvalId: '3',
          buy: { asset: USD, amount: D('3e10') },
          sell: { asset: BTC, amount: D('1e10') },
          intent: 'buyAll',
          owner: BOB
        }
      })
    ]

    const asks = [
      makeApprovalFixture({
        params: {
          approvalId: '4',
          buy: { asset: BTC, amount: D('3e10') },
          sell: { asset: USD, amount: D('1e10') },
          intent: 'sellAll',
          owner: ALICE
        }
      })
    ]

    let clock: lolex.Clock

    beforeEach(async () => {
      for (const bid of bids) {
        await ex.metaLedger.creditDeposit(
          bid.params.sell.asset,
          bid.params.owner,
          bid.params.sell.amount,
          bid.params.round
        )
      }

      for (const ask of asks) {
        await ex.metaLedger.creditDeposit(
          ask.params.sell.asset,
          ask.params.owner,
          ask.params.sell.amount,
          ask.params.round
        )
      }

      clock = lolex.install()

      for (const bid of bids) {
        await ex.storeApproval(bid)
      }
      for (const ask of asks) {
        await ex.storeApproval(ask)
      }
    })

    afterEach(() => {
      clock.uninstall()
    })

    it('orderBook works', async () => {
      const orderBook = await ex.orderBook({ base: USD, quote: BTC })

      expect(orderBook).toEqual({
        symbol: 'USD/BTC',
        level: 'L2',
        bids: [
          { price: D('4'), amount: D('3e10') },
          { price: D('0.33333333'), amount: D('3e10') }
        ],
        asks: [{ price: D('3'), amount: D('1e10') }],
        timestamp: 0,
        datetime: '1970-01-01T00:00:00.000Z'
      })
    })

    it('works for level 1', async () => {
      const orderBook = await ex.orderBook(
        { base: USD, quote: BTC },
        { level: 'L1' }
      )

      expect(orderBook).toEqual({
        symbol: 'USD/BTC',
        level: 'L1',
        bids: [{ price: D('4'), amount: D('3e10') }],
        asks: [{ price: D('3'), amount: D('1e10') }],
        timestamp: 0,
        datetime: '1970-01-01T00:00:00.000Z'
      })
    })

    it('works for level 1', async () => {
      const orderBook = await ex.orderBook(
        { base: USD, quote: BTC },
        { level: 'L1' }
      )

      expect(orderBook).toEqual({
        symbol: 'USD/BTC',
        level: 'L1',
        bids: [{ price: D('4'), amount: D('3e10') }],
        asks: [{ price: D('3'), amount: D('1e10') }],
        timestamp: 0,
        datetime: '1970-01-01T00:00:00.000Z'
      })
    })

    it('works for level 2', async () => {
      const orderBook = await ex.orderBook(
        { base: USD, quote: BTC },
        { level: 'L2' }
      )

      expect(orderBook).toEqual({
        symbol: 'USD/BTC',
        level: 'L2',
        bids: [
          { price: D('4'), amount: D('3e10') },
          { price: D('0.33333333'), amount: D('3e10') }
        ],
        asks: [{ price: D('3'), amount: D('1e10') }],
        timestamp: 0,
        datetime: '1970-01-01T00:00:00.000Z'
      })
    })

    it('works for level 3', async () => {
      const orderBook = await ex.orderBook(
        { base: USD, quote: BTC },
        { level: 'L3' }
      )

      expect(orderBook).toEqual({
        symbol: 'USD/BTC',
        level: 'L3',
        bids: [
          { price: D('4'), amount: D('2e10') },
          { price: D('4'), amount: D('1e10') },
          { price: D('0.33333333'), amount: D('3e10') }
        ],
        asks: [{ price: D('3'), amount: D('1e10') }],
        timestamp: 0,
        datetime: '1970-01-01T00:00:00.000Z'
      })
    })
  })

  describe('marketForSymbol', () => {
    it('marketForSymbol works', () => {
      const symbol = 'USD/BTC'
      const market = ex.marketForSymbol(symbol)

      expect(market).toEqual({
        base: USD,
        quote: BTC
      })
    })

    it('throws when base is not registered', () => {
      const symbol = 'UNKNOWN/BTC'
      expect(() => ex.marketForSymbol(symbol)).toThrow(
        `No market for symbol '${symbol}'`
      )
    })

    it('throws when quote is not registered', () => {
      const symbol = 'USD/UNKNOWN'
      expect(() => ex.marketForSymbol(symbol)).toThrow(
        `No market for symbol '${symbol}'`
      )
    })

    it('throws when an empty string is given', () => {
      const symbol = ''
      expect(() => ex.marketForSymbol(symbol)).toThrow(
        `No market for symbol ''`
      )
    })
  })

  describe('fetch approvals and fills', () => {
    let fees: ISignedApproval[]
    let approvals: ISignedApproval[]

    const makeApproval = ({ id, owner }: { id: ApprovalId; owner: Address }) =>
      makeApprovalFixture({
        params: {
          approvalId: id,
          buy: { asset: USD },
          sell: { asset: BTC },
          owner
        }
      })

    const approval1 = makeApproval({ id: '1', owner: BOB })
    const approval2 = makeApproval({ id: '2', owner: BOB })
    const approval3 = makeApproval({ id: '3', owner: ALICE })

    beforeEach(async () => {
      approvals = [approval1, approval2, approval3]
      fees = approvals.map(approval =>
        mkFeeWith({
          approvalId: `fee-${approval.params.approvalId}`,
          owner: approval.params.owner
        })
      )

      for (const [orderApproval, feeApproval] of R.zip(approvals, fees)) {
        const order: IL2Order = {
          orderApproval,
          feeApproval
        }

        await creditDepositForOrder(order, ex)
        await ex.addOrder(order)
      }
    })

    it('fetchApprovals works', async () => {
      const result = (await ex.fetchApprovals(BOB)).map(
        ({ approval }) => approval
      )

      const [fee1, fee2] = fees

      expect(result).toHaveLength(4)
      expect(result).toContainEqual(approval1)
      expect(result).toContainEqual(approval2)
      expect(result).toContainEqual(fee1)
      expect(result).toContainEqual(fee2)
    })

    it('fetching fills works', async () => {
      const result: ISignedFill[] = await ex.fetchFills(BOB, ex.round)

      expect(result).toHaveLength(2)
      const fill1: ISignedFill = result[0]
      const fill2: ISignedFill = result[1]

      const feeApproval1: ISignedApproval = mkFeeWith({
        approvalId: `fee-${approval1.params.approvalId}`,
        owner: approval1.params.owner
      })

      const feeApproval2: ISignedApproval = mkFeeWith({
        approvalId: `fee-${approval2.params.approvalId}`,
        owner: approval1.params.owner
      })

      expect(fill1.params.approvalId).toEqual(feeApproval1.params.approvalId)
      expect(fill2.params.approvalId).toEqual(feeApproval2.params.approvalId)
    })
  })

  describe('fetchOrder', () => {
    it('fetchOrder works', async () => {
      const approval = makeApprovalFixture({
        params: {
          buy: { asset: USD },
          sell: { asset: BTC }
        }
      })

      await ex.metaLedger.register(approval.params.owner, 0)

      const order: IL2Order = {
        orderApproval: approval,
        feeApproval: feeApprovalTemplate
      }

      await creditDepositForOrder(order, ex)

      await ex.addOrder(order)

      const result = await ex.fetchOrder(approval.params.approvalId)
      const expectedOrder = await ex.approvalToOrder(approval)

      expect(result).toEqual(expectedOrder)
    })

    it('returns null if order not found', async () => {
      const result = await ex.fetchOrder('non-existent-order')

      expect(result).toBeNull()
    })
  })

  describe('with orders', () => {
    const makeApproval = ({
      id,
      owner,
      flip
    }: {
      id: ApprovalId
      owner: Address
      flip?: boolean
    }) =>
      makeApprovalFixture({
        params: {
          approvalId: id,
          buy: { asset: flip ? BTC : USD },
          sell: { asset: flip ? USD : BTC },
          owner
        }
      })

    const makeOrder = (approval: ISignedApproval): IL2Order => ({
      orderApproval: approval,
      feeApproval: mkFeeWith({
        approvalId: `fee-${approval.params.approvalId}`,
        owner: approval.params.owner
      })
    })

    const approval1 = makeApproval({ id: '1', owner: BOB })
    const order1 = makeOrder(approval1)

    const approval2 = makeApproval({ id: '2', owner: BOB })

    const approval3 = makeApproval({ id: '3', owner: ALICE })

    const approval4 = makeApproval({ id: '4', owner: ALICE, flip: true })
    const order4 = makeOrder(approval4)

    describe('fetchOrders', () => {
      it('fetchOrders works', async () => {
        for (const approval of [approval1, approval2, approval3]) {
          const order = makeOrder(approval)
          await creditDepositForOrder(order, ex)
          await ex.addOrder(order)
        }

        const result = await ex.fetchOrders(BOB)
        const expectedOrder1 = await ex.approvalToOrder(approval1)
        const expectedOrder2 = await ex.approvalToOrder(approval2)

        expect(expectedOrder1.timestamp).toBeLessThan(expectedOrder2.timestamp)

        expect(result).toHaveLength(2)
        expect(result).toContainEqual(expectedOrder1)
        expect(result).toContainEqual(expectedOrder2)
      })

      it('returns empty array if address has no orders', async () => {
        const result = await ex.fetchOrders('non-existent-order')

        expect(result).toEqual([])
      })

      it('orders from previous round is marked as closed', async () => {
        const order = makeOrder(approval1)
        await creditDepositForOrder(order, ex)
        await ex.addOrder(order)

        when(mockedOperator.round).thenReturn(approval1.params.round + 1)

        const result = await ex.fetchOrders(approval1.params.owner)

        expect(ex.round).toEqual(approval1.params.round + 1)

        expect(result).toMatchObject([
          {
            id: approval1.params.approvalId,
            status: 'closed'
          }
        ])
      })
    })

    describe('fetchTradesInternal', () => {
      it('fetchTradesInternal works', async () => {
        for (const approval of [approval1, approval2, approval3, approval4]) {
          const order = makeOrder(approval)
          await creditDepositForOrder(order, ex)
          await ex.addOrder(order)
        }

        const trades = await ex.fetchTradesInternal({ base: USD, quote: BTC })
        expect(trades).not.toEqual([])
        expect(trades).toMatchObject([
          {
            left: { approvalId: '4', sell: D('2e10') },
            right: { approvalId: '1', sell: D('2e10') }
          }
        ])
      })

      it('fetchTradesInternal works for non-existing pair', async () => {
        const trades = await ex.fetchTradesInternal({
          base: 'YYY',
          quote: 'XXX'
        })
        expect(trades).toEqual([])
      })

      it('shows fills from other rounds correctly', async () => {
        await creditDepositForOrder(order1, ex)

        await creditDepositForOrder(order4, ex)

        await ex.addOrder(order1)
        await ex.addOrder(order4)
        jest.spyOn(ex, 'round', 'get').mockReturnValue(1)

        const trades = await ex.fetchTradesInternal({ base: USD, quote: BTC })
        expect(trades).toMatchObject([
          {
            left: { approvalId: '4', sell: D('2e10') },
            right: { approvalId: '1', sell: D('2e10') }
          }
        ])
      })
    })

    describe('fetchTradesExternal', () => {
      it('fetchTradesExternal works', async () => {
        await creditDepositForOrder(orderMaker, ex)
        await creditDepositForOrder(orderTaker, ex)

        await ex.addOrder(orderMaker)
        await ex.addOrder(orderTaker)

        const trades = await ex.fetchTradesPublic({ base: USD, quote: BTC })
        expect(trades).not.toEqual([])
        expect(trades).toMatchObject([
          {
            // sell:BTC buy:USD in USD/BTC market => price is in BTC per USD
            price: maker.params.sell.amount.div(maker.params.buy.amount),
            order: maker.params.approvalId,
            amount: maker.params.buy.amount,
            // maker buy: USD which is the base
            side: 'buy',
            symbol: 'USD/BTC'
          }
        ])
      })
    })
  })

  describe('Handling fees', () => {
    describe('with wrong fee approval', () => {
      let newFeeApproval: ISignedApproval

      beforeEach(async () => {
        newFeeApproval = R.clone(feeApprovalTemplate)
        await creditDepositForOrder(orderMaker, ex)
      })

      it('raises an exception if the fee approval intent is not sellAll', async () => {
        newFeeApproval.params.intent = 'buyAll'

        const order: IL2Order = {
          orderApproval: maker,
          feeApproval: newFeeApproval
        }

        await expect(ex.addOrder(order)).rejects.toThrow(FeeWrongFormatError)
      })

      it('raises an exception if the fee approval buy amount is not 0', async () => {
        newFeeApproval.params.buy.amount = D('10')
        const order: IL2Order = {
          orderApproval: maker,
          feeApproval: newFeeApproval
        }

        await expect(ex.addOrder(order)).rejects.toThrow(FeeWrongFormatError)
      })

      it('raises an exception if the buy asset is not OAX (defined in config)', async () => {
        newFeeApproval.params.buy.asset = BTC
        const order: IL2Order = {
          orderApproval: maker,
          feeApproval: newFeeApproval
        }

        await expect(ex.addOrder(order)).rejects.toThrow(FeeWrongFormatError)
      })

      it('raises an exception if the sell asset is not OAX (defined in config)', async () => {
        newFeeApproval.params.sell.asset = BTC
        const order: IL2Order = {
          orderApproval: maker,
          feeApproval: newFeeApproval
        }

        await expect(ex.addOrder(order)).rejects.toThrow(FeeWrongFormatError)
      })

      it('raises an exception if the sell amount is 0', async () => {
        newFeeApproval.params.sell.amount = D('0')
        const order: IL2Order = {
          orderApproval: maker,
          feeApproval: newFeeApproval
        }

        await expect(ex.addOrder(order)).rejects.toThrow(WrongFeeStructureError)
      })

      it('raises an exception if the sell amount is too low', async () => {
        newFeeApproval.params.sell.amount = CONSTANT_FEE.minus(1)
        const order: IL2Order = {
          orderApproval: maker,
          feeApproval: newFeeApproval
        }

        await expect(ex.addOrder(order)).rejects.toThrow(WrongFeeStructureError)
      })

      it('raises an exception if the sell amount is too high', async () => {
        newFeeApproval.params.sell.amount = CONSTANT_FEE.plus(1)
        const order: IL2Order = {
          orderApproval: maker,
          feeApproval: newFeeApproval
        }

        await expect(ex.addOrder(order)).rejects.toThrow(WrongFeeStructureError)
      })
    })

    describe('with a correct fee approval', () => {
      const operatorAddress: Address = operatorWallet.address

      const balance = (who: Address) => {
        return ex.metaLedger.balances(who, ex.round)
      }

      const balances = async (): Promise<{ [key: string]: IBalances }> => {
        return {
          [BOB]: await balance(BOB),
          [ALICE]: await balance(ALICE),
          [operatorAddress]: await balance(operatorAddress)
        }
      }

      beforeEach(async () => {
        await creditDepositForOrder(orderMaker, ex)
        when(mockedOperator.signFill(anything())).thenResolve(SOME_SIGNATURE)
      })

      afterEach(async () => {
        reset(mockedOperator)
        jest.resetAllMocks()
      })

      it('checks that the approval is stored and the corresponding fill gets created and is stored as well', async () => {
        //At the beginning there is no approval/fill for the fee
        const feeApprovalId = orderMaker.feeApproval.params.approvalId

        const approvals: ISignedApproval[] = await ex.metaLedger.getApprovals({
          approvalId: feeApprovalId
        })
        expect(approvals).toEqual([])

        const fills: ISignedFill[] = await ex.metaLedger.getFills({
          approvalId: feeApprovalId
        })
        expect(fills).toEqual([])

        // The order is added
        await ex.addOrder(orderMaker)

        // The fee approval is stored
        const approval = (await ex.metaLedger.getApprovals({
          approvalId: feeApprovalId
        }))[0]
        expect(approval).toEqual(orderMaker.feeApproval)

        // The fee fill is created and stored
        const fill = (await ex.metaLedger.getFills({
          approvalId: feeApprovalId
        }))[0]

        expect(fill.params.instanceId).toEqual(feeMaker.params.instanceId)
        expect(fill.params.clientAddress).toEqual(feeMaker.params.owner)
        expect(fill.params.sellAsset).toEqual(feeMaker.params.sell.asset)
        expect(fill.params.sellAmount).toEqual(feeMaker.params.sell.amount)
        expect(fill.params.buyAsset).toEqual(feeMaker.params.buy.asset)
        expect(fill.params.buyAmount).toEqual(feeMaker.params.buy.amount)
        expect(fill.params.approvalId).toEqual(feeMaker.params.approvalId)
        expect(fill.params.round).toEqual(feeMaker.params.round)

        expect(fill.signature).toEqual(SOME_SIGNATURE)
      })

      it('checks that once the fee approval and fill are stored, the balances are updated correctly', async () => {
        await creditDepositForOrder(orderTaker, ex)

        const operator = operatorWallet.address

        const before = await balances()

        await ex.addOrder(orderMaker)
        await ex.addOrder(orderTaker)

        const after = await balances()

        const diff = (who: Address, asset: Address) => {
          return after[who][asset].minus(before[who][asset])
        }

        const feeAmount = orderMaker.feeApproval.params.sell.amount

        const {
          sell: { amount: makerSell },
          buy: { amount: makerBuy }
        } = orderMaker.orderApproval.params

        expect(diff(BOB, BTC)).toEqual(makerSell.negated())
        expect(diff(BOB, USD)).toEqual(makerBuy)
        expect(diff(BOB, OAX)).toEqual(feeAmount.negated())

        const {
          sell: { amount: takerSell },
          buy: { amount: takerBuy }
        } = orderTaker.orderApproval.params

        expect(diff(ALICE, BTC)).toEqual(takerBuy)
        expect(diff(ALICE, USD)).toEqual(takerSell.negated())
        expect(diff(ALICE, OAX)).toEqual(feeAmount.negated())

        // We created 2 orders, hence 2 fees.
        expect(diff(operator, OAX)).toEqual(feeAmount.times('2'))
      })

      it('if the approval is not backed, the fee is not collected', async () => {
        const feeBalanceBefore = (await balance(operatorAddress))[OAX]

        await ex.addOrder(orderMaker)

        // not backed, not added
        await creditDepositApproval(orderTaker.feeApproval, ex)

        await expect(ex.addOrder(orderTaker)).rejects.toThrow()

        const feeBalanceAfter = (await balance(operatorAddress))[OAX]

        const totalFees = orderTaker.feeApproval.params.sell.amount

        expect(feeBalanceAfter.minus(feeBalanceBefore)).toEqual(totalFees)
      })
    })
  })

  describe('addOrder', () => {
    beforeEach(async () => {
      await creditDepositForOrder(orderMaker, ex)
      await creditDepositForOrder(orderTaker, ex)
    })

    it('addOrder works', async () => {
      const noTrades = await ex.addOrder(orderMaker)
      expect(noTrades).toHaveLength(0)
      const trades = await ex.addOrder(orderTaker)
      expect(trades).toHaveLength(1)
      const [trade] = trades
      expect(trade.left.approvalId).toEqual('left')
      expect(trade.right.approvalId).toEqual('right')
    })

    it('matches orders from the same address', async () => {
      const owner = orderMaker.orderApproval.params.owner
      const taker = R.clone(orderTaker)
      taker.orderApproval.params.owner = owner
      taker.feeApproval.params.owner = owner

      await creditDepositForOrder(taker, ex)

      await ex.addOrder(orderMaker)
      await expect(ex.addOrder(taker)).resolves.toMatchObject([
        {
          left: { approvalId: 'left' },
          right: { approvalId: 'right' }
        }
      ])
    })

    it('matches matching orders if the price computation requires rounding', async () => {
      const maker = {
        ...orderMaker,
        orderApproval: makeApprovalFixture(
          {
            params: { buy: { amount: D('1e10') }, sell: { amount: D('3e10') } }
          },
          orderMaker.orderApproval
        )
      }
      const taker = {
        ...orderTaker,
        orderApproval: makeApprovalFixture(
          {
            params: { buy: { amount: D('3e10') }, sell: { amount: D('1e10') } }
          },
          orderTaker.orderApproval
        )
      }

      await creditDepositForOrder(maker, ex)
      await creditDepositForOrder(taker, ex)

      await ex.addOrder(maker)
      await expect(ex.addOrder(taker)).resolves.toMatchObject([
        {
          left: { approvalId: 'left' },
          right: { approvalId: 'right' }
        }
      ])
    })

    it('does not match non-matching orders if the rounded prices are the same', async () => {
      const maker = {
        ...orderMaker,
        orderApproval: makeApprovalFixture(
          {
            params: {
              buy: { amount: D('1.000000000000000000001e30') },
              sell: { amount: D('3e30') }
            }
          },
          orderMaker.orderApproval
        )
      }
      const taker = {
        ...orderTaker,
        orderApproval: makeApprovalFixture(
          {
            params: { buy: { amount: D('3e30') }, sell: { amount: D('1e30') } }
          },
          orderTaker.orderApproval
        )
      }

      await creditDepositForOrder(maker, ex)
      await creditDepositForOrder(taker, ex)

      await ex.addOrder(maker)
      await expect(ex.addOrder(taker)).resolves.toMatchObject([])
    })

    describe('addOrder checks that each approval is syntactically correct', () => {
      it('does not enter into a deadlock after the first failed addOrder', async () => {
        const signedApproval = orderMaker.orderApproval

        const negativeBuyAmountApproval = R.mergeDeepRight(signedApproval, {
          params: {
            buy: { asset: signedApproval.params.buy.asset, amount: D('-100') }
          }
        })

        const negativeBuyAmountOrder: IL2Order = {
          orderApproval: negativeBuyAmountApproval,
          feeApproval: mkFeeWith({
            approvalId: `fee-${negativeBuyAmountApproval.params.approvalId}`,
            owner: negativeBuyAmountApproval.params.owner
          })
        }

        //Fails
        await expect(ex.addOrder(negativeBuyAmountOrder)).rejects.toThrow()

        //Fails again but no deadlock
        await expect(ex.addOrder(negativeBuyAmountOrder)).rejects.toThrow()
      })

      it('throws if buy amount is <= 0 (for order approval)', async () => {
        const signedApproval = orderMaker.orderApproval

        // Negative amount

        const negativeBuyAmountApproval = R.mergeDeepRight(signedApproval, {
          params: {
            buy: { asset: signedApproval.params.buy.asset, amount: D('-100') }
          }
        })

        const negativeBuyAmountOrder: IL2Order = {
          orderApproval: negativeBuyAmountApproval,
          feeApproval: mkFeeWith({
            approvalId: `fee-${negativeBuyAmountApproval.params.approvalId}`,
            owner: negativeBuyAmountApproval.params.owner
          })
        }

        await expect(ex.addOrder(negativeBuyAmountOrder)).rejects.toThrow(
          AmountError
        )

        // Zero buy amount

        const zeroBuyAmountApproval = R.mergeDeepRight(signedApproval, {
          params: {
            buy: { asset: signedApproval.params.buy.asset, amount: D('0') }
          }
        })

        const zeroBuyAmountOrder: IL2Order = {
          orderApproval: zeroBuyAmountApproval,
          feeApproval: mkFeeWith({
            approvalId: `fee-123`,
            owner: zeroBuyAmountApproval.params.owner
          })
        }

        await creditDepositForOrder(zeroBuyAmountOrder, ex)

        await expect(ex.addOrder(zeroBuyAmountOrder)).rejects.toThrow(
          AmountError
        )
      })

      it('throws if buy amount is < 0 (for fee approval)', async () => {
        const feeApproval = orderMaker.feeApproval

        const feeApprovalWithNegativeAmount = R.mergeDeepRight(feeApproval, {
          params: {
            buy: { asset: feeApproval.params.buy.asset, amount: D('-100') }
          }
        })

        const orderWithNegativeBuyAmount: IL2Order = {
          orderApproval: orderMaker.orderApproval,
          feeApproval: feeApprovalWithNegativeAmount
        }

        await expect(ex.addOrder(orderWithNegativeBuyAmount)).rejects.toThrow(
          FeeWrongFormatError
        )
      })

      it('throws if sell amount is <= 0', async () => {
        const signedApproval = orderMaker.orderApproval

        const negativeBuyAmountApproval = R.mergeDeepRight(signedApproval, {
          params: {
            buy: { asset: signedApproval.params.sell.asset, amount: D('-100') }
          }
        })

        const orderWithNegativeSellAmount: IL2Order = {
          orderApproval: negativeBuyAmountApproval,
          feeApproval: mkFeeWith({
            approvalId: `fee-${negativeBuyAmountApproval.params.approvalId}`,
            owner: negativeBuyAmountApproval.params.owner
          })
        }

        await expect(ex.addOrder(orderWithNegativeSellAmount)).rejects.toThrow(
          AmountError
        )
      })

      it('throws if client is not registered', async () => {
        const signedApproval = orderMaker.orderApproval

        const approvalWithUnregisteredUser = R.mergeDeepRight(signedApproval, {
          params: {
            owner: SOME_ADDRESS
          }
        })

        const orderWithUnregisteredUser: IL2Order = {
          orderApproval: approvalWithUnregisteredUser,
          feeApproval: orderMaker.feeApproval
        }

        await expect(ex.addOrder(orderWithUnregisteredUser)).rejects.toThrow(
          UnregisteredUserError
        )
      })

      it('throws if ownerSig is invalid', async () => {
        const order = approvalFixtures.l2order
        const signedApproval = order.orderApproval

        await ex.metaLedger.register(signedApproval.params.owner, 0)
        const wrongOwner = ALICE

        const wronglySignedApproval = R.mergeDeepRight(signedApproval, {
          params: {
            owner: wrongOwner
          }
        })

        const l2orderWithWrongSig: IL2Order = {
          orderApproval: wronglySignedApproval,
          feeApproval: feeMaker
        }

        expect(wrongOwner).not.toEqual(signedApproval.params.owner)
        await expect(ex.createOrder(l2orderWithWrongSig)).rejects.toThrow(
          SignatureError
        )
      })

      it('throws if approval request round does not match Exchange round', async () => {
        const l2order = approvalFixtures.l2order
        const signedApproval = l2order.orderApproval

        await ex.metaLedger.register(signedApproval.params.owner, 0)

        const newRound = ex.round + 1
        const mockRound = jest.spyOn(ex, 'round', 'get')
        mockRound.mockImplementation(() => newRound)

        expect(signedApproval.params.round).not.toEqual(newRound)
        await expect(ex.createOrder(l2order)).rejects.toThrow(
          RoundMismatchError
        )
      })

      it("throws if the asset addresses aren't registered", async () => {
        const l2order = approvalFixtures.l2order
        const signedApproval = l2order.orderApproval

        // create exchange with other pair
        ex = await mkExchange({ decimalPlaces: 8, pairs: ['OAX/WETH'] })
        await ex.metaLedger.register(signedApproval.params.owner, 0)

        await expect(ex.createOrder(l2order)).rejects.toThrow(
          'No market for symbol'
        )
      })

      it("throws if the trading pair doesn't exist", async () => {
        const l2order = approvalFixtures.l2order
        const signedApproval = l2order.orderApproval

        // create exchange with other pair
        ex = await mkExchange({ decimalPlaces: 8, pairs: [] })
        ex.addAsset('BTC', BTC)
        ex.addAsset('OAX', OAX)
        ex.addAsset('USD', USD)
        await ex.metaLedger.register(signedApproval.params.owner, 0)

        await expect(ex.createOrder(l2order)).rejects.toThrow(
          "No market for symbol 'BTC/USD'"
        )
      })

      it('throws if the trading pair is wrongly ordered', async () => {
        const l2order = approvalFixtures.l2order
        const signedApproval = l2order.orderApproval

        // create exchange with inverted pair
        ex = await mkExchange({ decimalPlaces: 8, pairs: ['USD/BTC'] })
        ex.addAsset('BTC', BTC)
        ex.addAsset('USD', USD)
        await ex.metaLedger.register(signedApproval.params.owner, 0)

        await expect(ex.createOrder(l2order)).rejects.toThrow(
          "No market for symbol 'BTC/USD'"
        )
      })

      it('throws if any approval amount is not representable', async () => {
        const order = approvalFixtures.l2order
        const signedApproval = order.orderApproval

        ex = await mkExchange({ decimalPlaces: 8, pairs: ['BTC/USD'] })
        ex.addAsset('BTC', BTC)
        ex.addAsset('USD', USD)
        await ex.metaLedger.register(signedApproval.params.owner, 0)

        // The signature is wrong after modifying the amount.
        jest.spyOn(ex, 'verifyApprovalSig').mockReturnValue(undefined)

        // would require 9 decimals
        const amount = D(`1e${TOKEN_DECIMALS - 9}`)

        for (const side of ['buy', 'sell']) {
          const approval = makeApprovalFixture(
            { params: { [side]: { amount } } },
            signedApproval
          )

          const feeAppproval = computeFeeApproval(
            approval.params,
            exchangeFixtures.OAX,
            CONSTANT_FEE,
            FEE_SALT
          )
          const signedFeeApproval: ISignedApproval = {
            params: feeAppproval,
            ownerSig
          }

          const order: IL2Order = {
            orderApproval: approval,
            feeApproval: signedFeeApproval
          }

          await expect(ex.createOrder(order)).rejects.toThrow(PrecisionError)
        }
      })

      it('throws if the instanceId is wrong', async () => {
        const signedApproval = orderMaker.orderApproval

        const WRONG_INSTANCE_ID = NULL_ADDRESS

        const approvalWithWrongInstanceId = R.mergeDeepRight(signedApproval, {
          params: {
            instanceId: WRONG_INSTANCE_ID
          }
        })

        const orderWithWrongInstanceId: IL2Order = {
          orderApproval: approvalWithWrongInstanceId,
          feeApproval: orderMaker.feeApproval
        }

        await expect(ex.addOrder(orderWithWrongInstanceId)).rejects.toThrow(
          WrongInstanceIdError
        )
      })

      it('throws if the fee approval does not match the fee structure', async () => {
        const feeApproval = orderMaker.feeApproval

        const feeApprovalWithWrongFeeStructure = R.mergeDeepRight(feeApproval, {
          params: {
            sell: { asset: feeApproval.params.sell.asset, amount: D('5') }
          }
        })

        const orderWithWrongFeeStructure: IL2Order = {
          orderApproval: orderMaker.orderApproval,
          feeApproval: feeApprovalWithWrongFeeStructure
        }

        await expect(ex.addOrder(orderWithWrongFeeStructure)).rejects.toThrow(
          WrongFeeStructureError
        )
      })

      it('addOrder does not fill the same approval twice', async () => {
        await ex.addOrder(orderMaker)
        await ex.addOrder(orderTaker)

        await expect(ex.addOrder(orderTaker)).rejects.toThrow(
          'Insufficient balance'
        )
      })

      it('computation of remaining amounts does not cause rounding errors', async () => {
        const makeApproval = ({
          id,
          owner,
          buyAmount,
          sellAmount,
          intent
        }: {
          id: ApprovalId
          owner: Address
          buyAmount: Amount
          sellAmount: Amount
          intent: Intent
        }) =>
          makeApprovalFixture({
            params: {
              approvalId: id,
              buy: { asset: owner == BOB ? USD : BTC, amount: buyAmount },
              sell: { asset: owner == BOB ? BTC : USD, amount: sellAmount },
              owner,
              intent
            }
          })

        const approval1 = makeApproval({
          id: '1',
          owner: BOB,
          buyAmount: D('7e11'),
          sellAmount: D('3e11'),
          intent: 'buyAll'
        })
        const approval2 = makeApproval({
          id: '2',
          owner: ALICE,
          buyAmount: D('2e10'),
          sellAmount: D('8e10'),
          intent: 'sellAll'
        })
        const approval3 = makeApproval({
          id: '3',
          owner: ALICE,
          buyAmount: D('3e10'),
          sellAmount: D('7e10'),
          intent: 'sellAll'
        })

        const approvals = [approval1, approval2, approval3]
        const fees = approvals.map(approval =>
          mkFeeWith({
            approvalId: `fee-${approval.params.approvalId}`,
            owner: approval.params.owner
          })
        )

        const orders: IL2Order[] = R.zipWith(
          (orderApproval, feeApproval) => ({ orderApproval, feeApproval }),
          approvals,
          fees
        )
        for (const order of orders) {
          await creditDepositForOrder(order, ex)
        }
        await ex.addOrder(orders[0])

        await expect(ex.addOrder(orders[1])).resolves.toMatchObject([
          {
            // taker sells everything
            left: { sell: D('8e10') },
            // taker buys 3 / 7 * 8 = 3.42.. which is rounded to 3 to stay within
            // exchange precision of 8 decimals (=> base unit is 1e10)
            right: { sell: D('3e10') }
          }
        ])
        await expect(ex.addOrder(orders[2])).resolves.toMatchObject([
          {
            left: { sell: D('7e10') },
            right: { sell: D('3e10') }
          }
        ])
      })

      it('respects time priority', async () => {})

      it('stores matching priority', async () => {
        await ex.addOrder(orderMaker)
        await ex.addOrder(orderTaker)

        const first = await ex.fetchApprovalPriority(
          orderMaker.orderApproval.params.approvalId
        )
        const second = await ex.fetchApprovalPriority(
          orderTaker.orderApproval.params.approvalId
        )
        expect(first).toBeLessThan(second)
      })

      describe('when executing at better price than approved', () => {
        it('only reserves remaining required sell amount', async () => {
          const makerApproval: ISignedApproval = {
            params: {
              approvalId: 'right',
              buy: { asset: USD, amount: D('2e10') },
              sell: { asset: BTC, amount: D('2e10') },
              round: 0,
              intent: 'buyAll',
              owner: BOB,

              instanceId: SOME_ADDRESS
            },
            ownerSig
          }

          const orderMakerLocal: IL2Order = {
            orderApproval: makerApproval,
            feeApproval: mkFeeWith({
              approvalId: `fee-${makerApproval.params.approvalId}`,
              owner: makerApproval.params.owner
            })
          }

          await creditDepositForOrder(orderMakerLocal, ex)

          await ex.addOrder(orderMakerLocal)

          const takerApproval: ISignedApproval = {
            params: {
              approvalId: 'left',
              buy: { asset: BTC, amount: D('1e10') },
              sell: { asset: USD, amount: D('2e10') },
              round: 0,
              intent: 'buyAll',
              owner: ALICE,

              instanceId: SOME_ADDRESS
            },
            ownerSig
          }

          const orderTakerLocal: IL2Order = {
            orderApproval: takerApproval,
            feeApproval: mkFeeWith({
              approvalId: `fee-${takerApproval.params.approvalId}`,
              owner: takerApproval.params.owner
            })
          }

          await creditDepositForOrder(orderTakerLocal, ex)

          const [first] = await ex.addOrder(orderTakerLocal)

          expect(first.left.sell).toEqual(D('1e10'))

          const newTaker: ISignedApproval = {
            params: {
              approvalId: 'left-new',
              buy: { asset: BTC, amount: D('1e10') },
              sell: { asset: USD, amount: D('1e10') },
              round: 0,
              intent: 'buyAll',
              owner: ALICE,

              instanceId: SOME_ADDRESS
            },
            ownerSig
          }

          const newTakerFee = mkFeeWith({
            approvalId: `fee-${newTaker.params.approvalId}`,
            owner: newTaker.params.owner
          })

          const newTakerOrder: IL2Order = {
            orderApproval: newTaker,
            feeApproval: newTakerFee
          }

          await creditDepositForOrder(newTakerOrder, ex)

          const [second] = await ex.addOrder(newTakerOrder)
          expect(second.left.sell).toEqual(D('1e10'))
        })
      })

      describe('when moving on to next round', () => {
        let newRound: Round

        beforeEach(async () => {
          await ex.addOrder(orderMaker)

          newRound = ex.round + 1
          when(mockedOperator.round).thenReturn(newRound)
        })

        it('accepts approval with correct round', async () => {
          const newOrderApproval: ISignedApproval = R.mergeDeepRight(taker, {
            params: { round: newRound }
          })

          const newFeeApproval: ISignedApproval = R.mergeDeepRight(feeTaker, {
            params: { round: newRound }
          })

          const newOrder: IL2Order = {
            orderApproval: newOrderApproval,
            feeApproval: newFeeApproval
          }

          await creditDepositForOrder(newOrder, ex)

          await expect(ex.addOrder(newOrder)).resolves.not.toThrow()
        })

        it('does not match with old approvals', async () => {
          await expect(ex.addOrder(orderTaker)).rejects.toThrow()
        })

        it('rejects adding approval with wrong round', async () => {
          await expect(ex.addOrder(orderTaker)).rejects.toThrow(/wrong round/i)
        })
      })

      it('Concurrent execution of approval does not cause race condition', async () => {
        const maker: ISignedApproval = {
          params: {
            approvalId: 'right',
            buy: { asset: USD, amount: D('2e10') },
            sell: { asset: BTC, amount: D('2e10') },
            round: 0,
            intent: 'buyAll',
            owner: BOB,

            instanceId: SOME_ADDRESS
          },
          ownerSig
        }

        const localOrderMaker: IL2Order = {
          orderApproval: maker,
          feeApproval: mkFeeWith({
            approvalId: `fee-${maker.params.approvalId}`,
            owner: maker.params.owner
          })
        }

        const taker1: ISignedApproval = R.mergeDeepRight(maker, {
          params: {
            approvalId: 'left1',
            buy: { asset: BTC, amount: D('2e10') },
            sell: { asset: USD, amount: D('2e10') },
            owner: ALICE
          }
        })

        const orderTaker1: IL2Order = {
          orderApproval: taker1,
          feeApproval: mkFeeWith({
            approvalId: `fee-${taker1.params.approvalId}`,
            owner: taker1.params.owner
          })
        }

        const taker2: ISignedApproval = R.mergeDeepRight(taker1, {
          params: {
            approvalId: 'left2'
          }
        })

        const orderTaker2: IL2Order = {
          orderApproval: taker2,
          feeApproval: mkFeeWith({
            approvalId: `fee-${taker2.params.approvalId}`,
            owner: taker2.params.owner
          })
        }

        await creditDepositForOrder(localOrderMaker, ex)

        await ex.addOrder(localOrderMaker)

        await creditDepositForOrder(orderTaker1, ex)
        await creditDepositForOrder(orderTaker2, ex)

        const [trade, noTrade] = [
          ex.addOrder(orderTaker1),
          ex.addOrder(orderTaker2)
        ]

        await Promise.all([trade, noTrade])

        expect(await trade).toMatchObject([
          {
            left: { approvalId: 'left1', sell: D('2e10') },
            right: { approvalId: 'right', sell: D('2e10') },
            round: 0
          }
        ])

        expect(await noTrade).toEqual([])
      })
    })
  })

  describe('Exchange Utilities', () => {
    describe('symbolOf', () => {
      const registry = new AssetRegistry()
      const wethAddr = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
      const oaxAddr = '0x701c244b988a513c945973defa05de933b23fe1d'

      registry.add('WETH', wethAddr)
      registry.add('OAX', oaxAddr)

      it.each`
        pair          | intent       | buy         | sell
        ${'WETH/OAX'} | ${'buyAll'}  | ${wethAddr} | ${oaxAddr}
        ${'WETH/OAX'} | ${'sellAll'} | ${oaxAddr}  | ${wethAddr}
        ${'OAX/WETH'} | ${'buyAll'}  | ${oaxAddr}  | ${wethAddr}
        ${'OAX/WETH'} | ${'sellAll'} | ${wethAddr} | ${oaxAddr}
      `(
        '$intent approval for $pair works',
        async ({ pair, intent, buy, sell }) => {
          const approval = makeApprovalFixture({
            params: {
              buy: { asset: buy },
              sell: { asset: sell },
              intent: intent
            }
          })

          const symbol = symbolOf(registry, approval)

          expect(symbol).toEqual(pair)
        }
      )
    })

    describe('isBidApproval', () => {
      it('isBidApproval works', () => {
        const approval = makeApprovalFixture({
          params: {
            buy: { asset: USD },
            sell: { asset: BTC }
          }
        })

        const isBid = isBidApproval(approval)
        expect(isBid).toBeTruthy()
      })
    })

    describe('isAskApproval', () => {
      it('isAskApproval works', () => {
        const approval = makeApprovalFixture({
          params: {
            buy: { asset: BTC },
            sell: { asset: USD },
            intent: 'sellAll'
          }
        })

        const isAsk = isAskApproval(approval)
        expect(isAsk).toBeTruthy()
      })
    })

    describe('orderPrice', () => {
      it('works with bid approval', () => {
        const market: IMarket = {
          base: USD,
          quote: BTC
        }
        const bidApproval = makeApprovalFixture({
          params: {
            sell: { asset: market.quote, amount: D('21') },
            buy: { asset: market.base, amount: D('3') }
          }
        })

        const isBid = isBidApproval(bidApproval)
        const bidPrice = orderPrice(bidApproval)

        expect(isBid).toBeTruthy()
        expect(bidPrice).toEqual(D('7'))
      })

      it('works with ask approval', () => {
        const market: IMarket = {
          base: USD,
          quote: BTC
        }
        const askApproval = makeApprovalFixture({
          params: {
            buy: { asset: market.quote, amount: D('5') },
            sell: { asset: market.base, amount: D('2') },
            intent: 'sellAll'
          }
        })

        const isAsk = isAskApproval(askApproval)
        const bidPrice = orderPrice(askApproval)

        expect(isAsk).toBeTruthy()
        expect(bidPrice).toEqual(D('2.5'))
      })
    })

    describe('orderAmount', () => {
      it('works with bid approval', () => {
        const market: IMarket = {
          base: USD,
          quote: BTC
        }
        const bidApproval = makeApprovalFixture({
          params: {
            buy: { asset: market.base, amount: D('3') },
            sell: { asset: market.quote, amount: D('21') }
          }
        })

        const amount = orderAmount(bidApproval)

        expect(amount).toEqual(D('3'))
      })

      it('works with ask approval', () => {
        const market: IMarket = {
          base: USD,
          quote: BTC
        }
        const askApproval = makeApprovalFixture({
          params: {
            buy: { asset: market.quote, amount: D('5') },
            sell: { asset: market.base, amount: D('2') },
            intent: 'sellAll'
          }
        })

        const bidPrice = orderAmount(askApproval)

        expect(bidPrice).toEqual(D('2'))
      })
    })
  })

  describe('Exchange / Ledger Integration', () => {
    it('Exchange works', async () => {
      const makerApproval: ISignedApproval = {
        params: {
          approvalId: 'right',
          buy: { asset: USD, amount: D('2e10') },
          sell: { asset: BTC, amount: D('1e10') },
          round: 0,
          intent: 'buyAll',
          owner: BOB,

          instanceId: SOME_ADDRESS
        },
        ownerSig
      }

      const localOrderMaker: IL2Order = {
        orderApproval: makerApproval,
        feeApproval: feeMaker
      }

      const takerApproval: ISignedApproval = {
        params: {
          approvalId: 'left',
          buy: { asset: BTC, amount: D('1e10') },
          sell: { asset: USD, amount: D('2e10') },
          round: 0,
          intent: 'buyAll',
          owner: ALICE,

          instanceId: SOME_ADDRESS
        },
        ownerSig
      }

      const localOrderTaker: IL2Order = {
        orderApproval: takerApproval,
        feeApproval: feeTaker
      }

      await creditDepositForOrder(localOrderMaker, ex)
      await creditDepositForOrder(localOrderTaker, ex)

      await ex.addOrder(localOrderMaker)
      await expect(ex.balances(BOB)).resolves.toMatchObject({
        [BTC]: { locked: D('1e10') }
      })

      await ex.addOrder(localOrderTaker)

      await expect(ex.balances(BOB)).resolves.toMatchObject({
        [BTC]: { free: D('0') },
        [USD]: { free: D('2e10') }
      })
      await expect(ex.balances(ALICE)).resolves.toMatchObject({
        [BTC]: { free: D('1e10') },
        [USD]: { free: D('0') }
      })
    })
  })
})
