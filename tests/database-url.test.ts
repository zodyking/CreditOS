import { describe, expect, it } from 'vitest'
import { assertPostgresConnectionString, describeConnection, redactConnectionError } from '../server/utils/database-url'

describe('postgres connection strings', () => {
  it('accepts a postgresql URL and describes it without the password', () => {
    const url = assertPostgresConnectionString('  postgresql://creditos:s3cret@db.internal:5432/creditos?sslmode=require  ')
    expect(url.startsWith('postgresql://')).toBe(true)
    expect(describeConnection(url)).toEqual({ user: 'creditos', host: 'db.internal:5432', database: 'creditos' })
  })

  it('rejects anything that is not a postgres URL with a database name', () => {
    expect(() => assertPostgresConnectionString('mysql://root:pw@localhost/x')).toThrow(/postgresql:\/\//)
    expect(() => assertPostgresConnectionString('postgresql://localhost')).toThrow(/database name/)
    expect(() => assertPostgresConnectionString('not a url')).toThrow(/not a PostgreSQL/)
  })

  it('strips the password if a driver repeats it in an error', () => {
    const url = 'postgresql://creditos:s3cret@localhost:5432/creditos'
    expect(redactConnectionError(new Error(`password authentication failed for ${url}`), url)).not.toContain('s3cret')
  })
})
