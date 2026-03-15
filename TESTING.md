# ts-dao-aston — Testing

## Two-tier testing strategy

The library has two distinct test tiers, each covering a different layer:

| Tier | What it tests | Database required | Runner |
|---|---|---|---|
| **Unit tests** | SQL template engine, Zod introspection | no | `npm test` |
| **Integration tests** | Core queries, entity ops, transactions against real PostgreSQL | yes (Docker) | `npm run test:integration` |

Unit tests verify pure functions with no I/O. Integration tests verify the full stack — from `selectOne("SELECT ...")` down to `pool.query()` against a real PostgreSQL instance.

---

## Running tests

```bash
# Unit tests only (no DB needed)
npm test

# Integration tests (requires running PostgreSQL)
docker compose up -d --wait
npm run test:integration

# Stop PostgreSQL
docker compose down
```

---

## Infrastructure

### Docker Compose

`docker-compose.yml` runs PostgreSQL 16 on port `54320` (non-standard to avoid conflicts with local instances). Data is stored on `tmpfs` — no persistence, fast resets.

```
postgres:16-alpine
  port:     54320
  database: dao_test
  user:     dao
  password: dao
```

Connection string used by tests: `postgresql://dao:dao@localhost:54320/dao_test`

### Test setup (`test/setup.ts`)

Shared setup/teardown for all integration test files:

- `setupDatabase()` — called in `beforeAll` of each test file. Idempotent (runs once even if called multiple times). Creates `users` and `products` tables.
- `teardownDatabase()` — called in `afterAll`. Drops tables and closes the connection pool.

Each test file calls `DELETE FROM users` in `beforeEach` to ensure a clean state per test. No transaction wrapping — tests see real committed data.

### Vitest configuration

Integration tests run with `fileParallelism: false` (via `vitest.integration.config.ts`) because they share a single database. Test files run sequentially; individual tests within a file also run sequentially.

Unit tests run with default Vitest settings (parallel).

---

## Unit tests (29 tests)

Located in `src/` alongside the source code. No database, no I/O — pure input/output verification.

### `src/sql/named-params.test.ts` (6 tests)

Tests `extractParams()` — splitting SQL text into interleaved `(string | ParamRef)[]`.

| Test | What it verifies |
|---|---|
| extracts single param | `WHERE id=:id` → `["WHERE id=", ParamRef("id")]` |
| extracts multiple params | two params produce correct interleaved array |
| handles SQL with no params | plain SQL returns single string part |
| handles underscores in param names | `:ext_id` is recognized |
| handles param at start of string | `:id` with no leading text |
| handles repeated param names | same `:x` appears twice in paramNames |

### `src/sql/optional-blocks.test.ts` (4 tests)

Tests `extractOptionalBlocks()` — splitting SQL by `/** ... **/` markers.

| Test | What it verifies |
|---|---|
| splits static and optional segments | one optional block produces two segments |
| handles multiple optional blocks | two blocks with static text between them |
| handles SQL with no optional blocks | returns single static segment |
| handles multiline optional blocks | block spanning multiple lines |

### `src/sql/template.test.ts` (12 tests)

Tests the full template engine: `parse()`, `resolve()`, `prepareQuery()`, and cache behavior.

**parse** (3 tests):

| Test | What it verifies |
|---|---|
| parses simple SQL into segments | single segment with correct referencedParams |
| parses optional blocks | static + optional segments |
| returns cached template on second call | same object reference on cache hit |

**resolve** (8 tests):

| Test | What it verifies |
|---|---|
| replaces named params with positional | `:a` → `$1`, `:b` → `$2` |
| removes optional block when param is null | null param → segment skipped |
| removes optional block when param is undefined | undefined param → segment skipped |
| includes optional block when param has value | non-null param → segment included |
| handles mix of included and excluded blocks | one null + one value → correct filtering |
| expands spread to multiple positional params | `spread([10,20,30])` → `$1,$2,$3` |
| mixes spread with scalar params | spread + scalar → correct positional indices |
| handles params as undefined | no params object → empty values |

**prepareQuery** (1 test):

| Test | What it verifies |
|---|---|
| combines parse + resolve in one call | end-to-end: SQL string + params → resolved SQL + values |

### `src/entity/jsonb.test.ts` (7 tests)

Tests `detectJsonbColumns()` — Zod schema introspection for JSONB detection.

| Test | What it verifies |
|---|---|
| detects z.object() as JSONB | object field → in JSONB set |
| detects z.array() as JSONB | array field → in JSONB set |
| detects z.record() as JSONB | record field → in JSONB set |
| does not flag primitives | string, number, boolean, date → not JSONB |
| unwraps nullable/optional wrappers | `.nullable()` / `.optional()` → still detected |
| unwraps transform (ZodEffects) | `.transform()` → still detected |
| handles mixed schema | complex schema → only object/array/record fields flagged |

---

## Integration tests (38 tests)

Located in `test/`. Require a running PostgreSQL instance.

### `test/core.integration.test.ts` (15 tests)

Tests core query functions against real database.

**core functions** (9 tests):

| Test | What it verifies |
|---|---|
| selectOne returns a single row | named params, row mapping |
| selectOne throws NoRowsError when no rows | error on empty result |
| selectOne throws TooManyRowsError when multiple rows | error on >1 row |
| maybeOne returns null when no rows | null instead of throw |
| maybeOne returns a row when found | row returned correctly |
| select returns empty array when no rows | empty `T[]` |
| select returns all matching rows | multiple rows |
| execute runs INSERT/UPDATE/DELETE | write + verify via select |
| insertGetId returns generated id | RETURNING id, string type |

**optional WHERE blocks** (3 tests):

| Test | What it verifies |
|---|---|
| includes block when param is provided | `active=true` → filtered rows |
| excludes block when param is null | `active=null` → all rows |
| handles multiple optional blocks | mix of null and value params |

**spread (IN clause)** (3 tests):

| Test | What it verifies |
|---|---|
| expands array into IN clause | `spread(emails)` → correct filtering |
| works with numeric values | numeric spread on products table |
| spread mixed with scalar params | spread + scalar in same query |

### `test/entity.integration.test.ts` (19 tests)

Tests entity CRUD operations with Zod validation, JSONB, and PATCH semantics.

**entity read operations** (4 tests):

| Test | What it verifies |
|---|---|
| oneEntity returns a validated row | Zod parse, correct types (Date, string, etc.) |
| oneEntity throws NoRowsError for missing id | error on non-existing UUID |
| maybeEntity returns null for missing id | null instead of throw |
| maybeEntity returns a row when found | row returned correctly |

**insertEntity** (1 test):

| Test | What it verifies |
|---|---|
| inserts a row excluding managed columns | pk, created_at, updated_at auto-generated by DB |

**insertEntityWithId** (1 test):

| Test | What it verifies |
|---|---|
| inserts and returns generated id | returned id can be used to load the entity |

**updateEntity — PATCH semantics** (5 tests):

| Test | What it verifies |
|---|---|
| updates only provided fields | unmentioned fields unchanged |
| null sets column to NULL | explicit `ext_id: null` → DB NULL |
| undefined fields are not touched | `email: undefined` → email unchanged |
| automatically sets updatedAt | `updated_at` timestamp advances |
| throws if pk is missing | error when no primary key in input |

**upsertEntity** (2 tests):

| Test | What it verifies |
|---|---|
| inserts when row does not exist | new UUID → INSERT |
| updates when row exists | same UUID again → ON CONFLICT UPDATE |

**deleteById** (2 tests):

| Test | What it verifies |
|---|---|
| deletes a row | maybeEntity returns null after delete |
| does nothing for non-existing id | no error on missing UUID |

**JSONB columns** (4 tests):

| Test | What it verifies |
|---|---|
| writes and reads jsonb object | `{ street, city }` roundtrip |
| writes and reads jsonb array | `['admin', 'vip']` roundtrip |
| updates jsonb column via updateEntity | PATCH update of jsonb field |
| sets jsonb column to null | jsonb → NULL without stringify |

### `test/transaction.integration.test.ts` (4 tests)

Tests `withTransaction` — BEGIN/COMMIT/ROLLBACK lifecycle.

| Test | What it verifies |
|---|---|
| commits on success | two inserts visible after transaction |
| rolls back on error | insert reverted when callback throws |
| returns value from callback | transaction returns computed value |
| concurrent transactions both commit | two parallel transactions, both committed, correct final count |

---

## Test DB schema

Two tables used by integration tests:

```sql
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  ext_id      TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  address     JSONB,
  tags        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`users` is the primary test entity — covers all features (JSONB, nullable columns, timestamps). `products` is used only for `spread` tests with numeric values.
