import { describe, it, expect } from 'vitest'
import { extractParams } from './named-params.js'

describe('extractParams', () => {
  it('extracts single param', () => {
    const result = extractParams('SELECT * FROM t WHERE id=:id')
    expect(result.paramNames).toEqual(['id'])
    expect(result.parts).toEqual([
      'SELECT * FROM t WHERE id=',
      { name: 'id' },
    ])
  })

  it('extracts multiple params', () => {
    const result = extractParams(
      'SELECT * FROM t WHERE a=:alpha AND b=:beta',
    )
    expect(result.paramNames).toEqual(['alpha', 'beta'])
    expect(result.parts).toEqual([
      'SELECT * FROM t WHERE a=',
      { name: 'alpha' },
      ' AND b=',
      { name: 'beta' },
    ])
  })

  it('handles SQL with no params', () => {
    const result = extractParams('SELECT 1')
    expect(result.paramNames).toEqual([])
    expect(result.parts).toEqual(['SELECT 1'])
  })

  it('handles underscores in param names', () => {
    const result = extractParams('WHERE ext_id=:ext_id')
    expect(result.paramNames).toEqual(['ext_id'])
  })

  it('handles param at start of string', () => {
    const result = extractParams(':id')
    expect(result.paramNames).toEqual(['id'])
    expect(result.parts).toEqual([{ name: 'id' }])
  })

  it('handles repeated param names', () => {
    const result = extractParams('WHERE a=:x OR b=:x')
    expect(result.paramNames).toEqual(['x', 'x'])
  })

  it('ignores PostgreSQL :: type cast', () => {
    const result = extractParams("SELECT '123'::integer")
    expect(result.paramNames).toEqual([])
    expect(result.parts).toEqual(["SELECT '123'::integer"])
  })

  it('ignores :: cast but extracts param in same SQL', () => {
    const result = extractParams(
      "SELECT :val::numeric FROM t WHERE id=:id",
    )
    expect(result.paramNames).toEqual(['val', 'id'])
    expect(result.parts).toEqual([
      'SELECT ',
      { name: 'val' },
      '::numeric FROM t WHERE id=',
      { name: 'id' },
    ])
  })

  it('handles multiple casts', () => {
    const result = extractParams(
      "SELECT :a::text, :b::integer, '0'::boolean",
    )
    expect(result.paramNames).toEqual(['a', 'b'])
  })
})
