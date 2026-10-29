import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? process.env.NUXT_DATABASE_URL ?? 'postgres://creditos:creditos@localhost:5432/creditos',
  },
  strict: true,
  verbose: true,
})
