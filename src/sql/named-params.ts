export interface ParamRef {
  readonly name: string
}

export type TemplatePart = string | ParamRef

const PARAM_RE = /:([a-zA-Z_][a-zA-Z0-9_]*)/g

/**
 * Splits a SQL fragment into interleaved text and parameter references.
 *
 * "WHERE id=:id AND name=:name"
 * → ["WHERE id=", {name:"id"}, " AND name=", {name:"name"}]
 */
export function extractParams(sql: string): {
  parts: TemplatePart[]
  paramNames: string[]
} {
  const parts: TemplatePart[] = []
  const paramNames: string[] = []
  let lastIndex = 0

  for (const match of sql.matchAll(PARAM_RE)) {
    const textBefore = sql.slice(lastIndex, match.index)
    if (textBefore) parts.push(textBefore)

    const name = match[1]!
    parts.push({ name })
    paramNames.push(name)

    lastIndex = match.index! + match[0].length
  }

  const tail = sql.slice(lastIndex)
  if (tail) parts.push(tail)

  return { parts, paramNames }
}
