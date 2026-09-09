import 'server-only'

import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import * as schema from './schema'

/**
 * The application's connection pool and Drizzle handle.
 *
 * Nothing outside `src/server/` may import this: the ESLint boundary rule in
 * `eslint.config.mjs` forbids `app/** -> server/db/**`, and `server-only` makes
 * the build fail if a client component ever pulls it in.
 */

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local, then run `pnpm db:up`.',
    )
  }
  return url
}

function createPool(): Pool {
  return new Pool({
    connectionString: connectionString(),
    // One replica, ~250 writes/s at target load: 20 is the sizing in
    // docs/stack-technique.md §10.
    max: 20,
  })
}

// Next's dev server re-evaluates modules on every edit; without this the pools
// pile up until Postgres refuses new connections. Development only: under test,
// each file owns its pool and closes it, and a cached closed pool would poison
// the next file in the same worker.
const globalForDb = globalThis as unknown as { ppfqPool?: Pool }
const pool = globalForDb.ppfqPool ?? createPool()
if (process.env.NODE_ENV === 'development') globalForDb.ppfqPool = pool

export const db = drizzle(pool, { schema })

export type Db = typeof db

export { pool }
