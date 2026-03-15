import { type ZodTypeAny, ZodObject, ZodArray, ZodRecord, ZodEffects, ZodOptional, ZodNullable, ZodDefault } from 'zod'

/**
 * Unwraps Zod wrappers (optional, nullable, default, transform/refine)
 * to get the inner "real" type for JSONB detection.
 */
function unwrap(schema: ZodTypeAny): ZodTypeAny {
  if (schema instanceof ZodOptional) return unwrap(schema.unwrap())
  if (schema instanceof ZodNullable) return unwrap(schema.unwrap())
  if (schema instanceof ZodDefault) return unwrap(schema.removeDefault())
  if (schema instanceof ZodEffects) return unwrap(schema.innerType())
  return schema
}

function isJsonbType(schema: ZodTypeAny): boolean {
  const inner = unwrap(schema)
  return (
    inner instanceof ZodObject ||
    inner instanceof ZodArray ||
    inner instanceof ZodRecord
  )
}

/**
 * Returns set of field names that should be serialized as JSONB.
 * Inspects ZodObject shape — ZodObject, ZodArray, ZodRecord → JSONB.
 */
export function detectJsonbColumns(schema: ZodObject<any>): Set<string> {
  const jsonbCols = new Set<string>()
  const shape = schema.shape as Record<string, ZodTypeAny>

  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (isJsonbType(fieldSchema)) {
      jsonbCols.add(key)
    }
  }

  return jsonbCols
}
