// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import knex from 'knex'

interface DataAccessMethods {
  save(lastProcessedBlock: number): Promise<void>
  get(): Promise<number>
}

interface CollectionOptions {
  dropTable?: boolean
}

export class BlockCollection {
  static readonly tableName = 'blocks'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(BlockCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(BlockCollection.tableName)

    if (!tableExists) {
      await conn.schema.createTable(BlockCollection.tableName, t => {
        t.string('property').primary()
        t.integer('value', -1)
      })

      try {
        await conn(BlockCollection.tableName).insert({
          property: 'lastProcessedBlock',
          value: -1
        })
      } catch (err) {
        console.info(err.stack)
      }
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    return {
      /**
       * upsert last process block
       *
       * @param lastProcessedBlock
       */
      async save(lastProcessedBlock: number): Promise<void> {
        await conn(BlockCollection.tableName)
          .update({ value: lastProcessedBlock })
          .where({ property: 'lastProcessedBlock' })
      },

      async get(): Promise<number> {
        const record = await conn(BlockCollection.tableName)
          .select('value')
          .where({ property: 'lastProcessedBlock' })
          .first()

        return record === undefined ? -1 : record.value
      }
    }
  }
}
