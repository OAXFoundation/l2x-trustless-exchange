// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import knex from 'knex'

interface DataAccessMethods {
  save(entry: row): Promise<void>
  find(whereClause: any): Promise<row[]>
  findOne(whereClause: any): Promise<row | null>
}

interface CollectionOptions {
  dropTable?: boolean
}

interface row {
  asset: string
  wallet: string
  recovered?: boolean
}

export class RecoveryCollection {
  static tableName = 'recoveries'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(RecoveryCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(RecoveryCollection.tableName)

    if (!tableExists) {
      await conn.schema.createTable(RecoveryCollection.tableName, t => {
        t.string('asset', 42)
        t.string('wallet', 42)
        t.boolean('recovered')

        t.primary(['asset', 'wallet'])
      })
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    return {
      async save(entry: row): Promise<void> {
        await conn(RecoveryCollection.tableName).insert(entry)
      },

      async find(whereClause: any): Promise<row[]> {
        const rows = conn(RecoveryCollection.tableName)
          .select('*')
          .where(whereClause)

        return rows
      },

      async findOne(whereClause: any): Promise<row | null> {
        const rows = await this.find(whereClause)

        return rows.length === 0 ? null : rows[0]
      }
    }
  }
}
