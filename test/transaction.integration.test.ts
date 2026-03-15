import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  select,
  execute,
  selectOne,
  withTransaction,
} from '../src/index.js'
import { getPool } from '../src/config.js'
import { setupDatabase, teardownDatabase } from './setup.js'

beforeAll(async () => await setupDatabase())
afterAll(async () => await teardownDatabase())

beforeEach(async () => {
  await getPool().query('DELETE FROM users')
})

describe('withTransaction', () => {
  it('commits on success', async () => {
    await withTransaction(async (tx) => {
      await execute(
        'INSERT INTO users (name, email) VALUES (:name, :email)',
        { name: 'Alice', email: 'alice@t.com' },
        tx,
      )
      await execute(
        'INSERT INTO users (name, email) VALUES (:name, :email)',
        { name: 'Bob', email: 'bob@t.com' },
        tx,
      )
    })

    const rows = await select('SELECT * FROM users')
    expect(rows).toHaveLength(2)
  })

  it('rolls back on error', async () => {
    await expect(
      withTransaction(async (tx) => {
        await execute(
          'INSERT INTO users (name, email) VALUES (:name, :email)',
          { name: 'Carol', email: 'carol@t.com' },
          tx,
        )
        throw new Error('Something went wrong')
      }),
    ).rejects.toThrow('Something went wrong')

    const rows = await select('SELECT * FROM users')
    expect(rows).toHaveLength(0)
  })

  it('returns value from callback', async () => {
    const result = await withTransaction(async (tx) => {
      await execute(
        'INSERT INTO users (name, email) VALUES (:name, :email)',
        { name: 'Dave', email: 'dave@t.com' },
        tx,
      )
      const user = await selectOne<{ name: string }>(
        'SELECT * FROM users WHERE email=:email',
        { email: 'dave@t.com' },
        tx,
      )
      return user.name
    })

    expect(result).toBe('Dave')
  })

  it('concurrent transactions both commit', async () => {
    const tx1 = withTransaction(async (tx) => {
      await execute(
        'INSERT INTO users (name, email) VALUES (:name, :email)',
        { name: 'TX1', email: 'tx1@t.com' },
        tx,
      )
    })

    const tx2 = withTransaction(async (tx) => {
      await execute(
        'INSERT INTO users (name, email) VALUES (:name, :email)',
        { name: 'TX2', email: 'tx2@t.com' },
        tx,
      )
    })

    await Promise.all([tx1, tx2])

    const allRows = await select('SELECT * FROM users')
    expect(allRows).toHaveLength(2)
  })
})
