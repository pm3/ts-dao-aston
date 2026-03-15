# ts-dao-aston — Architecture

Lightweight PostgreSQL DAO library for Node.js + TypeScript. No ORM, no magic — clean SQL with named parameters, optional WHERE blocks, and entity helpers.

---

## Layers

```
User code
  │
  ├─ Core layer       selectOne, maybeOne, select, execute, insertGetId
  ├─ Entity layer     oneEntity, insertEntity, updateEntity, upsertEntity, ...
  │
  ▼
SQL Template Engine   parse (once, cached) → resolve (every call)
  │
  ▼
pg driver             pool.query(sql, values)
```

---

## SQL Template Engine

### Principle: parse once, resolve many times

Each SQL string is parsed **exactly once**. The result is a structured `ParsedTemplate` object stored in cache. On every query call, this object is only **resolved** with actual parameter values — no regexes, no string operations, just a linear walk through pre-parsed parts.

### Cache

```
Map<string, ParsedTemplate>
```

- **Key:** the original SQL string (identity by string value)
- **Value:** `ParsedTemplate` — fully parsed template
- First call: parse → store in cache → resolve
- Subsequent calls: cache hit → skip parse → resolve directly
- In practice a DAO library has a finite set of unique SQL strings, an unbounded `Map` is sufficient

### ParsedTemplate — structure

The entire template is split into an ordered array of **segments**. Each segment is further split into an interleaved array of **text literals** and **parameter references**. No raw SQL string is ever parsed again.

```
ParsedTemplate {
  segments: Segment[]
}

Segment {
  optional: boolean              // is it inside a /** **/ block?
  referencedParams: string[]     // param names in this segment (for quick null-check)
  parts: (string | ParamRef)[]   // interleaved: text ↔ param reference
}

ParamRef {
  name: string                   // parameter name (e.g. "id", "email")
}
```

#### Parse example

Input SQL:
```sql
SELECT * FROM users WHERE 1=1
/** AND id IN (:ids) **/
/** AND active=:active **/
AND email=:email
```

Resulting `ParsedTemplate`:
```
segments: [
  {
    optional: false,
    referencedParams: [],
    parts: ["SELECT * FROM users WHERE 1=1\n  "]
  },
  {
    optional: true,
    referencedParams: ["ids"],
    parts: [" AND id IN (", ParamRef("ids"), ") "]
  },
  {
    optional: true,
    referencedParams: ["active"],
    parts: [" AND active=", ParamRef("active"), " "]
  },
  {
    optional: false,
    referencedParams: ["email"],
    parts: ["\nAND email=", ParamRef("email")]
  }
]
```

### Parse phase — steps

1. **Split SQL by optional blocks** — regex `/** ... **/` splits the string into alternating static and optional parts.
2. **For each segment — split text by `:paramName`** — regex `:([a-zA-Z_][a-zA-Z0-9_]*)` splits text into an interleaved array `(string | ParamRef)[]`. Simultaneously collects `referencedParams`.
3. **Store the resulting `ParsedTemplate` in cache.**

Both regexes run **only once** per SQL string. Never again.

### Resolve phase — linear walk

Input: `ParsedTemplate` + `params: Record<string, unknown>`
Output: `{ sql: string, values: unknown[] }`

Algorithm:

```
positional_index = 1
sql_builder = []
values = []

for each segment:
  if segment.optional:
    if ANY param in segment.referencedParams is null/undefined:
      → skip entire segment

  for each part in segment.parts:
    if part is string:
      → append to sql_builder

    if part is ParamRef:
      value = params[part.name]

      if isSpread(value):
        → generate "$N,$N+1,...,$N+len-1"
        → push all items into values
        → positional_index += array.length

      else (scalar):
        → append "$N" to sql_builder
        → push value into values
        → positional_index += 1

return { sql: sql_builder.join(''), values }
```

Complexity: O(n) — single linear walk through parts, no lookups, no regexes.

### Overall flow

```
query("SELECT ...", params)
  │
  ├─ cache.has(sql)?
  │    ├─ YES → template = cache.get(sql)
  │    └─ NO  → template = parse(sql); cache.set(sql, template)
  │
  ├─ { sql, values } = resolve(template, params)
  │
  └─ pool.query(sql, values)
```

---

## Spread — explicit wrapper for array expansion

Non-primitive values (objects, arrays) are materialized as JSONB in the entity layer. Automatic array expansion would be ambiguous — `[1,2,3]` could be either an IN-clause expansion or a JSONB value. Therefore array expansion requires an **explicit wrapper**.

### Wrapper type

```typescript
Spread {
  __brand: Symbol('Spread')    // unique symbol — cannot be confused with a regular object
  values: unknown[]             // values to expand
}

spread(values: unknown[]): Spread     // factory function
isSpread(value: unknown): boolean     // runtime check via Symbol
```

### Usage

```typescript
// IN-clause expansion — explicit
const users = await select<User>(
  'SELECT * FROM users WHERE id IN (:ids) AND status=:status',
  { ids: spread([10, 20, 30]), status: 'active' }
)
// → SELECT * FROM users WHERE id IN ($1,$2,$3) AND status=$4
// → values: [10, 20, 30, 'active']

// JSONB column — plain array, no expansion
await execute(
  'UPDATE users SET tags=:tags WHERE id=:id',
  { tags: ['admin', 'vip'], id: '123' }
)
// → UPDATE users SET tags=$1 WHERE id=$2
// → values: [['admin', 'vip'], '123']
```

### Rules

| Value | Detection | Behavior |
|---|---|---|
| `spread([...])` | `isSpread()` — check via Symbol brand | Expansion: `$N,$N+1,...` |
| anything else | — | Single `$N`, value as-is |

### Edge cases

| Situation | Behavior |
|---|---|
| `spread([])` — empty array | Error: `spread() requires a non-empty array` |
| `spread([null, 1, 2])` — null in array | Allowed — `NULL` is a valid value in IN clause |
| `spread` in optional block, param is `null` | Block is removed |
| `spread` in optional block, param is `spread([1,2])` | Block is included, expansion proceeds |

---

## Entity layer

### EntityConfig

```typescript
interface EntityConfig<S extends ZodObject> {
  table: string          // table name
  schema: S              // Zod schema — validation + transformation of rows from DB
  pk: string             // primary key column name
  createdAt?: string     // automatically excluded on insert/update
  updatedAt?: string     // automatically set to now() on update/upsert
}
```

### Entity operations

| Operation | SQL | Input type | Return |
|---|---|---|---|
| `oneEntity(config, id)` | `SELECT * WHERE pk=:id` | `string` | `T` (throws if 0) |
| `maybeEntity(config, id)` | `SELECT * WHERE pk=:id` | `string` | `T \| null` |
| `insertEntity(config, data)` | `INSERT INTO (cols) VALUES (...)` | `Omit<T, managed>` | `void` |
| `insertEntityWithId(config, data)` | `INSERT ... RETURNING pk` | `Omit<T, managed>` | `string` |
| `updateEntity(config, data)` | `UPDATE SET ... WHERE pk=:pk` | `Partial<T>` | `void` |
| `upsertEntity(config, data)` | `INSERT ... ON CONFLICT DO UPDATE` | pk required + all fields | `void` |
| `deleteById(config, id)` | `DELETE WHERE pk=:id` | `string` | `void` |

Managed columns = `pk`, `createdAt`, `updatedAt` — automatically excluded/set.

### updateEntity — undefined / null / value semantics

`updateEntity` uses **PATCH semantics**. Input is `Partial<T>`.

| Property state | Example | Meaning | SQL behavior |
|---|---|---|---|
| **value** | `name: 'John'` | Set column to this value | `SET name=$1` → `'John'` |
| **null** | `ext_id: null` | Explicitly set column to NULL | `SET ext_id=$1` → `NULL` |
| **undefined** (or key missing) | `email: undefined` | Leave column as-is | Column not in SET clause |

Runtime logic:
- `pk` — must be present, otherwise throw
- `createdAt`, `updatedAt` — skipped even if present in the object
- `updatedAt` is automatically set to `now()`

### JSONB — automatic detection via Zod introspection

The library introspects the Zod schema and identifies JSONB columns by type:

| Zod type | JSONB | Unwrapped through |
|---|---|---|
| `z.object()` | yes | `nullable`, `optional`, `default`, `transform` |
| `z.array()` | yes | `nullable`, `optional`, `default`, `transform` |
| `z.record()` | yes | `nullable`, `optional`, `default`, `transform` |
| `z.string()`, `z.number()`, `z.boolean()`, `z.date()` | no | — |

- **Read** — pg deserializes `jsonb` automatically, Zod schema validates the structure.
- **Write** — the library calls `JSON.stringify()` on detected columns before sending to DB.
- **Null** — if value is `null`, `JSON.stringify` is not called. `null` goes to DB directly.
- Detection result is cached via `WeakMap<ZodObject, Set<string>>`.

---

## Source code structure

```
src/
├── index.ts                  # public barrel export
├── types.ts                  # Spread wrapper (Symbol brand), Tx, SqlParams
├── errors.ts                 # DaoError, NoRowsError, TooManyRowsError
├── config.ts                 # configure(), getPool(), destroyPool()
├── sql/
│   ├── named-params.ts       # extractParams() — :name → ParamRef extraction
│   ├── optional-blocks.ts    # extractOptionalBlocks() — /** ... **/ segmentation
│   └── template.ts           # parse(), resolve(), prepareQuery(), cache
├── core/
│   ├── query.ts              # selectOne, maybeOne, select, execute, insertGetId
│   └── transaction.ts        # withTransaction
└── entity/
    ├── entity-config.ts      # EntityConfig<S> interface
    ├── jsonb.ts              # detectJsonbColumns() — Zod introspection
    └── entity-ops.ts         # oneEntity, maybeEntity, insertEntity, updateEntity, upsertEntity, deleteById
```

### Dependency graph

```
named-params ──┐
               ├──→ template (cache) ──→ query ──→ entity-ops
optional-blocks┘         ↑                 ↑          ↑
                         │                 │          │
types (Spread) ──────────┘            config      jsonb + entity-config
                                       │
transaction ───────────────────────────┘
```

---

## Configuration

```typescript
import { configure } from 'ts-dao-aston'

// via connection string
configure({ connectionString: process.env.DATABASE_URL })

// via pool options
configure({ connectionString: process.env.DATABASE_URL, pool: { max: 10 } })

// via custom pg.Pool
import { Pool } from 'pg'
configure({ pool: new Pool({ connectionString: process.env.DATABASE_URL }) })
```

---

## Transactions

Every core function and entity helper accepts an optional `tx` parameter. If provided, the query runs within that transaction.

```typescript
import { withTransaction } from 'ts-dao-aston'

await withTransaction(async (tx) => {
  await userDao.insert(user, tx)
  await auditDao.log({ action: 'INSERT', entityId: user.id }, tx)
})
// COMMIT on success, ROLLBACK on error
```
