// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import knex from 'knex'
import { IWalletRegistryEntry } from '../types/OperatorAndClientTypes'

interface DataAccessMethods {
  save(entry: IWalletRegistryEntry): Promise<void>
  update(entry: IWalletRegistryEntry): Promise<void>
  find(whereClause: any): Promise<IWalletRegistryEntry[]>
  findOne(whereClause: any): Promise<IWalletRegistryEntry | null>
}

interface CollectionOptions {
  dropTable?: boolean
}

interface Row {
  wallet: string
  roundJoined: number
  lastFillRound: number
  lastAuditRound: number
  authorization?: string
}

export class WalletCollection {
  static tableName = 'wallets_registry'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(WalletCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(WalletCollection.tableName)

    if (!tableExists) {
      await conn.schema.createTable(WalletCollection.tableName, t => {
        t.increments('id').primary()
        t.string('wallet', 42).unique()
        t.bigInteger('roundJoined').notNullable()
        t.bigInteger('lastFillRound').notNullable()
        t.bigInteger('lastAuditRound').notNullable()
        t.text('authorization')
      })
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    function entryToRow(entry: IWalletRegistryEntry): Row {
      let authorization = undefined

      if (entry.authorization !== undefined) {
        authorization = JSON.stringify(entry.authorization)
      }

      return {
        ...entry,
        authorization
      }
    }

    return {
      async save(entry: IWalletRegistryEntry): Promise<void> {
        await conn(WalletCollection.tableName).insert(entryToRow(entry))
      },

      async update(entry: IWalletRegistryEntry): Promise<void> {
        const row = entryToRow(entry)
        await conn(WalletCollection.tableName)
          .where({ wallet: entry.wallet })
          .update(row)
      },

      async find(whereClause: any): Promise<IWalletRegistryEntry[]> {
        const rows = conn(WalletCollection.tableName)
          .select('*')
          .where(whereClause)

        return rows.map((row: Row) => {
          let authorization = undefined

          if (row.authorization !== undefined) {
            authorization = JSON.parse(row.authorization)
          }

          const walletEntry: IWalletRegistryEntry = {
            ...row,
            authorization: authorization
          }

          return walletEntry
        })
      },

      async findOne(whereClause: any): Promise<IWalletRegistryEntry | null> {
        const rows = await this.find(whereClause)

        return rows.length === 0 ? null : rows[0]
      }
    }
  }
}
