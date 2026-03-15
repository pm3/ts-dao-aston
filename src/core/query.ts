import { getPool } from '../config.js'
import { prepareQuery } from '../sql/template.js'
import { NoRowsError, TooManyRowsError } from '../errors.js'
import type { Tx, SqlParams } from '../types.js'

async function rawQuery<T>(
  sql: string,
  params: SqlParams | undefined,
  tx: Tx | undefined,
): Promise<{ rows: T[]; rowCount: number }> {
  const { sql: resolvedSql, values } = prepareQuery(sql, params)
  const executor = tx ?? getPool()
  const result = await executor.query(resolvedSql, values)
  return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 }
}

export async function selectOne<T>(
  sql: string,
  params?: SqlParams,
  tx?: Tx,
): Promise<T> {
  const { rows, rowCount } = await rawQuery<T>(sql, params, tx)
  if (rowCount === 0) throw new NoRowsError(sql)
  if (rowCount > 1) throw new TooManyRowsError(rowCount, sql)
  return rows[0]!
}

export async function maybeOne<T>(
  sql: string,
  params?: SqlParams,
  tx?: Tx,
): Promise<T | null> {
  const { rows, rowCount } = await rawQuery<T>(sql, params, tx)
  if (rowCount === 0) return null
  if (rowCount > 1) throw new TooManyRowsError(rowCount, sql)
  return rows[0]!
}

export async function select<T>(
  sql: string,
  params?: SqlParams,
  tx?: Tx,
): Promise<T[]> {
  const { rows } = await rawQuery<T>(sql, params, tx)
  return rows
}

export async function execute(
  sql: string,
  params?: SqlParams,
  tx?: Tx,
): Promise<void> {
  await rawQuery(sql, params, tx)
}

export async function insertGetId(
  sql: string,
  params?: SqlParams,
  tx?: Tx,
): Promise<string> {
  const { rows } = await rawQuery<{ id: string }>(sql, params, tx)
  if (!rows[0]) throw new NoRowsError(sql)
  return rows[0].id
}
