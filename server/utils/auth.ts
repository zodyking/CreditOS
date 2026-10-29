import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '../db'
import type { User } from '../db/schema'

export interface SessionUser {
  id: string
  email: string
  displayName: string
  role: string
}

declare module '#auth-utils' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- module augmentation must be an interface
  interface User extends SessionUser {}
}

/** Resolve the authenticated owner for this request, or throw 401. */
export async function requireUser(event: H3Event): Promise<User> {
  const session = await requireUserSession(event)
  const db = getDb()
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.user.id) })
  if (!user) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, statusMessage: 'Session user no longer exists' })
  }
  return user
}

export function toSessionUser(u: User): SessionUser {
  return { id: u.id, email: u.email, displayName: u.displayName, role: u.role }
}

export function assertOwns<T extends { userId: string }>(user: User, row: T | undefined | null, what = 'resource'): T {
  if (!row) throw createError({ statusCode: 404, statusMessage: `${what} not found` })
  if (row.userId !== user.id) throw createError({ statusCode: 404, statusMessage: `${what} not found` })
  return row
}

export async function hasAnyUser(): Promise<boolean> {
  const db = getDb()
  const rows = await db.select({ id: schema.users.id }).from(schema.users).limit(1)
  return rows.length > 0
}
