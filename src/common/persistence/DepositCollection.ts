// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------

import BigNumber from 'bignumber.js'
import knex from 'knex'
import { D } from '../BigNumberUtils'

export interface DepositRecord {
  txHash: string
  asset: string
  wallet: string
  round: number
  amount: BigNumber
}

interface DepositDBRecord
  extends Pick<DepositRecord, Exclude<keyof DepositRecord, 'amount'>> {
  amount: string
}

interface DataAccessMethods {
  save(deposit: DepositRecord): Promise<void>
  find(whereClause: any): Promise<DepositRecord[]>
  findOne(whereClause: any): Promise<DepositRecord | null>
}

interface CollectionOptions {
  dropTable?: boolean
}

export class DepositCollection {
  static readonly tableName = 'deposits'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(DepositCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(DepositCollection.tableName)

    if (!tableExists) {
      await conn.schema.createTable(DepositCollection.tableName, t => {
        t.string('txHash', 66).primary()
        t.string('asset', 42)
        t.string('wallet', 42)
        t.bigInteger('round')
        t.string('amount')
      })
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    return {
      async save(deposit: DepositRecord): Promise<void> {
        await conn(DepositCollection.tableName).insert({
          ...deposit,
          amount: deposit.amount.toString(10)
        })
      },

      async find(whereClause: any): Promise<DepositRecord[]> {
        return conn(DepositCollection.tableName)
          .select('*')
          .where(whereClause)
          .map((rawRecord: DepositDBRecord) => ({
            ...rawRecord,
            amount: D(rawRecord.amount)
          }))
      },

      async findOne(whereClause: any): Promise<DepositRecord | null> {
        const rows = await this.find(whereClause)
        return rows.length === 0 ? null : rows[0]
      }
    }
  }
}
