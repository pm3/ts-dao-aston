import type { PoolClient } from 'pg'

const SPREAD_BRAND = Symbol('Spread')

export interface Spread {
  readonly __brand: typeof SPREAD_BRAND
  readonly values: readonly unknown[]
}

export function spread(values: readonly unknown[]): Spread {
  if (values.length === 0) {
    throw new Error('spread() requires a non-empty array')
  }
  return { __brand: SPREAD_BRAND, values }
}

export function isSpread(value: unknown): value is Spread {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as Spread).__brand === SPREAD_BRAND
  )
}

export type Tx = PoolClient

export type SqlParams = Record<string, unknown>

export interface QueryResult<T> {
  rows: T[]
  rowCount: number
}
