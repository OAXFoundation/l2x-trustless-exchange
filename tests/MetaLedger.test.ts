// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import crypto from 'crypto'
import R from 'ramda'
import { AddressZero } from 'ethers/constants'
import {
  MetaLedger,
  MetaLedgerConfig
} from '../src/common/accounting/MetaLedger'
import 'jest'
import { PrivateKeyIdentity } from '../src/common/identity/PrivateKeyIdentity'

import {
  ISignedApproval,
  computeFeeApproval
} from '../src/common/types/Approvals'
import { D, etherToD } from '../src/common/BigNumberUtils'
import {
  AssetMismatchError,
  DoubleWithdrawalError,
  InsufficientBalanceError,
  RoundMismatchError,
  UnbackedFillError
} from '../src/common/Errors'
import { Amount, DeepPartial, Omit } from '../src/common/types/BasicTypes'
import { ISignedFill } from '../src/common/types/Fills'
import { IWithdrawal } from '../src/common/types/OperatorAndClientTypes'
import { IL2Order } from '../src/common/types/ExchangeTypes'
import { Proof } from '../src/common/types/SmartContractTypes'
import { mkRandomHash } from './libs/CryptoUtils'

// ----------------------------------------------------------------------------
// Tests Summary
// ----------------------------------------------------------------------------
// Construction
//    - with unique assets
//    - with duplicated assets
// User registration
//    - repeated registration for the same user
//    - registering multiple users
// Single user & multiple users
//    Initial balances
//        - opening balance [ ]
//        - specific current [x]
//        - specific locked [x]
//        - all currents [x]
//        - active withdrawal round [ ]
//    Credit Deposit
//        - 0 amount [ ]
//        - maximum unsigned 256bit amount [x]
//        - positive amount
//        - negative amount [x]
//        - to unregistered asset [x]
//        Over a number of rounds
//            - carried balance forward to next round's opening balance
//            - balance is updated correctly for current round
//    Balance Query
//        - current
//        - locked
//        - all current balances
//        -
//    Approvals
//        Insert invalid approval
//            - wrong asset [x]
//            - wrong round [ ]
//            - insufficient balances [x]
//            - unregistered party [x]
//        Insert valid approval
//            - change current balance
//            - no change to opening balances
//            - locks sell amount
//            - locked amount unlocked in the next round
//        - find
//        - check if exists
//    Fills
//        Insert invalid
//            - wrong asset
//            - wrong round
//            - no backing approval
//            - asset mismatch with backing approval
//            - round mismatch with backing approval
//            - missing fill ID
//            - fill sell amount > approved amount
//            - fill buy amount > approved amount
//        Insert valid
//            - changes current balances
//            - no change to previous balances
//            - changes next round opening balances
//        - find
//    Withdraw
//        Insert
//            - sufficient balance
//            - insufficient balance
//            - 0 amount
//            - negative amount
//            - with existing pending withdrawal
//        Confirm withdrawal
//            - with pending withdrawal
//            - without pending withdrawal
//        Cancel withdrawal
//        - find open
//        - update
//        - handle cancel withdrawal event
//    Disputes
//        - insert new
//        - find open
//        - update
//    Proofs
//        - no user
//        - 1 user
//        - multiple users
//        - after no chance to balance
//        - after change to balances
// Accounts
//    - has account
//

describe('MetaLedger', () => {
  const USD = '0xD1aff2357b67154F8613B15A2a947de0ff89C6f7'
  const BTC = '0x7d636D657c8BD158D7d94e7b4284f0c480F53671'

  // used to test asset that is registered but does not match
  const OTHER_ASSET = '0x1D25068d8A1776553d431bD0B1925ddd721dF85a'

  const assets = [USD, BTC, OTHER_ASSET]

  const LEDGER_CONFIG: MetaLedgerConfig = {
    assets,
    mediatorAddress: '0x1f92eCb410E7b11029fa85c15E2b073cD93DC5a7',
    operatorAddress: '0x943F5b677fF2fB21b43427E1700D25Ea170C35FD'
  }

  const alice = new PrivateKeyIdentity()

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('Construction', () => {
    it('works with unique assets', async () => {
      const invalidConfig: MetaLedgerConfig = {
        ...LEDGER_CONFIG,
        assets
      }

      const ledger = new MetaLedger(invalidConfig)
      await ledger.start()

      expect(ledger.assets).toEqual(assets)
    })

    it('throws with duplicated assets', () => {
      const invalidConfig: MetaLedgerConfig = {
        ...LEDGER_CONFIG,
        assets: [USD, USD]
      }

      expect(() => new MetaLedger(invalidConfig)).toThrow(/duplicate asset/i)
    })
  })

  describe('Starting the meta ledger', () => {
    let ledger: MetaLedger

    beforeEach(async () => {
      ledger = new MetaLedger(LEDGER_CONFIG)
      await ledger.start()
    })

    it('registers the operator', async () => {
      const hasAccount = await ledger.isClientRegistered(
        LEDGER_CONFIG.operatorAddress
      )
      expect(hasAccount).toBe(true)
    })
  })

  describe('Initial values with registered client', () => {
    const round = 0
    let ledger: MetaLedger

    beforeEach(async () => {
      ledger = new MetaLedger(LEDGER_CONFIG)
      await ledger.start()
      await ledger.register(alice.address, round)
    })

    it('opening balance ok', async () => {
      const usdOpening = await ledger.openingBalance(USD, alice.address, round)
      const btcOpening = await ledger.openingBalance(USD, alice.address, round)
      const otherOpening = await ledger.openingBalance(
        OTHER_ASSET,
        alice.address,
        round
      )

      expect(usdOpening).toEqual(D('0'))
      expect(btcOpening).toEqual(D('0'))
      expect(otherOpening).toEqual(D('0'))
    })

    it('current balance ok', async () => {
      const usdBalance = await ledger.balance(USD, alice.address, round)
      const btcBalance = await ledger.balance(USD, alice.address, round)
      const otherBalance = await ledger.balance(
        OTHER_ASSET,
        alice.address,
        round
      )

      expect(usdBalance).toEqual(D('0'))
      expect(btcBalance).toEqual(D('0'))
      expect(otherBalance).toEqual(D('0'))
    })

    it('locked balance ok', async () => {
      const usdLocked = await ledger.locked(USD, alice.address, round)
      const btcLocked = await ledger.locked(USD, alice.address, round)
      const otherLocked = await ledger.locked(OTHER_ASSET, alice.address, round)

      expect(usdLocked).toEqual(D('0'))
      expect(btcLocked).toEqual(D('0'))
      expect(otherLocked).toEqual(D('0'))
    })

    it('current balances ok', async () => {
      const balances = await ledger.balances(alice.address, round)

      expect(balances).toEqual({
        [USD]: D('0'),
        [BTC]: D('0'),
        [OTHER_ASSET]: D('0')
      })
    })
  })

  describe('Round joined for user', () => {
    const wallet = alice.address

    let ledger: MetaLedger

    beforeEach(async () => {
      ledger = new MetaLedger(LEDGER_CONFIG)
      await ledger.start()
    })

    it('returns the round the user is registered into the ledger', async () => {
      const round = 3

      await ledger.register(wallet, round)

      await expect(ledger.roundJoined(wallet)).resolves.toEqual(round)
    })

    it('throws when the user has not been registered', async () => {
      await expect(ledger.roundJoined(wallet)).rejects.toThrow(
        `Client ${wallet} is not registered`
      )
    })
  })

  describe('Crediting deposit for registered user', () => {
    const asset = USD
    const wallet = alice.address

    let ledger: MetaLedger

    beforeEach(async () => {
      ledger = new MetaLedger(LEDGER_CONFIG)
      await ledger.start()
      await ledger.register(wallet, 0)
    })

    describe('For a single round', () => {
      const round = 0

      it('throws exception when amount is 0', async () => {
        await expect(
          ledger.creditDeposit(asset, wallet, D('0'), round)
        ).rejects.toThrow()
      })

      describe('With maximum unsigned 256 bit integer', () => {
        const maxUint256 = D('2')
          .pow(256)
          .minus(1)

        it('balance is updated correctly', async () => {
          await ledger.creditDeposit(asset, wallet, maxUint256, round)

          const assetBalance = await ledger.balance(asset, wallet, round)

          expect(assetBalance).toEqual(maxUint256)
        })

        it('opening balance for the next round is updated correctly', async () => {
          await ledger.creditDeposit(asset, wallet, maxUint256, round)

          const assetBalance = await ledger.openingBalance(
            asset,
            wallet,
            round + 1
          )

          expect(assetBalance).toEqual(maxUint256)
        })
      })

      describe('With negative round', () => {
        const amount = D('10')
        const negativeRound = -1

        it('throws exception', async () => {
          const result = ledger.creditDeposit(
            asset,
            wallet,
            amount,
            negativeRound
          )

          await expect(result).rejects.toThrow(
            new RangeError(`Round cannot be negative. Given ${negativeRound}`)
          )
        })

        it('state is unchanged', async () => {
          const beforeState = await ledger.toJSON()
          try {
            await ledger.creditDeposit(asset, wallet, amount, negativeRound)
          } catch (err) {}

          const afterState = await ledger.toJSON()

          expect(beforeState).toEqual(afterState)
        })
      })

      describe('With negative amount', () => {
        const negativeAmt = D('-10')

        it('throws exception', async () => {
          const result = ledger.creditDeposit(asset, wallet, negativeAmt, round)

          await expect(result).rejects.toThrow(
            new RangeError(
              `Deposit cannot be negative or zero. Given ${negativeAmt}`
            )
          )
        })

        it('balance for current round is unchanged', async () => {
          try {
            await ledger.creditDeposit(asset, wallet, negativeAmt, round)
          } catch (err) {}

          const assetBalance = await ledger.balance(asset, wallet, round)

          expect(assetBalance).toEqual(D('0'))
        })

        it('Opening balance for the next round is unchanged', async () => {
          try {
            await ledger.creditDeposit(asset, wallet, negativeAmt, round)
          } catch (err) {}

          const assetBalance = await ledger.openingBalance(
            asset,
            wallet,
            round + 1
          )

          expect(assetBalance).toEqual(D('0'))
        })
      })

      describe('With unregistered wallet', () => {
        const amount = D('28179403262')
        const unregisteredWallet = AddressZero
        let result: Promise<void>

        it('throws exception', async () => {
          result = ledger.creditDeposit(
            asset,
            unregisteredWallet,
            amount,
            round
          )

          await expect(result).rejects.toThrow(
            `${unregisteredWallet} not in network.`
          )
        })
      })
    })

    describe('Over a number of rounds', () => {
      let ledger: MetaLedger

      beforeAll(async () => {
        ledger = new MetaLedger(LEDGER_CONFIG)
        await ledger.start()
        await ledger.register(wallet, 0)
      })

      describe.each`
        round | openingBalance      | creditAmount        | balance
        ${0}  | ${etherToD('0')}    | ${etherToD('100')}  | ${etherToD('100')}
        ${1}  | ${etherToD('100')}  | ${etherToD('2000')} | ${etherToD('2100')}
        ${1}  | ${etherToD('100')}  | ${etherToD('700')}  | ${etherToD('2800')}
        ${2}  | ${etherToD('2800')} | ${etherToD('1')}    | ${etherToD('2801')}
        ${3}  | ${etherToD('2801')} | ${etherToD('30')}   | ${etherToD('2831')}
      `(
        'Crediting $creditAmount wei in Round $round',
        ({ round, creditAmount, openingBalance, balance }) => {
          beforeAll(async () => {
            // Credit deposit for the round
            await ledger.creditDeposit(asset, wallet, creditAmount, round)
          })

          it('openingBalance carried balance forward correctly', async () => {
            const result = await ledger.openingBalance(asset, wallet, round)
            expect(result).toEqual(openingBalance)
          })

          it('balance is updated correctly', async () => {
            const assetBalance = await ledger.balance(asset, wallet, round)
            expect(assetBalance).toEqual(balance)
          })
        }
      )
    })
  })

  describe('Withdrawal', () => {
    const asset = USD
    const wallet = alice.address
    const withdrawalRound = 240
    const depositRound = withdrawalRound - 1

    let metaLedger: MetaLedger

    beforeEach(async () => {
      metaLedger = new MetaLedger(LEDGER_CONFIG)
      await metaLedger.start()
      await metaLedger.register(wallet, 0)
    })

    describe('Initiating withdrawal', () => {
      describe('With sufficient balance', () => {
        const availableBal = D('100')
        const withdrawingAmt = D(availableBal)

        beforeEach(async () => {
          // Fund client account
          await metaLedger.creditDeposit(
            asset,
            wallet,
            availableBal,
            depositRound
          )
        })

        it('debits balance by the withdrawal amount', async () => {
          await metaLedger.withdraw({
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount: withdrawingAmt,
            round: withdrawalRound
          })

          const assetBalance = await metaLedger.balance(
            asset,
            wallet,
            withdrawalRound
          )

          expect(assetBalance).toEqual(availableBal.minus(withdrawingAmt))
        })

        it('opening balance for current round is unchanged', async () => {
          await metaLedger.withdraw({
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount: availableBal,
            round: withdrawalRound
          })

          const opening = await metaLedger.openingBalance(
            asset,
            wallet,
            withdrawalRound
          )

          expect(opening).toEqual(availableBal)
        })

        it('debits opening balance for the next round', async () => {
          await metaLedger.withdraw({
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount: availableBal,
            round: withdrawalRound
          })

          const opening = await metaLedger.openingBalance(
            asset,
            wallet,
            withdrawalRound + 1
          )

          expect(opening).toEqual(availableBal.minus(withdrawingAmt))
        })

        it('stores a pending withdrawal request', async () => {
          const request: Omit<IWithdrawal, 'id'> = {
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount: availableBal,
            round: withdrawalRound,
            status: 'pending'
          }
          await metaLedger.withdraw(request)

          const pendingRequests = await metaLedger.getWithdrawalAsync('pending')

          expect(pendingRequests).toMatchObject([request])
        })
      })

      describe('With insufficient balance', () => {
        const amount = D('10')

        // Skipped crediting client's account

        it('throws InsufficientBalanceError', async () => {
          const result = metaLedger.withdraw({
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount,
            round: withdrawalRound
          })

          await expect(result).rejects.toThrow(
            new InsufficientBalanceError(
              `Insufficient balance for withdrawal. Asset: ${asset} ` +
                `Available: 0 Requested: ${amount}`
            )
          )
        })

        it('state is unchanged', async () => {
          const initialState = await metaLedger.toJSON()

          try {
            await metaLedger.withdraw({
              txHash: mkRandomHash(),
              asset,
              wallet,
              amount,
              round: withdrawalRound
            })
          } catch (_err) {}

          const finalState = await metaLedger.toJSON()

          expect(finalState).toEqual(initialState)
        })
      })

      describe('With negative amount', () => {
        const availableBal = D('10')
        const withdrawalAmt = availableBal.negated()

        beforeEach(async () => {
          await metaLedger.creditDeposit(
            asset,
            wallet,
            availableBal,
            withdrawalRound
          )
        })

        it('throws RangeError', async () => {
          const result = metaLedger.withdraw({
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount: withdrawalAmt,
            round: withdrawalRound
          })

          await expect(result).rejects.toThrow(
            RangeError(`Withdrawal amount must be > 0. Given ${withdrawalAmt}`)
          )
        })

        it('state is unchanged', async () => {
          const initialState = await metaLedger.toJSON()

          try {
            await metaLedger.withdraw({
              txHash: mkRandomHash(),
              asset,
              wallet,
              amount: withdrawalAmt,
              round: withdrawalRound
            })
          } catch (_err) {}

          const finalState = await metaLedger.toJSON()

          expect(finalState).toEqual(initialState)
        })
      })

      // Constraint not currently enforced
      describe('With 0 amount', () => {
        const availableBal = D('10')
        const withdrawalAmt = D('0')

        beforeEach(async () => {
          await metaLedger.creditDeposit(
            asset,
            wallet,
            availableBal,
            withdrawalRound
          )
        })

        it('throws RangeError', async () => {
          const result = metaLedger.withdraw({
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount: withdrawalAmt,
            round: withdrawalRound
          })

          await expect(result).rejects.toThrow(
            RangeError(`Withdrawal amount must be > 0. Given ${withdrawalAmt}`)
          )
        })

        it('state is unchanged', async () => {
          const initialState = await metaLedger.toJSON()

          try {
            await metaLedger.withdraw({
              txHash: mkRandomHash(),
              asset,
              wallet,
              amount: withdrawalAmt,
              round: withdrawalRound
            })
          } catch (_err) {}

          const finalState = await metaLedger.toJSON()

          expect(finalState).toEqual(initialState)
        })
      })

      describe('With pending withdrawal', () => {
        const openingBal = D('100')
        const withdrawalAmt = openingBal.div(2)

        beforeEach(async () => {
          await metaLedger.creditDeposit(
            asset,
            wallet,
            openingBal,
            depositRound
          )
          await metaLedger.withdraw({
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount: withdrawalAmt,
            round: withdrawalRound
          })
        })

        it('throws DoubleWithdrawalError', async () => {
          const doubleWithdrawal = metaLedger.withdraw({
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount: withdrawalAmt,
            round: withdrawalRound
          })

          await expect(doubleWithdrawal).rejects.toThrow(
            new DoubleWithdrawalError(
              `An existing withdrawal already exists from round ${withdrawalRound}`
            )
          )
        })

        it('state is unchanged', async () => {
          const initialState = await metaLedger.toJSON()

          try {
            await metaLedger.withdraw({
              txHash: mkRandomHash(),
              asset,
              wallet,
              amount: withdrawalAmt,
              round: withdrawalRound
            })
          } catch (_err) {}

          const finalState = await metaLedger.toJSON()

          expect(finalState).toEqual(initialState)
        })
      })
    })

    describe('Inserting withdrawal request', () => {
      it('stores an unchecked withdrawal request', async () => {
        const request: Omit<IWithdrawal, 'id'> = {
          txHash: mkRandomHash(),
          asset,
          wallet: alice.address,
          amount: D('10'),
          round: 10,
          status: 'unchecked'
        }

        await metaLedger.insertWithdrawalAsync(request)

        const uncheckedReqs = await metaLedger.getWithdrawalAsync('unchecked')

        expect(uncheckedReqs).toMatchObject([request])
      })
    })

    describe('Cancelling withdrawal request', () => {
      describe('For a pending withdrawal request', () => {
        const openingBal = D('100')
        const withdrawingAmt = D(openingBal)

        beforeEach(async () => {
          // Fund client account
          await metaLedger.creditDeposit(
            asset,
            wallet,
            openingBal,
            depositRound
          )
          await metaLedger.withdraw({
            txHash: mkRandomHash(),
            asset,
            wallet,
            amount: withdrawingAmt,
            round: withdrawalRound
          })
        })

        it('updates the withdrawal request to canceled', async () => {
          await metaLedger.cancelWithdrawalAsync(asset, wallet)

          const canceledRequests = await metaLedger.getWithdrawalAsync(
            'canceled'
          )

          expect(canceledRequests).toMatchObject([
            { asset, wallet, amount: withdrawingAmt, status: 'canceled' }
          ])
        })

        it('credits withdrawal amount back to balance', async () => {
          await metaLedger.cancelWithdrawalAsync(asset, wallet)

          const balance = await metaLedger.balance(
            asset,
            wallet,
            withdrawalRound
          )

          expect(balance).toEqual(openingBal)
        })
      })

      describe('For an unchecked withdrawal request', () => {
        const withdrawingAmt = D('10')

        beforeEach(async () => {
          await metaLedger.insertWithdrawalAsync({
            txHash: mkRandomHash(),
            asset,
            wallet: alice.address,
            amount: withdrawingAmt,
            round: withdrawalRound,
            status: 'unchecked'
          })
        })

        it('updates the withdrawal request to canceled', async () => {
          await metaLedger.cancelWithdrawalAsync(asset, wallet)

          const canceledRequests = await metaLedger.getWithdrawalAsync(
            'canceled'
          )

          expect(canceledRequests).toMatchObject([
            { asset, wallet, amount: withdrawingAmt, status: 'canceled' }
          ])
        })

        it('does not modify balance', async () => {
          await metaLedger.cancelWithdrawalAsync(asset, wallet)

          const balance = await metaLedger.balance(
            asset,
            wallet,
            withdrawalRound
          )

          expect(balance).toEqual(D('0'))
        })
      })

      describe('For canceled request', () => {
        const withdrawingAmt = D('10')

        beforeEach(async () => {
          await metaLedger.insertWithdrawalAsync({
            txHash: mkRandomHash(),
            asset,
            wallet: alice.address,
            amount: withdrawingAmt,
            round: withdrawalRound,
            status: 'unchecked'
          })
          await metaLedger.cancelWithdrawalAsync(asset, wallet)
        })

        it('throws error', async () => {
          await expect(
            metaLedger.cancelWithdrawalAsync(asset, wallet)
          ).rejects.toThrow('There is no withdrawal to cancel')
        })

        it('does not modify balance', async () => {
          const balance = await metaLedger.balance(
            asset,
            wallet,
            withdrawalRound
          )

          expect(balance).toEqual(D('0'))
        })
      })

      describe('For confirmed request', () => {
        const withdrawingAmt = D('10')

        beforeEach(async () => {
          await metaLedger.creditDeposit(asset, wallet, withdrawingAmt, 0)

          await metaLedger.insertWithdrawalAsync({
            txHash: mkRandomHash(),
            asset,
            wallet: alice.address,
            amount: withdrawingAmt,
            round: withdrawalRound,
            status: 'unchecked'
          })

          const withdrawal: IWithdrawal = (await metaLedger.getWithdrawalAsync(
            'unchecked'
          ))[0]
          await metaLedger.approveWithdrawal(withdrawal)
          await metaLedger.confirmWithdrawalAsync(asset, alice.address)
        })

        it('throws error', async () => {
          await expect(
            metaLedger.cancelWithdrawalAsync(asset, wallet)
          ).rejects.toThrow('There is no withdrawal to cancel')
        })

        it('does not modify balance', async () => {
          const balance = await metaLedger.balance(
            asset,
            wallet,
            withdrawalRound
          )
          expect(balance).toEqual(D('0'))
        })
      })
    })

    describe('Confirming withdrawal', () => {
      describe('With ongoing withdrawal', () => {
        const withdrawingAmt = D('10')

        beforeEach(async () => {
          await metaLedger.creditDeposit(asset, wallet, withdrawingAmt, 0)

          await metaLedger.insertWithdrawalAsync({
            txHash: mkRandomHash(),
            asset,
            wallet: alice.address,
            amount: withdrawingAmt,
            round: withdrawalRound,
            status: 'unchecked'
          })

          const withdrawal: IWithdrawal = (await metaLedger.getWithdrawalAsync(
            'unchecked'
          ))[0]
          await metaLedger.approveWithdrawal(withdrawal)
        })

        it('balance is unchanged', async () => {
          const balanceBefore = await metaLedger.balance(
            asset,
            wallet,
            withdrawalRound
          )
          await metaLedger.confirmWithdrawalAsync(asset, alice.address)
          const balanceAfter = await metaLedger.balance(
            asset,
            wallet,
            withdrawalRound
          )
          expect(balanceBefore).toEqual(balanceAfter)
        })
      })

      describe('Without ongoing withdrawal', () => {
        let depositAmount: Amount = D('20')
        beforeEach(async () => {
          await metaLedger.creditDeposit(asset, wallet, depositAmount, 0)

          it('throws exception', async () => {
            await expect(
              metaLedger.confirmWithdrawalAsync(asset, alice.address)
            ).rejects.toThrow('No pending withdrawal')
          })

          it('balance is unchanged', async () => {
            await expect(
              metaLedger.confirmWithdrawalAsync(asset, alice.address)
            ).rejects.toThrow('No pending withdrawal')
            const balance = await metaLedger.balance(
              asset,
              wallet,
              withdrawalRound
            )
            expect(balance).toEqual(depositAmount)
          })
        })
      })
    })
  })

  describe('Adding approval', () => {
    const myAddress = alice.address
    const approvalRound = 1

    const validApproval: ISignedApproval = {
      params: {
        approvalId: '0',
        round: approvalRound,
        buy: {
          asset: BTC,
          amount: D('10')
        },
        sell: {
          asset: USD,
          amount: D('10')
        },
        intent: 'sellAll',
        owner: myAddress,
        instanceId: '0x2F31bd0b46c7a4A6Ff1BFF43e85D2FFB83E4187d'
      },
      ownerSig: `0x${crypto.randomBytes(65).toString('hex')}`
    }

    let metaLedger: MetaLedger

    beforeEach(async () => {
      metaLedger = new MetaLedger(LEDGER_CONFIG)
      await metaLedger.start()
      await metaLedger.register(myAddress, 0)
    })

    describe('With unregistered sell asset', () => {
      const invalidApproval: ISignedApproval = R.mergeDeepRight(validApproval, {
        params: {
          sell: {
            asset: AddressZero
          }
        }
      })

      it('throws AssetMismatchError exception', async () => {
        const result = metaLedger.insertApproval(invalidApproval)

        await expect(result).rejects.toThrow(
          new AssetMismatchError(
            `This ledger cannot handle asset ${
              invalidApproval.params.sell.asset
            }`
          )
        )
      })

      it('state is unchanged', async () => {
        const initialState = await metaLedger.toJSON()

        try {
          await metaLedger.insertApproval(invalidApproval)
        } catch (_err) {}

        const finalState = await metaLedger.toJSON()

        expect(finalState).toEqual(initialState)
      })
    })

    describe('With unregistered buy asset', () => {
      const invalidApproval: ISignedApproval = R.mergeDeepRight(validApproval, {
        params: {
          buy: {
            asset: AddressZero
          }
        }
      })

      beforeEach(async () => {
        await metaLedger.creditDeposit(
          invalidApproval.params.sell.asset,
          myAddress,
          invalidApproval.params.sell.amount,
          approvalRound
        )
      })

      it('throws AssetMismatchError exception', async () => {
        const result = metaLedger.insertApproval(invalidApproval)

        await expect(result).rejects.toThrow(
          new AssetMismatchError(
            `This ledger cannot handle asset ${
              invalidApproval.params.buy.asset
            }`
          )
        )
      })

      it('state is unchanged', async () => {
        const initialState = await metaLedger.toJSON()

        try {
          await metaLedger.insertApproval(invalidApproval)
        } catch (_err) {}

        const finalState = await metaLedger.toJSON()

        expect(finalState).toEqual(initialState)
      })
    })

    describe('With same ID as an existing approval', () => {
      const {
        params: { sell, owner, round }
      } = validApproval

      const openingBalance = D(sell.amount).multipliedBy(2)

      beforeEach(async () => {
        await metaLedger.creditDeposit(
          sell.asset,
          owner,
          openingBalance,
          round - 1
        )
        await metaLedger.insertApproval(validApproval)
      })

      it('throws exception and approval is not added', async () => {
        await expect(metaLedger.insertApproval(validApproval)).rejects.toThrow(
          'Id for approval is already used.'
        )
      })
    })

    // Unable to add approval to a particular round
    describe('For wrong round', () => {
      const insertRound = approvalRound + 1

      beforeEach(async () => {
        await metaLedger.creditDeposit(
          validApproval.params.sell.asset,
          myAddress,
          validApproval.params.sell.amount,
          insertRound
        )
      })

      it('throws and state is unchanged', async () => {
        const errorMessage = `Insufficient balance for adding approval. Asset: ${
          validApproval.params.sell.asset
        } Available: 0 Requested: ${validApproval.params.sell.amount}`

        const initialState = await metaLedger.toJSON()

        await expect(metaLedger.insertApproval(validApproval)).rejects.toThrow(
          errorMessage
        )

        const finalState = await metaLedger.toJSON()

        expect(finalState).toEqual(initialState)
      })
    })

    describe('With insufficient balance', () => {
      // does not credit sell amount for sell asset

      it('throws RoundMismatchError', async () => {
        const result = metaLedger.insertApproval(validApproval)

        await expect(result).rejects.toThrow(
          new InsufficientBalanceError(
            `Insufficient balance for adding approval. ` +
              `Asset: ${validApproval.params.sell.asset} ` +
              `Available: 0 Requested: ${validApproval.params.sell.amount}`
          )
        )
      })

      it('state is unchanged', async () => {
        const initialState = await metaLedger.toJSON()

        try {
          await metaLedger.insertApproval(validApproval)
        } catch (_err) {}

        const finalState = await metaLedger.toJSON()

        expect(finalState).toEqual(initialState)
      })
    })

    describe('For unregistered party', () => {
      const invalidApproval = R.mergeDeepRight<
        ISignedApproval,
        DeepPartial<ISignedApproval>
      >(validApproval, {
        params: {
          owner: AddressZero
        }
      })

      it('throws exception', async () => {
        const result = metaLedger.insertApproval(invalidApproval)

        await expect(result).rejects.toThrow(`${AddressZero} not in network`)
      })

      it('state is unchanged', async () => {
        const initialState = await metaLedger.toJSON()

        try {
          await metaLedger.insertApproval(invalidApproval)
        } catch (_err) {}

        const finalState = await metaLedger.toJSON()

        expect(finalState).toEqual(initialState)
      })
    })

    describe('With valid approval', () => {
      const {
        params: { sell, owner, round }
      } = validApproval

      const openingBalance = D(sell.amount)

      beforeEach(async () => {
        await metaLedger.creditDeposit(
          sell.asset,
          owner,
          openingBalance,
          round - 1
        )
      })

      it('balance equals sell amount before inserting approval', async () => {
        const assetBalance = await metaLedger.balance(sell.asset, owner, round)

        expect(assetBalance).toEqual(sell.amount)
      })

      it('inserting approval decreases balance by sell amount', async () => {
        await metaLedger.insertApproval(validApproval)

        const assetBalance = await metaLedger.balance(sell.asset, owner, round)

        expect(assetBalance).toEqual(D('0'))
      })

      it('inserting approval increases locked balance by sell amount', async () => {
        await metaLedger.insertApproval(validApproval)

        const lockedBal = await metaLedger.locked(sell.asset, owner, round)

        expect(lockedBal).toEqual(sell.amount)
      })

      it('opening balance for current round is unchanged', async () => {
        await metaLedger.insertApproval(validApproval)

        const opening = await metaLedger.openingBalance(
          sell.asset,
          owner,
          round
        )

        expect(opening).toEqual(openingBalance)
      })

      it('opening balance for next round is unchanged', async () => {
        await metaLedger.insertApproval(validApproval)

        const nextOpening = await metaLedger.openingBalance(
          sell.asset,
          owner,
          round + 1
        )

        expect(nextOpening).toEqual(openingBalance)
      })

      it('canceling approval cannot be done twice', async () => {
        await metaLedger.insertApproval(validApproval)

        const { approvalId } = validApproval.params
        const cancelPromise1 = metaLedger.cancelApproval(approvalId)
        const cancelPromise2 = metaLedger.cancelApproval(approvalId)
        await cancelPromise1
        await expect(cancelPromise2).rejects.toThrow(/already closed/i)

        const lockedBal = await metaLedger.locked(sell.asset, owner, round)
        expect(lockedBal).toEqual(D('0'))
      })

      it('canceling approval updates balance', async () => {
        await metaLedger.insertApproval(validApproval)

        const balx = await metaLedger.balance(sell.asset, owner, round)
        expect(balx).toEqual(D('0'))

        const { approvalId } = validApproval.params
        await metaLedger.cancelApproval(approvalId)

        const bal = await metaLedger.balance(sell.asset, owner, round)
        expect(bal).toEqual(validApproval.params.sell.amount)
      })
    })
  })

  describe('Adding order', () => {
    const myAddress = alice.address
    const approvalRound = 1

    const validApproval: ISignedApproval = {
      params: {
        approvalId: '0',
        round: approvalRound,
        buy: {
          asset: BTC,
          amount: D('10')
        },
        sell: {
          asset: USD,
          amount: D('10')
        },
        intent: 'sellAll',
        owner: myAddress,
        instanceId: '0x2F31bd0b46c7a4A6Ff1BFF43e85D2FFB83E4187d'
      },
      ownerSig: `0x${crypto.randomBytes(65).toString('hex')}`
    }

    const validFee: ISignedApproval = {
      params: computeFeeApproval(validApproval.params, BTC, D('1')),
      ownerSig: `0x${crypto.randomBytes(65).toString('hex')}`
    }
    const order: IL2Order = {
      orderApproval: validApproval,
      feeApproval: validFee
    }

    let ledger: MetaLedger

    beforeEach(async () => {
      ledger = new MetaLedger(LEDGER_CONFIG)
      await ledger.start()
      await ledger.register(validApproval.params.owner, 0)
    })

    describe('With valid order and fee approvals', () => {
      beforeEach(async () => {
        await ledger.creditDeposit(
          validApproval.params.sell.asset,
          myAddress,
          validApproval.params.sell.amount,
          validApproval.params.round
        )

        await ledger.creditDeposit(
          validFee.params.sell.asset,
          myAddress,
          validFee.params.sell.amount,
          validFee.params.round
        )
      })

      it('order and fee approvals are stored', async () => {
        await ledger.insertOrder(order)

        const approvals = await ledger.getApprovals({})

        expect(approvals).toMatchObject([validApproval, validFee])
      })
    })

    describe('With valid order and insufficient fee balance', () => {
      beforeEach(async () => {
        await ledger.creditDeposit(
          validApproval.params.sell.asset,
          myAddress,
          validApproval.params.sell.amount,
          validApproval.params.round
        )
      })

      it('throws InsufficientBalanceError', async () => {
        await expect(ledger.insertOrder(order)).rejects.toThrow(
          InsufficientBalanceError
        )
      })

      it('no approvals were added', async () => {
        try {
          await ledger.insertOrder(order)
        } catch (err) {}

        const approvals = await ledger.getApprovals({})
        expect(approvals).toEqual([])
      })
    })

    describe('With valid fee approvals and insufficient order balance', () => {
      beforeEach(async () => {
        await ledger.creditDeposit(
          validFee.params.sell.asset,
          myAddress,
          validFee.params.sell.amount,
          validFee.params.round
        )
      })

      it('throws InsufficientBalanceError', async () => {
        await expect(ledger.insertOrder(order)).rejects.toThrow(
          InsufficientBalanceError
        )
      })

      it('no approvals were added', async () => {
        try {
          await ledger.insertOrder(order)
        } catch (err) {}

        const approvals = await ledger.getApprovals({})
        expect(approvals).toEqual([])
      })
    })
    describe('With invalid order and fee approvals', () => {})
  })

  describe('Adding fill', () => {
    const validApproval: ISignedApproval = {
      params: {
        approvalId: '0',
        round: 1,
        buy: {
          asset: BTC,
          amount: D('10')
        },
        sell: {
          asset: USD,
          amount: D('10')
        },
        intent: 'sellAll',
        owner: alice.address,
        instanceId: '0x2F31bd0b46c7a4A6Ff1BFF43e85D2FFB83E4187d'
      },
      ownerSig: `0x${crypto.randomBytes(65).toString('hex')}`
    }

    const validFill: ISignedFill = {
      params: {
        fillId: '7',
        approvalId: validApproval.params.approvalId,
        round: validApproval.params.round,
        buyAmount: validApproval.params.buy.amount,
        buyAsset: validApproval.params.buy.asset,
        sellAmount: validApproval.params.sell.amount,
        sellAsset: validApproval.params.sell.asset,
        clientAddress: validApproval.params.owner,
        instanceId: validApproval.params.instanceId
      },
      signature: `0x${crypto.randomBytes(65).toString('hex')}`
    }

    let metaLedger: MetaLedger

    beforeEach(async () => {
      metaLedger = new MetaLedger(LEDGER_CONFIG)
      await metaLedger.start()
      await metaLedger.register(validApproval.params.owner, 0)
    })

    // Current implementation does not pass
    describe('Without a backing approval', () => {
      const invalidFill = R.mergeDeepRight<
        ISignedFill,
        DeepPartial<ISignedFill>
      >(validFill, {
        params: {
          approvalId: validFill.params.approvalId + 1
        }
      })

      it('throws UnbackedFillError', async () => {
        const result = metaLedger.insertFill(invalidFill)

        await expect(result).rejects.toThrow(
          new UnbackedFillError(
            `Fill is not backed by an existing approval. Fill: ${JSON.stringify(
              invalidFill
            )}`
          )
        )
      })

      it('state is unchanged', async () => {
        const stateBefore = await metaLedger.toJSON()
        try {
          await metaLedger.insertFill(invalidFill)
        } catch (_err) {}

        const stateAfter = await metaLedger.toJSON()

        expect(stateAfter).toEqual(stateBefore)
      })
    })

    // Here, backing approval referring to an approval with a matching
    // approvalId
    describe('With backing approval', () => {
      let openingBal: Amount

      beforeEach(async () => {
        const {
          params: { sell, owner, round }
        } = validApproval

        openingBal = D(sell.amount)

        // adding the backing approval
        await metaLedger.creditDeposit(sell.asset, owner, openingBal, round - 1)
        await metaLedger.insertApproval(validApproval)
      })

      describe('Sell asset mismatch', () => {
        const invalidFill = R.mergeDeepRight<
          ISignedFill,
          DeepPartial<ISignedFill>
        >(validFill, {
          params: {
            sellAsset: OTHER_ASSET
          }
        })

        it('throws AssetMismatchError', async () => {
          const result = metaLedger.insertFill(invalidFill)

          await expect(result).rejects.toThrow(
            new AssetMismatchError(
              `Mismatch between fill sell asset and approval sell asset. ` +
                `Fill ID: ${invalidFill.params.fillId} ` +
                `Fill Sell Asset: ${invalidFill.params.sellAsset} ` +
                `Approval ID: ${validApproval.params.approvalId} ` +
                `Approval Sell Asset: ${validApproval.params.sell.asset}`
            )
          )
        })

        it('state is unchanged', async () => {
          const stateBefore = await metaLedger.toJSON()
          try {
            await metaLedger.insertFill(invalidFill)
          } catch (_err) {}

          const stateAfter = await metaLedger.toJSON()

          expect(stateAfter).toEqual(stateBefore)
        })
      })

      describe('Buy asset mismatch', () => {
        const invalidFill = R.mergeDeepRight<
          ISignedFill,
          DeepPartial<ISignedFill>
        >(validFill, {
          params: {
            buyAsset: OTHER_ASSET
          }
        })

        it('throws AssetMismatchError', async () => {
          const result = metaLedger.insertFill(invalidFill)

          await expect(result).rejects.toThrow(
            new AssetMismatchError(
              `Mismatch between fill buy asset and approval buy asset. ` +
                `Fill ID: ${invalidFill.params.fillId} ` +
                `Fill Buy Asset: ${invalidFill.params.buyAsset} ` +
                `Approval ID: ${validApproval.params.approvalId} ` +
                `Approval Buy Asset: ${validApproval.params.buy.asset}`
            )
          )
        })

        it('state is unchanged', async () => {
          const stateBefore = await metaLedger.toJSON()
          try {
            await metaLedger.insertFill(invalidFill)
          } catch (_err) {}

          const stateAfter = await metaLedger.toJSON()

          expect(stateAfter).toEqual(stateBefore)
        })
      })

      // Relies on backing approval. Disabled for now. See note above for reason
      describe('Round mismatch', () => {
        const invalidFill = R.mergeDeepRight<
          ISignedFill,
          DeepPartial<ISignedFill>
        >(validFill, {
          params: {
            round: validFill.params.round + 1
          }
        })

        it('throws RoundMismatchError', async () => {
          const result = metaLedger.insertFill(invalidFill)

          await expect(result).rejects.toThrow(
            new RoundMismatchError(
              `Mismatch between fill round and approval round. ` +
                `Fill ID: ${invalidFill.params.fillId} ` +
                `Fill round: ${invalidFill.params.round} ` +
                `Approval ID: ${validApproval.params.approvalId} ` +
                `Approval round: ${validApproval.params.round}`
            )
          )
        })

        it('state is unchanged', async () => {
          const stateBefore = await metaLedger.toJSON()
          try {
            await metaLedger.insertFill(invalidFill)
          } catch (_err) {}

          const stateAfter = await metaLedger.toJSON()

          expect(stateAfter).toEqual(stateBefore)
        })
      })

      describe('instanceId mismatch', () => {
        const invalidFill = R.mergeDeepRight<
          ISignedFill,
          DeepPartial<ISignedFill>
        >(validFill, {
          params: {
            instanceId: '0xb4d0000000000000000000000000000000000000'
          }
        })

        it('throws exception', async () => {
          const result = metaLedger.insertFill(invalidFill)

          await expect(result).rejects.toThrow(
            new RoundMismatchError(
              `Instance ID mismatch between fill and approval. ` +
                `Fill ID: ${invalidFill.params.fillId} ` +
                `Fill instance ID: ${invalidFill.params.instanceId} ` +
                `Approval ID: ${validApproval.params.approvalId} ` +
                `Approval instance ID: ${validApproval.params.instanceId}`
            )
          )
        })

        it('state is unchanged', async () => {
          const stateBefore = await metaLedger.toJSON()
          try {
            await metaLedger.insertFill(invalidFill)
          } catch (_err) {}

          const stateAfter = await metaLedger.toJSON()

          expect(stateAfter).toEqual(stateBefore)
        })
      })

      describe('Wallet mismatch', () => {
        const invalidFill = R.mergeDeepRight<
          ISignedFill,
          DeepPartial<ISignedFill>
        >(validFill, {
          params: {
            clientAddress: '0xb4d0000000000000000000000000000000000000'
          }
        })

        it('throws exception', async () => {
          const result = metaLedger.insertFill(invalidFill)

          await expect(result).rejects.toThrow(
            new RoundMismatchError(
              `Wallet mismatch between fill and approval. ` +
                `Fill ID: ${invalidFill.params.fillId} ` +
                `Fill wallet: ${invalidFill.params.fillId} ` +
                `Approval ID: ${validApproval.params.approvalId} ` +
                `Approval wallet: ${validApproval.params.owner}`
            )
          )
        })

        it('state is unchanged', async () => {
          const stateBefore = await metaLedger.toJSON()
          try {
            await metaLedger.insertFill(invalidFill)
          } catch (_err) {}

          const stateAfter = await metaLedger.toJSON()

          expect(stateAfter).toEqual(stateBefore)
        })
      })

      describe('With same ID as an existing fill', () => {
        it('throws exception', async () => {
          await metaLedger.insertFill(validFill)

          const doubleFill = metaLedger.insertFill(validFill)

          await expect(doubleFill).rejects.toThrow(/already exists/i)
        })

        it('state is unchanged', async () => {
          await metaLedger.insertFill(validFill)

          const beforeState = await metaLedger.toJSON()

          try {
            await metaLedger.insertFill(validFill)
          } catch (err) {}

          const afterState = await metaLedger.toJSON()

          await expect(beforeState).toEqual(afterState)
        })
      })

      describe('Fill sell amount exceeds approved amount', () => {
        let invalidFill = R.mergeDeepRight<
          ISignedFill,
          DeepPartial<ISignedFill>
        >(validFill, {
          params: {
            sellAmount: validFill.params.sellAmount.multipliedBy(2)
          }
        })

        it('throws error', async () => {
          await expect(metaLedger.insertFill(invalidFill)).rejects.toThrow(
            'Fill sell amount exceeds approved amount.'
          )
        })

        it('State unchanged', async () => {
          const beforeState = await metaLedger.toJSON()

          try {
            await metaLedger.insertFill(invalidFill)
          } catch (err) {}

          const afterState = await metaLedger.toJSON()

          await expect(beforeState).toEqual(afterState)
        })
      })

      describe('Valid fill that takes the approval in its entirety', () => {
        const {
          params: { sell, owner, round }
        } = validApproval

        it('locked balance equals sell amount before fill', async () => {
          const lockedBal = await metaLedger.locked(sell.asset, owner, round)

          expect(lockedBal).toEqual(sell.amount)
        })

        it('balance for fill round remains 0 after fill', async () => {
          await metaLedger.insertFill(validFill)

          const assetBalance = await metaLedger.balance(
            sell.asset,
            owner,
            round
          )

          expect(assetBalance).toEqual(D('0'))
        })

        it('locked balance for fill round is decreased by filled amount', async () => {
          await metaLedger.insertFill(validFill)

          const lockedBal = await metaLedger.locked(sell.asset, owner, round)

          expect(lockedBal).toEqual(D('0'))
        })

        it('opening balance for current round is unchanged', async () => {
          await metaLedger.insertFill(validFill)

          const opening = await metaLedger.openingBalance(
            sell.asset,
            owner,
            round
          )

          expect(opening).toEqual(openingBal)
        })

        it('opening balance for next round is updated correctly', async () => {
          await metaLedger.insertFill(validFill)

          const opening = await metaLedger.openingBalance(
            sell.asset,
            owner,
            round + 1
          )

          expect(opening).toEqual(D('0'))
        })

        it('works over a number of rounds', async () => {
          await metaLedger.insertFill(validFill)

          for (let i = 1; i < 10; i++) {
            const opening = await metaLedger.openingBalance(
              sell.asset,
              owner,
              round + i
            )

            expect(opening).toEqual(D('0'))
          }
        })
      })
    })
  })

  describe('Scenario: Reconstructing proof from previous round with new joiners', () => {
    let ledger: MetaLedger

    beforeEach(async () => {
      ledger = new MetaLedger(LEDGER_CONFIG)
      await ledger.start()
    })

    describe(`Given a client Alice joined in round 0
      And a proof was generated for round 1 with only Alice in it
      And another client Bob joined in round 1`, () => {
      let originalProof: Proof
      let bobAddress = '0xb0b0000000000000000000000000000000000000'

      beforeEach(async () => {
        await ledger.register(alice.address, 0)
        originalProof = await ledger.completeProof(USD, alice.address, 1)

        await ledger.register(bobAddress, 1)
      })

      describe('When Alice asks for proof again for round 1', () => {
        it('the regenerated proof is the same as the first proof', async () => {
          const newProof = await ledger.completeProof(USD, alice.address, 1)

          expect(newProof.toJSON()).toEqual(originalProof.toJSON())
        })
      })
    })
  })

  describe('Ledger features', () => {
    const aliceAddress = '0xa17ce00000000000000000000000000000000000'
    const bobAddress = '0xa17ce00000000000000000000000000000000001'
    const johnAddress = '0xa17ce00000000000000000000000000000000002'
    const patAddress = '0xa17ce00000000000000000000000000000000003'
    const albertAddress = '0xa17ce00000000000000000000000000000000004'
    const assetAddress = BTC

    let metaLedger: MetaLedger

    beforeEach(async () => {
      metaLedger = new MetaLedger(LEDGER_CONFIG)

      await metaLedger.start()
    })

    it('Keeps balance on repeated registration', async () => {
      await metaLedger.register(aliceAddress, 0)
      await metaLedger.creditDeposit(assetAddress, aliceAddress, D('1'), 0)

      await metaLedger.register(aliceAddress, 0)
      await expect(
        metaLedger.balance(assetAddress, aliceAddress, 0)
      ).resolves.toEqual(D('1'))
    })

    it('computes the balance correctly after several deposits and withdrawals', async () => {
      await metaLedger.register(aliceAddress, 0)

      const amountDeposit1 = D('4')
      const amountDeposit2 = D('5')
      const amountWithdrawal1 = D('2')

      await metaLedger.creditDeposit(
        assetAddress,
        aliceAddress,
        amountDeposit1,
        0
      )
      await metaLedger.creditDeposit(
        assetAddress,
        aliceAddress,
        amountDeposit2,
        0
      )

      await metaLedger.withdraw({
        txHash: mkRandomHash(),
        asset: assetAddress,
        wallet: aliceAddress,
        amount: amountWithdrawal1,
        round: 1
      })

      const expectedBalance = amountDeposit1
        .plus(amountDeposit2)
        .minus(amountWithdrawal1)

      await expect(
        metaLedger.balance(assetAddress, aliceAddress, 4)
      ).resolves.toEqual(expectedBalance)

      await metaLedger.confirmWithdrawalAsync(assetAddress, aliceAddress)
      await expect(
        metaLedger.balance(assetAddress, aliceAddress, 4)
      ).resolves.toEqual(expectedBalance)
    })

    it('manages the accounts of different clients', async () => {
      await metaLedger.register(aliceAddress, 0)
      await metaLedger.register(bobAddress, 0)
      await metaLedger.register(johnAddress, 0)
      await metaLedger.register(patAddress, 0)
      await metaLedger.register(albertAddress, 0)

      const depositAmount = D('2')
      const withdrawAmount = D('1')

      await metaLedger.creditDeposit(
        assetAddress,
        aliceAddress,
        depositAmount,
        0
      )
      await metaLedger.creditDeposit(
        assetAddress,
        bobAddress,
        depositAmount.multipliedBy(2),
        0
      )
      await metaLedger.creditDeposit(
        assetAddress,
        johnAddress,
        depositAmount.multipliedBy(2),
        0
      )
      await metaLedger.creditDeposit(assetAddress, patAddress, D('1'), 0)
      await metaLedger.creditDeposit(
        assetAddress,
        albertAddress,
        depositAmount.multipliedBy(3),
        0
      )

      await expect(
        metaLedger.balance(assetAddress, aliceAddress, 0)
      ).resolves.toEqual(depositAmount)
      await expect(
        metaLedger.balance(assetAddress, bobAddress, 0)
      ).resolves.toEqual(depositAmount.multipliedBy(2))
      await expect(
        metaLedger.balance(assetAddress, johnAddress, 0)
      ).resolves.toEqual(depositAmount.multipliedBy(2))
      await expect(
        metaLedger.balance(assetAddress, patAddress, 0)
      ).resolves.toEqual(D('1'))
      await expect(
        metaLedger.balance(assetAddress, albertAddress, 0)
      ).resolves.toEqual(depositAmount.multipliedBy(3))

      await metaLedger.withdraw({
        txHash: mkRandomHash(),
        asset: assetAddress,
        wallet: aliceAddress,
        amount: withdrawAmount,
        round: 1
      })
      await expect(
        metaLedger.balance(assetAddress, aliceAddress, 1)
      ).resolves.toEqual(depositAmount.minus(withdrawAmount))
    })

    it('performs a correct audit ', async () => {
      await metaLedger.register(aliceAddress, 0)
      await metaLedger.register(bobAddress, 0)
      await metaLedger.register(patAddress, 0)

      await metaLedger.creditDeposit(assetAddress, aliceAddress, D('2'), 0)

      const expectedCommit = {
        content:
          '0xfc014d75a641dd250aa7901f073fc8c92a26fd657c43a6aa41c5475e97c745af',
        height: D('3'),
        width: D('4')
      }
      const tree = await metaLedger.getSolvencyTree(assetAddress, 1)
      expect(tree.getRootInfo()).toEqual(expectedCommit)

      const clientState = await metaLedger.completeProof(
        assetAddress,
        aliceAddress,
        1
      )
      const expectedClientState = {
        clientOpeningBalance: D('2'),
        clientAddress: '0xa17ce00000000000000000000000000000000000',
        hashes: [
          '0xde00a69409e760956a7fe1b681df4fec108443e4dd8c38531dca966feb3b76a9',
          '0x01268bc028ff24653cb926652555642209b4e7e9b0a7aaf2c68713b6830f49e6'
        ],
        sums: [D('0'), D('0')],
        tokenAddress: '0x7d636D657c8BD158D7d94e7b4284f0c480F53671',
        height: D('3'),
        width: D('4'),
        round: 1
      }

      expect(clientState).toEqual(expectedClientState)
    })
  })
})
