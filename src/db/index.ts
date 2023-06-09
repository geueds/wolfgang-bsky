import { createPool } from 'mysql2'
import { Kysely, MysqlDialect } from 'kysely'
import { DatabaseSchema } from './schema'

export const createDb = (database: string, host: string, user: string, password: string): Database => {
  return new Kysely<DatabaseSchema>({
    dialect: new MysqlDialect({
      pool: createPool({
        database: database,
        host: host,
        user: user,
        password: password,
      })
    })
})
}

export type Database = Kysely<DatabaseSchema>
