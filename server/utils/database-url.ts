export interface DatabaseDescription {
  user: string
  host: string
  database: string
}

/** Accept only a Postgres URL, and return it trimmed. The password stays in the string. */
export function assertPostgresConnectionString(raw: string): string {
  const value = raw.trim()
  if (!value) throw new Error('Paste a PostgreSQL connection string.')
  if (value.length > 2000) throw new Error('That connection string is too long.')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('That is not a PostgreSQL connection string. It should start with postgresql://')
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('Use a postgresql:// connection string.')
  }
  if (!url.hostname) throw new Error('The connection string needs a host.')
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!database) throw new Error('The connection string needs a database name, for example postgresql://user:password@host:5432/creditos')
  return value
}

/** Host, database and user for display. The password is never included. */
export function describeConnection(connectionString: string): DatabaseDescription {
  const url = new URL(connectionString)
  return {
    user: decodeURIComponent(url.username || ''),
    host: url.port ? `${url.hostname}:${url.port}` : url.hostname,
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  }
}

/** Remove a password if a driver echoed the URL back in an error. */
export function redactConnectionError(error: unknown, connectionString: string): string {
  let message = error instanceof Error ? error.message : String(error)
  try {
    const password = decodeURIComponent(new URL(connectionString).password)
    if (password) message = message.split(password).join('••••')
  } catch {
    /* the string was already rejected */
  }
  return message.slice(0, 300)
}
