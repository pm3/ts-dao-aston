import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { z } from 'zod'
import {
  type EntityConfig,
  oneEntity,
  maybeEntity,
  insertEntity,
  insertEntityWithId,
  updateEntity,
  upsertEntity,
  deleteById,
  NoRowsError,
} from '../src/index.js'
import { getPool } from '../src/config.js'
import { setupDatabase, teardownDatabase } from './setup.js'

const userSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string(),
  ext_id: z.string().nullable(),
  active: z.boolean(),
  address: z
    .object({ street: z.string(), city: z.string() })
    .nullable(),
  tags: z.array(z.string()).nullable(),
  created_at: z.date(),
  updated_at: z.date(),
})

type User = z.infer<typeof userSchema>

const userConfig: EntityConfig<typeof userSchema> = {
  table: 'users',
  schema: userSchema,
  pk: 'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

beforeAll(async () => await setupDatabase())
afterAll(async () => await teardownDatabase())

beforeEach(async () => {
  await getPool().query('DELETE FROM users')
})

describe('entity read operations', () => {
  it('oneEntity returns a validated row', async () => {
    const res = await getPool().query(
      "INSERT INTO users (name, email) VALUES ('Alice', 'alice@t.com') RETURNING id",
    )
    const id = res.rows[0].id

    const user = await oneEntity(userConfig, id)
    expect(user.name).toBe('Alice')
    expect(user.email).toBe('alice@t.com')
    expect(user.id).toBe(id)
    expect(user.created_at).toBeInstanceOf(Date)
  })

  it('oneEntity throws NoRowsError for missing id', async () => {
    await expect(
      oneEntity(userConfig, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(NoRowsError)
  })

  it('maybeEntity returns null for missing id', async () => {
    const result = await maybeEntity(
      userConfig,
      '00000000-0000-0000-0000-000000000000',
    )
    expect(result).toBeNull()
  })

  it('maybeEntity returns a row when found', async () => {
    const res = await getPool().query(
      "INSERT INTO users (name, email) VALUES ('Bob', 'bob@t.com') RETURNING id",
    )
    const user = await maybeEntity(userConfig, res.rows[0].id)
    expect(user).not.toBeNull()
    expect(user!.name).toBe('Bob')
  })
})

describe('insertEntity', () => {
  it('inserts a row excluding managed columns', async () => {
    await insertEntity(userConfig, {
      name: 'Carol',
      email: 'carol@t.com',
      ext_id: null,
      active: true,
      address: null,
      tags: null,
    })

    const res = await getPool().query(
      "SELECT * FROM users WHERE email='carol@t.com'",
    )
    expect(res.rows).toHaveLength(1)
    expect(res.rows[0].name).toBe('Carol')
    expect(res.rows[0].id).toBeDefined()
    expect(res.rows[0].created_at).toBeInstanceOf(Date)
  })
})

describe('insertEntityWithId', () => {
  it('inserts and returns generated id', async () => {
    const id = await insertEntityWithId(userConfig, {
      name: 'Dave',
      email: 'dave@t.com',
      ext_id: 'ext-d',
      active: false,
      address: null,
      tags: null,
    })

    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)

    const user = await oneEntity(userConfig, id)
    expect(user.name).toBe('Dave')
    expect(user.ext_id).toBe('ext-d')
  })
})

describe('updateEntity (PATCH semantics)', () => {
  let userId: string

  beforeEach(async () => {
    const res = await getPool().query(
      "INSERT INTO users (name, email, ext_id, active) VALUES ('Eve', 'eve@t.com', 'ext-e', true) RETURNING id",
    )
    userId = res.rows[0].id
  })

  it('updates only provided fields', async () => {
    await updateEntity(userConfig, { id: userId, name: 'Eve Updated' })

    const user = await oneEntity(userConfig, userId)
    expect(user.name).toBe('Eve Updated')
    expect(user.email).toBe('eve@t.com')
    expect(user.ext_id).toBe('ext-e')
  })

  it('null sets column to NULL', async () => {
    await updateEntity(userConfig, { id: userId, ext_id: null })

    const user = await oneEntity(userConfig, userId)
    expect(user.ext_id).toBeNull()
    expect(user.name).toBe('Eve')
  })

  it('undefined fields are not touched', async () => {
    await updateEntity(userConfig, {
      id: userId,
      name: 'Changed',
      email: undefined,
    } as Partial<User>)

    const user = await oneEntity(userConfig, userId)
    expect(user.name).toBe('Changed')
    expect(user.email).toBe('eve@t.com')
  })

  it('automatically sets updatedAt', async () => {
    const before = await oneEntity(userConfig, userId)
    await new Promise((r) => setTimeout(r, 50))
    await updateEntity(userConfig, { id: userId, name: 'Later' })
    const after = await oneEntity(userConfig, userId)

    expect(after.updated_at.getTime()).toBeGreaterThan(
      before.updated_at.getTime(),
    )
  })

  it('throws if pk is missing', async () => {
    await expect(
      updateEntity(userConfig, { name: 'No PK' } as Partial<User>),
    ).rejects.toThrow('primary key')
  })
})

describe('upsertEntity', () => {
  it('inserts when row does not exist', async () => {
    const id = '11111111-1111-1111-1111-111111111111'
    await upsertEntity(userConfig, {
      id,
      name: 'Frank',
      email: 'frank@t.com',
      ext_id: null,
      active: true,
      address: null,
      tags: null,
    })

    const user = await oneEntity(userConfig, id)
    expect(user.name).toBe('Frank')
  })

  it('updates when row exists', async () => {
    const id = '22222222-2222-2222-2222-222222222222'
    await upsertEntity(userConfig, {
      id,
      name: 'Grace',
      email: 'grace@t.com',
      ext_id: null,
      active: true,
      address: null,
      tags: null,
    })
    await upsertEntity(userConfig, {
      id,
      name: 'Grace Updated',
      email: 'grace2@t.com',
      ext_id: 'ext-g',
      active: false,
      address: null,
      tags: null,
    })

    const user = await oneEntity(userConfig, id)
    expect(user.name).toBe('Grace Updated')
    expect(user.email).toBe('grace2@t.com')
    expect(user.ext_id).toBe('ext-g')
  })
})

describe('deleteById', () => {
  it('deletes a row', async () => {
    const res = await getPool().query(
      "INSERT INTO users (name, email) VALUES ('Henry', 'henry@t.com') RETURNING id",
    )
    const id = res.rows[0].id

    await deleteById(userConfig, id)

    const result = await maybeEntity(userConfig, id)
    expect(result).toBeNull()
  })

  it('does nothing for non-existing id', async () => {
    await expect(
      deleteById(userConfig, '00000000-0000-0000-0000-000000000000'),
    ).resolves.toBeUndefined()
  })
})

describe('JSONB columns', () => {
  it('writes and reads jsonb object', async () => {
    const address = { street: '123 Main St', city: 'Bratislava' }
    const id = await insertEntityWithId(userConfig, {
      name: 'Ivy',
      email: 'ivy@t.com',
      ext_id: null,
      active: true,
      address,
      tags: null,
    })

    const user = await oneEntity(userConfig, id)
    expect(user.address).toEqual(address)
  })

  it('writes and reads jsonb array', async () => {
    const tags = ['admin', 'vip', 'beta']
    const id = await insertEntityWithId(userConfig, {
      name: 'Jack',
      email: 'jack@t.com',
      ext_id: null,
      active: true,
      address: null,
      tags,
    })

    const user = await oneEntity(userConfig, id)
    expect(user.tags).toEqual(tags)
  })

  it('updates jsonb column via updateEntity', async () => {
    const id = await insertEntityWithId(userConfig, {
      name: 'Kate',
      email: 'kate@t.com',
      ext_id: null,
      active: true,
      address: { street: 'Old St', city: 'Old City' },
      tags: ['user'],
    })

    await updateEntity(userConfig, {
      id,
      address: { street: 'New St', city: 'New City' },
      tags: ['admin', 'user'],
    })

    const user = await oneEntity(userConfig, id)
    expect(user.address).toEqual({ street: 'New St', city: 'New City' })
    expect(user.tags).toEqual(['admin', 'user'])
  })

  it('sets jsonb column to null', async () => {
    const id = await insertEntityWithId(userConfig, {
      name: 'Leo',
      email: 'leo@t.com',
      ext_id: null,
      active: true,
      address: { street: 'St', city: 'City' },
      tags: ['x'],
    })

    await updateEntity(userConfig, { id, address: null, tags: null })

    const user = await oneEntity(userConfig, id)
    expect(user.address).toBeNull()
    expect(user.tags).toBeNull()
  })
})
