import type { PoolClient } from 'pg'

const IN_LIST_BRAND = Symbol('InList')

export interface InList {
  readonly __brand: typeof IN_LIST_BRAND
  readonly values: readonly unknown[]
}

export function inList(values: readonly unknown[]): InList {
  if (values.length === 0) {
    throw new Error('inList() requires a non-empty array')
  }
  return { __brand: IN_LIST_BRAND, values }
}

export function isInList(value: unknown): value is InList {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__brand' in value &&
    (value as InList).__brand === IN_LIST_BRAND
  )
}

export type Tx = PoolClient

export type SqlParams = Record<string, unknown>

export interface QueryResult<T> {
  rows: T[]
  rowCount: number
}
