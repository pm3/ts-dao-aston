import type { ZodObject, ZodRawShape } from 'zod'

export interface EntityConfig<S extends ZodObject<ZodRawShape> = ZodObject<ZodRawShape>> {
  table: string
  schema: S
  pk: string
  createdAt?: string
  updatedAt?: string
}
