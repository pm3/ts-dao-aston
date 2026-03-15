import { Pool, type PoolConfig } from 'pg'

export interface DaoConfig {
  connectionString?: string
  pool?: PoolConfig | Pool
}

let pool: Pool | null = null

export function configure(config: DaoConfig): void {
  if (pool) {
    pool.end().catch(() => {})
  }

  if (config.pool instanceof Pool) {
    pool = config.pool
  } else {
    pool = new Pool({
      connectionString: config.connectionString,
      ...config.pool,
    })
  }
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error(
      'ts-dao-aston: Pool not configured. Call configure() first.',
    )
  }
  return pool
}

export async function destroyPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
