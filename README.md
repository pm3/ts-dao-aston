# ts-dao-aston

Lightweight PostgreSQL DAO library for Node.js + TypeScript. No ORM, no magic — just clean SQL with named parameters, optional WHERE blocks, and entity helpers.

## Installation

```bash
npm install ts-dao-aston
```

## Quick Start

```typescript
import { selectOne, select, execute, insertGetId } from 'ts-dao-aston'

const user = await selectOne<User>(
  'SELECT * FROM users WHERE id=:id',
  { id: '123' }
)
```

---

## Core Functions

### `selectOne<T>(sql, params?)`
Expects exactly 1 row. Throws if 0 or more than 1 row returned.

### `maybeOne<T>(sql, params?)`
Returns `T | null`. Throws if more than 1 row returned.

### `select<T>(sql, params?)`
Returns `T[]`.

### `execute(sql, params?)`
For INSERT / UPDATE / DELETE with no return value.

### `insertGetId(sql, params?)`
INSERT with `RETURNING id` — returns the generated id as `string`.

---

## Named Parameters

Use `:name` syntax instead of positional `$1`:

```typescript
const user = await selectOne<User>(
  'SELECT * FROM users WHERE email=:email AND active=:active',
  { email: 'jano@firma.sk', active: true }
)
```

---

## Optional WHERE Blocks

Wrap optional conditions in `/** ... **/` comments. The block is removed if the parameter is `null` or `undefined`.

```typescript
const users = await select<User>(`
  SELECT * FROM users WHERE 1=1
  /** AND id=:id **/
  /** AND ext_id=:extId **/
  /** AND active=:active **/
`, { id: null, extId: 'abc', active: true })

// generated SQL:
// SELECT * FROM users WHERE 1=1 AND ext_id=$1 AND active=$2
```

---

## Entity Helpers

Entity je definovaná cez `EntityConfig` — Zod schema pre mapovanie typov + metadata tabuľky.

### EntityConfig + DAO — jeden súbor

```typescript
// userDao.ts
import { z } from 'zod'
import { EntityConfig, oneEntity, insertEntity, insertEntityWithId, updateEntity, upsertEntity, deleteById, maybeOne, select } from 'ts-dao-aston'

const userSchema = z.object({
  id:         z.string().uuid(),
  name:       z.string(),
  email:      z.string().email(),
  ext_id:     z.string().nullable(),
  amount:     z.string().transform(parseFloat),   // numeric → number
  counter:    z.string().transform(parseInt),     // bigint → number
  active:     z.boolean(),
  created_at: z.date(),
  updated_at: z.date(),
})

export type User = z.infer<typeof userSchema>

const userConfig: EntityConfig<typeof userSchema> = {
  table:     'users',
  schema:    userSchema,
  pk:        'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}

export const userDao = {

  // entity helpers — standard CRUD
  loadById:    (id: string) => oneEntity(userConfig, id),
  maybeById:   (id: string) => maybeEntity(userConfig, id),
  insert:      (u: User)    => insertEntity(userConfig, u),
  insertGetId: (u: User)    => insertEntityWithId(userConfig, u),
  update:      (u: User)    => updateEntity(userConfig, u),
  save:        (u: User)    => upsertEntity(userConfig, u),
  deleteById:  (id: string) => deleteById(userConfig, id),

  // custom SQL
  loadByEmail: (email: string) =>
    maybeOne<User>('SELECT * FROM users WHERE email=:email', { email }),

  search: (params: { name?: string, active?: boolean }) =>
    select<User>(`
      SELECT * FROM users WHERE 1=1
      /** AND name ILIKE :name **/
      /** AND active=:active **/
    `, params),
}
```

Zod schema slúži ako `fromRow` — validuje a transformuje každý riadok z DB. Stĺpce `pk`, `createdAt`, `updatedAt` sú pri `insert` automaticky vynechané, hodnoty generuje DB.

### Entity Functions

```
oneEntity<T>(config, id)           → SELECT * FROM table WHERE pk=:id   — throws if not found
maybeEntity<T>(config, id)         → SELECT * FROM table WHERE pk=:id   — returns null if not found
insertEntity<T>(config, obj)       → INSERT INTO table (cols) VALUES (...)                       — vynechá pk, createdAt, updatedAt
insertEntityWithId<T>(config, obj) → INSERT INTO table (cols) VALUES (...) RETURNING id          — vráti vygenerované id
updateEntity<T>(config, obj)       → UPDATE table SET ... WHERE pk=:id                           — automaticky updatedAt = now()
upsertEntity<T>(config, obj)       → INSERT ... ON CONFLICT (pk) DO UPDATE SET ...               — automaticky updatedAt = now()
deleteById(config, id)             → DELETE FROM table WHERE pk=:id
```

---

## PostgreSQL as Document-Relational DB

Entity properties môžu byť zložité objekty — ukladajú sa ako `jsonb` stĺpce. Zod schéma slúži ako jediný zdroj pravdy — knižnica automaticky detekuje ktoré stĺpce sú JSON na základe Zod typu, bez akejkoľvek extra konfigurácie.

### Definícia

```typescript
const userSchema = z.object({
  id:      z.string().uuid(),
  name:    z.string(),
  active:  z.boolean(),

  // jsonb stĺpce — detekované automaticky zo Zod typu
  address: z.object({
    street: z.string(),
    city:   z.string(),
    zip:    z.string(),
  }),
  tags:    z.array(z.string()),
  meta:    z.record(z.string(), z.unknown()),
})
```

### Ako to funguje

Pri štarte knižnica introspektuje Zod schémy a identifikuje JSON stĺpce podľa typu:

| Zod typ | JSON serializácia |
|---|---|
| `z.object()` | áno |
| `z.array()` | áno |
| `z.record()` | áno |
| `z.string()`, `z.number()`, `z.boolean()`, `z.date()` | nie |

Pri **čítaní** — pg deserializuje `jsonb` automaticky, Zod schéma validuje štruktúru.

Pri **zápise** — knižnica volá `JSON.stringify()` na detekovaných stĺpcoch pred odoslaním do DB.

### EntityConfig zostáva bez zmeny

```typescript
export const userConfig: EntityConfig<typeof userSchema> = {
  table:     'users',
  schema:    userSchema,   // jsonb stĺpce sa odvodia automaticky
  pk:        'id',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
}
```

---

## Transactions

Every core function and entity helper accepts an optional `tx` context. If provided, the query runs within that transaction.

```typescript
import { withTransaction } from 'ts-dao-aston'

await withTransaction(async (tx) => {
  await userDao.insert(user, tx)
  await auditDao.log({ action: 'INSERT', entityId: user.id }, tx)
})
```

---

## Configuration

```typescript
import { configure } from 'ts-dao-aston'

configure({
  connectionString: process.env.DATABASE_URL,
  pool: { max: 10, idleTimeoutMillis: 30000 }
})
```

Or pass your own `pg.Pool` instance:

```typescript
import { Pool } from 'pg'
import { configure } from 'ts-dao-aston'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
configure({ pool })
```

---

## License

MIT
