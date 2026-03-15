import { describe, it, expect, beforeEach } from 'vitest'
import { parse, resolve, prepareQuery, clearTemplateCache } from './template.js'
import { inList } from '../types.js'

beforeEach(() => clearTemplateCache())

describe('parse', () => {
  it('parses simple SQL into segments', () => {
    const template = parse('SELECT * FROM t WHERE id=:id')
    expect(template.segments).toHaveLength(1)
    expect(template.segments[0]!.optional).toBe(false)
    expect(template.segments[0]!.referencedParams).toEqual(['id'])
  })

  it('parses optional blocks', () => {
    const template = parse(
      'SELECT * FROM t WHERE 1=1 /** AND id=:id **/',
    )
    expect(template.segments).toHaveLength(2)
    expect(template.segments[0]!.optional).toBe(false)
    expect(template.segments[1]!.optional).toBe(true)
    expect(template.segments[1]!.referencedParams).toEqual(['id'])
  })

  it('returns cached template on second call', () => {
    const sql = 'SELECT 1'
    const a = parse(sql)
    const b = parse(sql)
    expect(a).toBe(b)
  })
})

describe('resolve', () => {
  it('replaces named params with positional', () => {
    const template = parse('SELECT * FROM t WHERE a=:a AND b=:b')
    const result = resolve(template, { a: 1, b: 'x' })
    expect(result.sql).toBe('SELECT * FROM t WHERE a=$1 AND b=$2')
    expect(result.values).toEqual([1, 'x'])
  })

  it('removes optional block when param is null', () => {
    const template = parse(
      'SELECT * FROM t WHERE 1=1 /** AND id=:id **/',
    )
    const result = resolve(template, { id: null })
    expect(result.sql).toBe('SELECT * FROM t WHERE 1=1 ')
    expect(result.values).toEqual([])
  })

  it('removes optional block when param is undefined', () => {
    const template = parse(
      'SELECT * FROM t WHERE 1=1 /** AND id=:id **/',
    )
    const result = resolve(template, { id: undefined })
    expect(result.sql).toBe('SELECT * FROM t WHERE 1=1 ')
    expect(result.values).toEqual([])
  })

  it('includes optional block when param has value', () => {
    const template = parse(
      'SELECT * FROM t WHERE 1=1 /** AND id=:id **/',
    )
    const result = resolve(template, { id: 42 })
    expect(result.sql).toBe('SELECT * FROM t WHERE 1=1  AND id=$1 ')
    expect(result.values).toEqual([42])
  })

  it('handles mix of included and excluded optional blocks', () => {
    const template = parse(
      'SELECT * FROM t WHERE 1=1 /** AND a=:a **/ /** AND b=:b **/',
    )
    const result = resolve(template, { a: null, b: 'yes' })
    expect(result.sql).toBe('SELECT * FROM t WHERE 1=1   AND b=$1 ')
    expect(result.values).toEqual(['yes'])
  })

  it('expands InList to multiple positional params', () => {
    const template = parse('SELECT * FROM t WHERE id IN (:ids)')
    const result = resolve(template, { ids: inList([10, 20, 30]) })
    expect(result.sql).toBe('SELECT * FROM t WHERE id IN ($1,$2,$3)')
    expect(result.values).toEqual([10, 20, 30])
  })

  it('mixes InList with scalar params', () => {
    const template = parse(
      'SELECT * FROM t WHERE id IN (:ids) AND status=:status',
    )
    const result = resolve(template, {
      ids: inList([1, 2]),
      status: 'active',
    })
    expect(result.sql).toBe(
      'SELECT * FROM t WHERE id IN ($1,$2) AND status=$3',
    )
    expect(result.values).toEqual([1, 2, 'active'])
  })

  it('handles params as undefined (no params)', () => {
    const template = parse('SELECT 1')
    const result = resolve(template, undefined)
    expect(result.sql).toBe('SELECT 1')
    expect(result.values).toEqual([])
  })
})

describe('prepareQuery', () => {
  it('combines parse + resolve in one call', () => {
    const result = prepareQuery(
      'SELECT * FROM t WHERE id=:id /** AND active=:active **/',
      { id: '5', active: null },
    )
    expect(result.sql).toBe('SELECT * FROM t WHERE id=$1 ')
    expect(result.values).toEqual(['5'])
  })
})
