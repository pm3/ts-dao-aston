import { configure, destroyPool } from '../src/index.js'
import { getPool } from '../src/config.js'

const TEST_DB_URL = 'postgresql://dao:dao@localhost:54320/dao_test'

let initialized = false

export async function setupDatabase(): Promise<void> {
  if (initialized) return
  initialized = true

  configure({ connectionString: TEST_DB_URL })

  const pool = getPool()

  await pool.query('DROP TABLE IF EXISTS users CASCADE')
  await pool.query('DROP TABLE IF EXISTS products CASCADE')

  await pool.query(`
    CREATE TABLE users (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      email       TEXT NOT NULL UNIQUE,
      ext_id      TEXT,
      active      BOOLEAN NOT NULL DEFAULT true,
      address     JSONB,
      tags        JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await pool.query(`
    CREATE TABLE products (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name        TEXT NOT NULL,
      price       NUMERIC(10,2) NOT NULL,
      meta        JSONB,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

export async function teardownDatabase(): Promise<void> {
  const pool = getPool()
  await pool.query('DROP TABLE IF EXISTS users CASCADE')
  await pool.query('DROP TABLE IF EXISTS products CASCADE')
  await destroyPool()
}
