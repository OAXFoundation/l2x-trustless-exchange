// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import knex from 'knex'
import { ITradeInternal } from '../types/ExchangeTypes'
import { TradeInternalSerDe } from '../types/SerDe'

interface DataAccessMethods {
  save(trade: ITradeInternal): Promise<void>
  find(): Promise<ITradeInternal[]>
}

interface CollectionOptions {
  dropTable?: boolean
}

export class TradeCollection {
  static tableName = 'trades'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(TradeCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(TradeCollection.tableName)

    if (!tableExists) {
      await conn.schema.createTable(TradeCollection.tableName, t => {
        t.increments('id').primary()
        t.text('trade')
      })
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    return {
      async save(trade: ITradeInternal): Promise<void> {
        const json = TradeInternalSerDe.toJSON(trade)

        await conn(TradeCollection.tableName).insert({
          trade: JSON.stringify(json)
        })
      },
      async find(): Promise<ITradeInternal[]> {
        const rows = await conn(TradeCollection.tableName).select('*')

        return rows.map((row: any) => {
          const json = JSON.parse(row.trade)
          return TradeInternalSerDe.fromJSON(json)
        })
      }
    }
  }
}
