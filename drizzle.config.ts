import { defineConfig } from 'drizzle-kit'

import { loadEnvLocal } from './scripts/db.ts'

loadEnvLocal()

/**
 * `pnpm db:generate` writes SQL into `drizzle/`. That SQL is read by a human and
 * committed. There is no `push` script on purpose: a mis-scoped `drizzle-kit
 * push` on `player_clubs` repairs badly (docs/stack-technique.md §11).
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://ppfq:ppfq@localhost:5432/ppfq',
  },
  strict: true,
  verbose: true,
})
