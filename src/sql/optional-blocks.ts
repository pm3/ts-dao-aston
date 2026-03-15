export interface RawSegment {
  text: string
  optional: boolean
}

const OPTIONAL_BLOCK_RE = /\/\*\*([\s\S]*?)\*\*\//g

/**
 * Splits SQL into static and optional segments.
 * Optional segments are text wrapped in comment markers.
 *
 * "SELECT * FROM t WHERE 1=1 \/** AND id=:id **\/"
 * → [
 *     { text: "SELECT * FROM t WHERE 1=1 ", optional: false },
 *     { text: " AND id=:id ", optional: true }
 *   ]
 */
export function extractOptionalBlocks(sql: string): RawSegment[] {
  const segments: RawSegment[] = []
  let lastIndex = 0

  for (const match of sql.matchAll(OPTIONAL_BLOCK_RE)) {
    const before = sql.slice(lastIndex, match.index)
    if (before) segments.push({ text: before, optional: false })

    segments.push({ text: match[1]!, optional: true })

    lastIndex = match.index! + match[0].length
  }

  const tail = sql.slice(lastIndex)
  if (tail) segments.push({ text: tail, optional: false })

  return segments
}
