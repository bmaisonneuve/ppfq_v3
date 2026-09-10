/**
 * Node-side database tooling: migrations, and the plumbing the CLI, drizzle-kit
 * and the test harness all need.
 *
 * This lives outside `src/` on purpose. It is build and test tooling, not the
 * application, so it carries no `server-only` marker and the app never imports
 * it — which keeps `src/server/` to a single documented exception to the
 * "every file carries `server-only`" rule (`src/server/db/schema.ts`).
 */
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

export const MIGRATIONS_FOLDER = 'drizzle'

/**
 * Reads `.env.local` when it is there, and shrugs when it is not: in CI and in
 * deployment the variables come from the environment. Node's own loader, so a
 * production image needs nothing installed for this to work.
 */
export function loadEnvLocal(): void {
  try {
    process.loadEnvFile('.env.local')
  } catch {
    // No .env.local — the environment is expected to carry the variables.
  }
}

/** Opens a single-connection pool, hands it over, and always closes it. */
export async function withPool<T>(
  connectionString: string,
  fn: (pool: Pool) => Promise<T>,
  options: { connectionTimeoutMillis?: number } = {},
): Promise<T> {
  const pool = new Pool({ connectionString, max: 1, ...options })
  try {
    return await fn(pool)
  } finally {
    await pool.end()
  }
}

/**
 * Applies the SQL migrations in `drizzle/`.
 *
 * There is no `drizzle-kit push` anywhere in this repo: migrations are
 * generated, read by a human and committed (docs/stack-technique.md §11).
 */
export async function runMigrations(connectionString: string): Promise<void> {
  await withPool(connectionString, async (pool) => {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER })
  })
}
