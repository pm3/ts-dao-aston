import { describe, it, expect } from 'vitest'
import { z, ZodError } from 'zod'
import type { EntityConfig } from './entity-config.js'
import { insertEntity, updateEntity } from './entity-ops.js'

const schema = z.object({
  id: z.string(),
  name: z.string(),
  active: z.boolean(),
})

type Entity = z.infer<typeof schema>

const config: EntityConfig<typeof schema> = {
  table: 'test',
  schema,
  pk: 'id',
}

describe('entity-ops Zod validation on write', () => {
  it('insertEntity validates via schema.partial() and throws ZodError for invalid types', async () => {
    await expect(
      insertEntity(config, { name: 123 } as unknown as Partial<Entity>),
    ).rejects.toThrow(ZodError)
  })

  it('updateEntity validates via schema.partial() and throws ZodError for invalid types', async () => {
    await expect(
      updateEntity(config, {
        id: 'x',
        name: 123,
      } as unknown as Partial<Entity>),
    ).rejects.toThrow(ZodError)
  })

  it('updateEntity throws for missing pk before Zod (pk check is after parse)', async () => {
    await expect(
      updateEntity(config, { name: 'valid' } as Partial<Entity>),
    ).rejects.toThrow('primary key')
  })
})
