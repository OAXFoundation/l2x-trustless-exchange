// ----------------------------------------------------------------------------
// Copyright (c) 2018,2019 OAX Foundation.
// https://www.oax.org/
// See LICENSE file for license details.
// ----------------------------------------------------------------------------
import knex from 'knex'
import { Proof } from '../types/SmartContractTypes'
import { ProofSerDe } from '../types/SerDe'
import { Round } from '../types/BasicTypes'

interface DataAccessMethods {
  save(proof: Proof, round: Round): Promise<void>
  find(whereClause: any): Promise<Proof[]>
  findOne(whereClause: any): Promise<Proof | undefined>
}

interface CollectionOptions {
  dropTable?: boolean
}

export class ProofCollection {
  static tableName = 'proofs'

  static async init(conn: knex, options?: CollectionOptions): Promise<void> {
    if (options !== undefined && options.dropTable === true) {
      await conn.schema.dropTableIfExists(ProofCollection.tableName)
    }

    const tableExists = await conn.schema.hasTable(ProofCollection.tableName)

    if (!tableExists) {
      await conn.schema.createTable(ProofCollection.tableName, t => {
        t.bigInteger('round')
        t.string('asset', 42)
        t.string('wallet', 42)
        t.text('proof')

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
      async save(proof: Proof, round: Round): Promise<void> {
        const serialized = proof.toJSON()
        await conn(ProofCollection.tableName).insert({
          round,
          asset: serialized.tokenAddress,
          wallet: serialized.clientAddress,
          proof: JSON.stringify(serialized)
        })
      },

      async find(whereClause: any): Promise<Proof[]> {
        const rows = conn(ProofCollection.tableName)
          .select('*')
          .where(whereClause)

        return rows.map((row: any) => {
          const proofJson = JSON.parse(row.proof)
          const proof = ProofSerDe.fromJSON(proofJson)

          return new Proof(
            proof.clientOpeningBalance,
            proof.clientAddress,
            proof.hashes,
            proof.sums,
            proof.tokenAddress,
            proof.height,
            proof.width,
            proof.round
          )
        })
      },

      async findOne(whereClause: any): Promise<Proof | undefined> {
        const rows = await this.find(whereClause)
        return rows.length === 0 ? undefined : rows[0]
      }
    }
  }
}
