export class DaoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DaoError'
  }
}

export class NoRowsError extends DaoError {
  constructor(sql: string) {
    super(`Expected exactly one row, got 0. SQL: ${sql.slice(0, 200)}`)
    this.name = 'NoRowsError'
  }
}

export class TooManyRowsError extends DaoError {
  constructor(count: number, sql: string) {
    super(
      `Expected at most one row, got ${count}. SQL: ${sql.slice(0, 200)}`,
    )
    this.name = 'TooManyRowsError'
  }
}
