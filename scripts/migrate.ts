/**
 * Applies the migrations to DATABASE_URL, then exits. Run with `pnpm db:migrate`.
 */
import { loadEnvLocal, runMigrations } from './db.ts'

loadEnvLocal()

const url = process.env.DATABASE_URL
if (url === undefined || url === '') {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local, then run `pnpm db:up`.',
  )
}

await runMigrations(url)
console.log('Migrations applied.')
