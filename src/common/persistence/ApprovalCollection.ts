// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

import knex from 'knex'
import { SignedApprovalSerDe } from '../types/SerDe'
import { ISignedApproval } from '../types/Approvals'
import { ApprovalWithMeta } from '../types/ExchangeTypes'
import { Amount, ApprovalId, Status } from '../types/BasicTypes'
import { D } from '../BigNumberUtils'

interface DataAccessMethods {
  save(approval: ISignedApproval): Promise<void>
  updateStatus(
    approvalId: ApprovalId,
    buyAmount: Amount,
    sellAmount: Amount,
    status: Status
  ): Promise<void>
  find(whereClause: any): Promise<ISignedApproval[]>
  findWithMeta(whereClause: any): Promise<ApprovalWithMeta[]>
  cancel(approvalId: ApprovalId): Promise<void>
}

interface CollectionOptions {
  dropTable?: boolean
}

export class ApprovalCollection {
  static tableName = 'approvals'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(ApprovalCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(ApprovalCollection.tableName)

    if (!tableExists) {
      await conn.schema.createTable(ApprovalCollection.tableName, t => {
        t.increments('id').primary()
        t.text('approvalId').unique()

        t.bigInteger('round')
        t.string('buyAsset', 42)
        t.string('sellAsset', 42)
        t.string('wallet', 42)
        t.bigInteger('timestamp')
        t.text('approval')
        t.text('filledBuy')
        t.text('filledSell')
        t.decimal('price', 40, 20) // precision / scale
        t.enum('status', ['open', 'closed', 'canceled'])

        t.index(['buyAsset', 'sellAsset', 'round', 'status', 'price'])
      })
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    return {
      async save(approval: ISignedApproval): Promise<void> {
        const approvalJson = SignedApprovalSerDe.toJSON(approval)

        const { approvalId, owner, round, buy, sell } = approval.params

        await conn(ApprovalCollection.tableName).insert({
          approvalId: approvalId,
          round: round,
          buyAsset: buy.asset,
          sellAsset: sell.asset,
          wallet: owner,
          approval: JSON.stringify(approvalJson),
          timestamp: Date.now(),
          price: sell.amount.isZero()
            ? '0'
            : buy.amount.div(sell.amount).toString(10),
          filledBuy: '0',
          filledSell: '0',
          status: 'open'
        })
      },
      async updateStatus(
        approvalId: ApprovalId,
        filledBuy: Amount,
        filledSell: Amount,
        status: Status
      ): Promise<void> {
        await conn(ApprovalCollection.tableName)
          .where({ approvalId })
          .update({
            filledBuy: filledBuy.toString(10),
            filledSell: filledSell.toString(10),
            status
          })
      },

      async find(whereClause: any): Promise<ISignedApproval[]> {
        const rows = await conn(ApprovalCollection.tableName)
          .select('*')
          .where(whereClause)

        return rows.map((row: any) => {
          const json = JSON.parse(row.approval)
          return SignedApprovalSerDe.fromJSON(json)
        })
      },

      async findWithMeta(whereClause: any): Promise<ApprovalWithMeta[]> {
        const rows = await conn(ApprovalCollection.tableName)
          .select('*')
          .where(whereClause)

        return rows.map((row: any) => {
          const json = JSON.parse(row.approval)
          return {
            approval: SignedApprovalSerDe.fromJSON(json),
            timestamp: Number(row.timestamp), // force to Number
            id: row.id,
            filledBuy: D(row.filledBuy),
            filledSell: D(row.filledSell),
            status: row.status
          }
        })
      },

      async cancel(approvalId: ApprovalId): Promise<void> {
        await conn(ApprovalCollection.tableName)
          .where('approvalId', approvalId)
          .update('status', 'canceled')
      }
    }
  }
}
