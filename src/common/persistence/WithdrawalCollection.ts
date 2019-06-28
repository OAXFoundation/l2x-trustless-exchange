// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import knex from 'knex'
import { IWithdrawal } from '../types/OperatorAndClientTypes'
import { D } from '../BigNumberUtils'
import { Omit } from '../types/BasicTypes'

interface DataAccessMethods {
  save(withdrawal: Omit<IWithdrawal, 'id'>): Promise<void>
  find(whereClause: any): Promise<IWithdrawal[]>
  findAll(): Promise<IWithdrawal[]>
  findOne(whereClause: any): Promise<IWithdrawal | null>
  update(withdrawal: IWithdrawal): Promise<void>
}

interface CollectionOptions {
  dropTable?: boolean
}

export class WithdrawalCollection {
  static tableName = 'withdrawals'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(WithdrawalCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(
      WithdrawalCollection.tableName
    )

    if (!tableExists) {
      await conn.schema.createTable(WithdrawalCollection.tableName, t => {
        t.increments('id').primary()
        t.string('txHash', 66).unique()
        t.string('asset', 42)
        t.string('wallet', 42)
        t.text('amount')
        t.bigInteger('round')
        t.text('status')
      })
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    return {
      async save(withdrawal: Omit<IWithdrawal, 'id'>): Promise<void> {
        const serialized = serialize(withdrawal)
        await conn(WithdrawalCollection.tableName).insert(serialized)
      },

      async find(whereClause: any): Promise<IWithdrawal[]> {
        const rows = conn(WithdrawalCollection.tableName)
          .select('*')
          .where(whereClause)

        return rows.map(deserialized)
      },

      async findAll(): Promise<IWithdrawal[]> {
        return this.find({})
      },

      async findOne(whereClause: any): Promise<IWithdrawal | null> {
        const rows = await this.find(whereClause)
        return rows.length === 0 ? null : rows[0]
      },

      async update(withdrawal: IWithdrawal): Promise<void> {
        const serialized = serialize(withdrawal)
        await conn(WithdrawalCollection.tableName)
          .where({ id: withdrawal.id })
          .update(serialized)
      }
    }
  }
}

function serialize(withdrawal: IWithdrawal | Omit<IWithdrawal, 'id'>) {
  return {
    ...withdrawal,
    amount: withdrawal.amount.toString(10)
  }
}

function deserialized(serialized: any): IWithdrawal {
  return {
    ...serialized,
    amount: D(serialized.amount)
  }
}
