// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import knex from 'knex'
import { IBalanceDispute } from '../types/OperatorAndClientTypes'

interface DataAccessMethods {
  save(dispute: IBalanceDispute): Promise<void>
  find(whereClause: any): Promise<IBalanceDispute[]>
  findOne(whereClause: any): Promise<IBalanceDispute | null>
  update(dispute: IBalanceDispute): Promise<void>
}

interface CollectionOptions {
  dropTable?: boolean
}

export class DisputeCollection {
  static tableName = 'disputes'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(DisputeCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(DisputeCollection.tableName)

    if (!tableExists) {
      await conn.schema.createTable(DisputeCollection.tableName, t => {
        t.increments('id').primary()

        t.bigInteger('round')
        t.string('wallet', 42)
        t.enum('status', ['open', 'closed'])
      })
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    return {
      async save(dispute: IBalanceDispute): Promise<void> {
        await conn(DisputeCollection.tableName).insert(dispute)
      },

      async find(whereClause: any): Promise<IBalanceDispute[]> {
        return conn(DisputeCollection.tableName)
          .select('*')
          .where(whereClause)
      },

      async findOne(whereClause: any): Promise<IBalanceDispute | null> {
        const rows = await this.find(whereClause)
        return rows.length === 0 ? null : rows[0]
      },

      async update(dispute: IBalanceDispute): Promise<void> {
        await conn(DisputeCollection.tableName)
          .where({
            round: dispute.round,
            wallet: dispute.wallet
          })
          .update(dispute)
      }
    }
  }
}
