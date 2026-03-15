import { extractOptionalBlocks } from './optional-blocks.js'
import { extractParams, type ParamRef, type TemplatePart } from './named-params.js'
import { isSpread, type SqlParams } from '../types.js'

export interface Segment {
  optional: boolean
  referencedParams: string[]
  parts: TemplatePart[]
}

export interface ParsedTemplate {
  segments: Segment[]
}

export interface ResolvedQuery {
  sql: string
  values: unknown[]
}

const cache = new Map<string, ParsedTemplate>()

export function parse(sql: string): ParsedTemplate {
  const cached = cache.get(sql)
  if (cached) return cached

  const rawSegments = extractOptionalBlocks(sql)

  const segments: Segment[] = rawSegments.map((raw) => {
    const { parts, paramNames } = extractParams(raw.text)
    return {
      optional: raw.optional,
      referencedParams: paramNames,
      parts,
    }
  })

  const template: ParsedTemplate = { segments }
  cache.set(sql, template)
  return template
}

export function resolve(
  template: ParsedTemplate,
  params: SqlParams | undefined,
): ResolvedQuery {
  const p = params ?? {}
  const sqlParts: string[] = []
  const values: unknown[] = []
  let idx = 1

  for (const segment of template.segments) {
    if (segment.optional) {
      const skip = segment.referencedParams.some(
        (name) => p[name] === null || p[name] === undefined,
      )
      if (skip) continue
    }

    for (const part of segment.parts) {
      if (typeof part === 'string') {
        sqlParts.push(part)
        continue
      }

      const ref = part as ParamRef
      const value = p[ref.name]

      if (isSpread(value)) {
        const placeholders: string[] = []
        for (const item of value.values) {
          placeholders.push(`$${idx++}`)
          values.push(item)
        }
        sqlParts.push(placeholders.join(','))
      } else {
        sqlParts.push(`$${idx++}`)
        values.push(value)
      }
    }
  }

  return { sql: sqlParts.join(''), values }
}

export function prepareQuery(
  sql: string,
  params?: SqlParams,
): ResolvedQuery {
  const template = parse(sql)
  return resolve(template, params)
}

export function clearTemplateCache(): void {
  cache.clear()
}
