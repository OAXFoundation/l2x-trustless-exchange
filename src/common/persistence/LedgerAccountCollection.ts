// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ---------------------------------------------------------------------------

import knex from 'knex'
import { ILedgerAccount } from '../types/OperatorAndClientTypes'
import { LedgerAccountSerDe } from '../types/SerDe'

interface DataAccessMethods {
  save(account: ILedgerAccount): Promise<void>
  find(whereClause: any): Promise<ILedgerAccount[]>
  findOne(whereClause: any): Promise<ILedgerAccount | undefined>
  update(account: ILedgerAccount): Promise<void>
}

interface CollectionOptions {
  dropTable?: boolean
}

export class LedgerAccountCollection {
  static tableName = 'ledger_accounts'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(LedgerAccountCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(
      LedgerAccountCollection.tableName
    )

    if (!tableExists) {
      await conn.schema.createTable(LedgerAccountCollection.tableName, t => {
        t.bigInteger('round')
        t.string('asset', 42)
        t.string('wallet', 42)
        t.text('deposited')
        t.text('withdrawn')
        t.text('bought')
        t.text('sold')
        t.text('locked')

        t.primary(['round', 'asset', 'wallet'])
      })
    }
  }

  /**
   * Returns the data access methods for the given connection
   * @param conn Connection
   */
  static with(conn: knex): DataAccessMethods {
    return {
      async save(account: ILedgerAccount): Promise<void> {
        const serialized = LedgerAccountSerDe.toJSON(account)
        await conn(LedgerAccountCollection.tableName).insert(serialized)
      },

      async find(whereClause: any): Promise<ILedgerAccount[]> {
        const rows = conn(LedgerAccountCollection.tableName)
          .select('*')
          .where(whereClause)

        return rows.map(LedgerAccountSerDe.fromJSON)
      },

      async findOne(whereClause): Promise<ILedgerAccount | undefined> {
        const rows = await this.find(whereClause)

        return rows.length === 0 ? undefined : rows[0]
      },

      async update(account: ILedgerAccount): Promise<void> {
        const serialized = LedgerAccountSerDe.toJSON(account)

        await conn(LedgerAccountCollection.tableName)
          .where({
            round: account.round,
            asset: account.asset,
            wallet: account.wallet
          })
          .update(serialized)
      }
    }
  }
}
