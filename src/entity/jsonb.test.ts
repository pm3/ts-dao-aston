import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { detectJsonbColumns } from './jsonb.js'

describe('detectJsonbColumns', () => {
  it('detects z.object() as JSONB', () => {
    const schema = z.object({
      id: z.string(),
      address: z.object({ street: z.string(), city: z.string() }),
    })
    expect(detectJsonbColumns(schema)).toEqual(new Set(['address']))
  })

  it('detects z.array() as JSONB', () => {
    const schema = z.object({
      id: z.string(),
      tags: z.array(z.string()),
    })
    expect(detectJsonbColumns(schema)).toEqual(new Set(['tags']))
  })

  it('detects z.record() as JSONB', () => {
    const schema = z.object({
      id: z.string(),
      meta: z.record(z.string(), z.unknown()),
    })
    expect(detectJsonbColumns(schema)).toEqual(new Set(['meta']))
  })

  it('does not flag primitives', () => {
    const schema = z.object({
      id: z.string(),
      name: z.string(),
      count: z.number(),
      active: z.boolean(),
      created: z.date(),
    })
    expect(detectJsonbColumns(schema)).toEqual(new Set())
  })

  it('unwraps nullable/optional wrappers', () => {
    const schema = z.object({
      id: z.string(),
      addr: z.object({ x: z.string() }).nullable(),
      tags: z.array(z.string()).optional(),
    })
    const cols = detectJsonbColumns(schema)
    expect(cols.has('addr')).toBe(true)
    expect(cols.has('tags')).toBe(true)
  })

  it('unwraps transform (ZodEffects)', () => {
    const schema = z.object({
      id: z.string(),
      data: z.object({ x: z.number() }).transform((v) => v),
    })
    expect(detectJsonbColumns(schema)).toEqual(new Set(['data']))
  })

  it('handles mixed schema', () => {
    const schema = z.object({
      id: z.string().uuid(),
      name: z.string(),
      active: z.boolean(),
      address: z.object({ street: z.string(), city: z.string() }),
      tags: z.array(z.string()),
      meta: z.record(z.string(), z.unknown()),
      amount: z.string().transform(parseFloat),
    })
    expect(detectJsonbColumns(schema)).toEqual(
      new Set(['address', 'tags', 'meta']),
    )
  })
})
