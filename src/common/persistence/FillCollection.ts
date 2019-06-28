// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import knex from 'knex'
import { ISignedFill } from '../types/Fills'
import { SignedFillSerDe } from '../types/SerDe'

interface DataAccessMethods {
  save(fill: ISignedFill): Promise<void>
  find(whereClause: any): Promise<ISignedFill[]>
  count(): Promise<number | string>
}

interface CollectionOptions {
  dropTable?: boolean
}

export class FillCollection {
  static tableName = 'fills'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(FillCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(FillCollection.tableName)

    if (!tableExists) {
      await conn.schema.createTable(FillCollection.tableName, t => {
        t.text('fillId').primary()

        t.bigInteger('round')

        t.text('approvalId')

        t.string('wallet', 42)

        t.text('fill')

        t.index(['fillId'])
        t.index(['round', 'approvalId'])
      })
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    return {
      async save(fill: ISignedFill): Promise<void> {
        const fillJson = SignedFillSerDe.toJSON(fill)

        await conn(FillCollection.tableName).insert({
          round: fill.params.round,
          fillId: fill.params.fillId,
          approvalId: fill.params.approvalId,
          wallet: fill.params.clientAddress,
          fill: JSON.stringify(fillJson)
        })
      },
      async find(whereClause: any): Promise<ISignedFill[]> {
        const rows = await conn(FillCollection.tableName)
          .select('fill')
          .where(whereClause)

        return rows.map((row: any) => {
          const json = JSON.parse(row.fill)
          return SignedFillSerDe.fromJSON(json)
        })
      },
      async count(): Promise<number | string> {
        const records = await conn(FillCollection.tableName).count({
          count: '*'
        })
        return records[0].count!
      }
    }
  }
}
