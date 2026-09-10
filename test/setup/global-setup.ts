import { runMigrations, withPool } from '../../scripts/db.ts'

import { TEST_DATABASE_URL } from './database-url.ts'

/**
 * Runs once, before any test file.
 *
 * Drops the schema and re-applies the migrations, so every run starts from a
 * virgin database rather than from whatever the last run left behind. The
 * container behind TEST_DATABASE_URL keeps its data on tmpfs with fsync off:
 * there is nothing here worth preserving.
 */
export default async function setup(): Promise<void> {
  await waitForPostgres(TEST_DATABASE_URL)

  await withPool(TEST_DATABASE_URL, async (pool) => {
    await pool.query('DROP SCHEMA IF EXISTS public CASCADE')
    await pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE')
    await pool.query('CREATE SCHEMA public')
  })

  await runMigrations(TEST_DATABASE_URL)
}

/** The container is started by `pnpm test`; give it a moment to accept connections. */
async function waitForPostgres(connectionString: string, attempts = 30): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await withPool(connectionString, async (pool) => await pool.query('select 1'), {
        connectionTimeoutMillis: 2_000,
      })
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
  throw new Error(
    `Postgres at ${connectionString} did not answer. Is it up? ` +
      `\`docker compose up -d --wait postgres-test\`\n${String(lastError)}`,
  )
}
