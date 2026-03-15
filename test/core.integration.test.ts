import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  selectOne,
  maybeOne,
  select,
  execute,
  insertGetId,
  spread,
  NoRowsError,
  TooManyRowsError,
} from '../src/index.js'
import { getPool } from '../src/config.js'
import { setupDatabase, teardownDatabase } from './setup.js'

beforeAll(async () => await setupDatabase())
afterAll(async () => await teardownDatabase())

beforeEach(async () => {
  await getPool().query('DELETE FROM users')
})

describe('core functions', () => {
  // --- selectOne ---

  it('selectOne returns a single row', async () => {
    await getPool().query(
      "INSERT INTO users (name, email) VALUES ('Alice', 'alice@test.com')",
    )
    const user = await selectOne<{ name: string; email: string }>(
      'SELECT name, email FROM users WHERE email=:email',
      { email: 'alice@test.com' },
    )
    expect(user.name).toBe('Alice')
    expect(user.email).toBe('alice@test.com')
  })

  it('selectOne throws NoRowsError when no rows', async () => {
    await expect(
      selectOne('SELECT * FROM users WHERE email=:email', {
        email: 'nobody@test.com',
      }),
    ).rejects.toThrow(NoRowsError)
  })

  it('selectOne throws TooManyRowsError when multiple rows', async () => {
    await getPool().query(
      "INSERT INTO users (name, email) VALUES ('A', 'a@t.com'), ('B', 'b@t.com')",
    )
    await expect(
      selectOne('SELECT * FROM users WHERE active=:active', {
        active: true,
      }),
    ).rejects.toThrow(TooManyRowsError)
  })

  // --- maybeOne ---

  it('maybeOne returns null when no rows', async () => {
    const result = await maybeOne(
      'SELECT * FROM users WHERE email=:email',
      { email: 'nobody@test.com' },
    )
    expect(result).toBeNull()
  })

  it('maybeOne returns a row when found', async () => {
    await getPool().query(
      "INSERT INTO users (name, email) VALUES ('Bob', 'bob@test.com')",
    )
    const user = await maybeOne<{ name: string }>(
      'SELECT * FROM users WHERE email=:email',
      { email: 'bob@test.com' },
    )
    expect(user).not.toBeNull()
    expect(user!.name).toBe('Bob')
  })

  // --- select ---

  it('select returns empty array when no rows', async () => {
    const rows = await select('SELECT * FROM users')
    expect(rows).toEqual([])
  })

  it('select returns all matching rows', async () => {
    await getPool().query(
      "INSERT INTO users (name, email) VALUES ('A', 'a@t.com'), ('B', 'b@t.com'), ('C', 'c@t.com')",
    )
    const rows = await select<{ name: string }>('SELECT * FROM users')
    expect(rows).toHaveLength(3)
  })

  // --- execute ---

  it('execute runs INSERT/UPDATE/DELETE', async () => {
    await execute(
      'INSERT INTO users (name, email) VALUES (:name, :email)',
      { name: 'Eve', email: 'eve@test.com' },
    )
    const user = await selectOne<{ name: string }>(
      'SELECT * FROM users WHERE email=:email',
      { email: 'eve@test.com' },
    )
    expect(user.name).toBe('Eve')
  })

  // --- insertGetId ---

  it('insertGetId returns generated id', async () => {
    const id = await insertGetId(
      'INSERT INTO users (name, email) VALUES (:name, :email) RETURNING id',
      { name: 'Frank', email: 'frank@test.com' },
    )
    expect(id).toBeDefined()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})

describe('optional WHERE blocks', () => {
  beforeEach(async () => {
    await getPool().query(`
      INSERT INTO users (name, email, ext_id, active) VALUES
        ('Alice', 'alice@t.com', 'ext-1', true),
        ('Bob',   'bob@t.com',   'ext-2', false),
        ('Carol', 'carol@t.com', NULL,    true)
    `)
  })

  it('includes block when param is provided', async () => {
    const rows = await select<{ name: string }>(
      `SELECT * FROM users WHERE 1=1 /** AND active=:active **/`,
      { active: true },
    )
    expect(rows).toHaveLength(2)
  })

  it('excludes block when param is null', async () => {
    const rows = await select<{ name: string }>(
      `SELECT * FROM users WHERE 1=1 /** AND active=:active **/`,
      { active: null },
    )
    expect(rows).toHaveLength(3)
  })

  it('handles multiple optional blocks', async () => {
    const rows = await select<{ name: string }>(
      `SELECT * FROM users WHERE 1=1
       /** AND active=:active **/
       /** AND ext_id=:extId **/`,
      { active: true, extId: null },
    )
    expect(rows).toHaveLength(2)
  })
})

describe('spread (IN clause)', () => {
  beforeEach(async () => {
    await getPool().query(`
      INSERT INTO users (name, email) VALUES
        ('Alice', 'alice@t.com'),
        ('Bob',   'bob@t.com'),
        ('Carol', 'carol@t.com')
    `)
  })

  it('expands array into IN clause', async () => {
    const allUsers = await select<{ email: string }>('SELECT * FROM users')
    const emails = allUsers.slice(0, 2).map((u) => u.email)

    const rows = await select<{ name: string }>(
      'SELECT * FROM users WHERE email IN (:emails)',
      { emails: spread(emails) },
    )
    expect(rows).toHaveLength(2)
  })

  it('works with numeric values', async () => {
    await getPool().query('DELETE FROM products')
    await getPool().query(`
      INSERT INTO products (name, price) VALUES
        ('A', 10), ('B', 20), ('C', 30)
    `)
    const rows = await select<{ name: string }>(
      'SELECT * FROM products WHERE price IN (:prices)',
      { prices: spread([10, 30]) },
    )
    expect(rows).toHaveLength(2)
  })

  it('spread mixed with scalar params', async () => {
    const rows = await select<{ name: string }>(
      'SELECT * FROM users WHERE email IN (:emails) AND active=:active',
      {
        emails: spread(['alice@t.com', 'bob@t.com', 'carol@t.com']),
        active: true,
      },
    )
    expect(rows).toHaveLength(3)
  })
})
