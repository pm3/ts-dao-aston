import { describe, it, expect } from 'vitest'
import { extractOptionalBlocks } from './optional-blocks.js'

describe('extractOptionalBlocks', () => {
  it('splits static and optional segments', () => {
    const sql = 'SELECT * FROM t WHERE 1=1 /** AND id=:id **/'
    const segments = extractOptionalBlocks(sql)
    expect(segments).toEqual([
      { text: 'SELECT * FROM t WHERE 1=1 ', optional: false },
      { text: ' AND id=:id ', optional: true },
    ])
  })

  it('handles multiple optional blocks', () => {
    const sql =
      'SELECT * FROM t WHERE 1=1 /** AND a=:a **/ /** AND b=:b **/'
    const segments = extractOptionalBlocks(sql)
    expect(segments).toEqual([
      { text: 'SELECT * FROM t WHERE 1=1 ', optional: false },
      { text: ' AND a=:a ', optional: true },
      { text: ' ', optional: false },
      { text: ' AND b=:b ', optional: true },
    ])
  })

  it('handles SQL with no optional blocks', () => {
    const segments = extractOptionalBlocks('SELECT 1')
    expect(segments).toEqual([{ text: 'SELECT 1', optional: false }])
  })

  it('handles multiline optional blocks', () => {
    const sql = `SELECT * FROM t WHERE 1=1
/** AND id=:id **/`
    const segments = extractOptionalBlocks(sql)
    expect(segments).toHaveLength(2)
    expect(segments[1]!.optional).toBe(true)
    expect(segments[1]!.text).toBe(' AND id=:id ')
  })
})
