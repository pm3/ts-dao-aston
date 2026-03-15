import type { z, ZodObject, ZodRawShape } from 'zod'
import type { EntityConfig } from './entity-config.js'
import type { Tx } from '../types.js'
import { detectJsonbColumns } from './jsonb.js'
import { getPool } from '../config.js'
import { prepareQuery } from '../sql/template.js'
import { NoRowsError } from '../errors.js'

type Entity<S extends ZodObject<ZodRawShape>> = z.infer<S>

const jsonbCache = new WeakMap<ZodObject<ZodRawShape>, Set<string>>()

function getJsonbCols(schema: ZodObject<ZodRawShape>): Set<string> {
  let cols = jsonbCache.get(schema)
  if (!cols) {
    cols = detectJsonbColumns(schema)
    jsonbCache.set(schema, cols)
  }
  return cols
}

function managedKeys(config: EntityConfig): Set<string> {
  const keys = new Set<string>([config.pk])
  if (config.createdAt) keys.add(config.createdAt)
  if (config.updatedAt) keys.add(config.updatedAt)
  return keys
}

function serializeValue(
  value: unknown,
  key: string,
  jsonbCols: Set<string>,
): unknown {
  if (value === null || value === undefined) return value
  if (jsonbCols.has(key)) return JSON.stringify(value)
  return value
}

async function executeRaw<T>(
  sql: string,
  params: Record<string, unknown>,
  tx: Tx | undefined,
): Promise<T[]> {
  const { sql: resolved, values } = prepareQuery(sql, params)
  const executor = tx ?? getPool()
  const result = await executor.query(resolved, values)
  return result.rows as T[]
}

// --- Read operations ---

export async function oneEntity<S extends ZodObject<ZodRawShape>>(
  config: EntityConfig<S>,
  id: string,
  tx?: Tx,
): Promise<Entity<S>> {
  const sql = `SELECT * FROM ${config.table} WHERE ${config.pk}=:id`
  const rows = await executeRaw(sql, { id }, tx)
  if (rows.length === 0) throw new NoRowsError(sql)
  return rows[0] as Entity<S>
}

export async function maybeEntity<S extends ZodObject<ZodRawShape>>(
  config: EntityConfig<S>,
  id: string,
  tx?: Tx,
): Promise<Entity<S> | null> {
  const sql = `SELECT * FROM ${config.table} WHERE ${config.pk}=:id`
  const rows = await executeRaw(sql, { id }, tx)
  if (rows.length === 0) return null
  return rows[0] as Entity<S>
}

// --- Insert ---

export async function insertEntity<S extends ZodObject<ZodRawShape>>(
  config: EntityConfig<S>,
  data: Partial<Entity<S>>,
  tx?: Tx,
): Promise<void> {
  const obj = config.schema.partial().parse(data) as Record<string, unknown>
  const managed = managedKeys(config)
  const jsonbCols = getJsonbCols(config.schema)

  const cols: string[] = []
  const params: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (managed.has(key)) continue
    cols.push(key)
    params[key] = serializeValue(value, key, jsonbCols)
  }

  const colList = cols.join(', ')
  const valList = cols.map((c) => `:${c}`).join(', ')
  const sql = `INSERT INTO ${config.table} (${colList}) VALUES (${valList})`

  await executeRaw(sql, params, tx)
}

export async function insertEntityWithId<S extends ZodObject<ZodRawShape>>(
  config: EntityConfig<S>,
  data: Partial<Entity<S>>,
  tx?: Tx,
): Promise<string> {
  const obj = config.schema.partial().parse(data) as Record<string, unknown>
  const managed = managedKeys(config)
  const jsonbCols = getJsonbCols(config.schema)

  const cols: string[] = []
  const params: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (managed.has(key)) continue
    cols.push(key)
    params[key] = serializeValue(value, key, jsonbCols)
  }

  const colList = cols.join(', ')
  const valList = cols.map((c) => `:${c}`).join(', ')
  const sql = `INSERT INTO ${config.table} (${colList}) VALUES (${valList}) RETURNING ${config.pk}`

  const rows = await executeRaw<Record<string, string>>(sql, params, tx)
  if (!rows[0]) throw new NoRowsError(sql)
  return rows[0][config.pk]!
}

// --- Update (PATCH semantics) ---

export async function updateEntity<S extends ZodObject<ZodRawShape>>(
  config: EntityConfig<S>,
  data: Partial<Entity<S>>,
  tx?: Tx,
): Promise<void> {
  const obj = config.schema.partial().parse(data) as Record<string, unknown>
  const pkValue = obj[config.pk]
  if (pkValue === undefined || pkValue === null) {
    throw new Error(
      `updateEntity: primary key "${config.pk}" is required`,
    )
  }

  const managed = managedKeys(config)
  const jsonbCols = getJsonbCols(config.schema)

  const setClauses: string[] = []
  const params: Record<string, unknown> = { [config.pk]: pkValue }

  for (const [key, value] of Object.entries(obj)) {
    if (managed.has(key)) continue
    if (value === undefined) continue
    setClauses.push(`${key}=:${key}`)
    params[key] = serializeValue(value, key, jsonbCols)
  }

  if (config.updatedAt) {
    setClauses.push(`${config.updatedAt}=now()`)
  }

  if (setClauses.length === 0) return

  const sql = `UPDATE ${config.table} SET ${setClauses.join(', ')} WHERE ${config.pk}=:${config.pk}`
  await executeRaw(sql, params, tx)
}

// --- Upsert ---

export async function upsertEntity<S extends ZodObject<ZodRawShape>>(
  config: EntityConfig<S>,
  data: Partial<Entity<S>>,
  tx?: Tx,
): Promise<void> {
  const obj = config.schema.partial().parse(data) as Record<string, unknown>
  const pkValue = obj[config.pk]
  if (pkValue === undefined || pkValue === null) {
    throw new Error(
      `upsertEntity: primary key "${config.pk}" is required`,
    )
  }

  const jsonbCols = getJsonbCols(config.schema)
  const skipOnInsert = new Set<string>()
  if (config.createdAt) skipOnInsert.add(config.createdAt)
  if (config.updatedAt) skipOnInsert.add(config.updatedAt)

  const cols: string[] = [config.pk]
  const params: Record<string, unknown> = { [config.pk]: pkValue }

  for (const [key, value] of Object.entries(obj)) {
    if (key === config.pk) continue
    if (skipOnInsert.has(key)) continue
    cols.push(key)
    params[key] = serializeValue(value, key, jsonbCols)
  }

  const colList = cols.join(', ')
  const valList = cols.map((c) => `:${c}`).join(', ')

  const updateCols = cols.filter((c) => c !== config.pk)
  const updateClauses = updateCols.map((c) => `${c}=EXCLUDED.${c}`)
  if (config.updatedAt) {
    updateClauses.push(`${config.updatedAt}=now()`)
  }

  const sql = `INSERT INTO ${config.table} (${colList}) VALUES (${valList}) ON CONFLICT (${config.pk}) DO UPDATE SET ${updateClauses.join(', ')}`
  await executeRaw(sql, params, tx)
}

// --- Delete ---

export async function deleteById<S extends ZodObject<ZodRawShape>>(
  config: EntityConfig<S>,
  id: string,
  tx?: Tx,
): Promise<void> {
  const sql = `DELETE FROM ${config.table} WHERE ${config.pk}=:id`
  await executeRaw(sql, { id }, tx)
}
