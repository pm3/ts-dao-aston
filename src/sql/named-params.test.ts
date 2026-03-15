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
})
