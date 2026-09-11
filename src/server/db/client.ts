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
 *
 * ## Both handles are lazy, and that is what keeps `next build` green
 *
 * `next build` evaluates every route module to collect its segment config, so
 * the chain route -> service -> this file runs on a machine that has no
 * database and no DATABASE_URL. Opening the pool on evaluation failed the build
 * there ("Failed to collect configuration for /admin/footballers/[footballerId]")
 * while passing locally, where `next build` reads `.env.local` — CI was red for
 * four commits on nothing but that.
 *
 * So `db` and `pool` are stand-ins: DATABASE_URL is read on the first property
 * access, which is the first query, and a build that only imports never needs
 * it. The error below still fires on first use, which is where a missing
 * `.env.local` actually hurts.
 */

function connectionString(): string {
  const url = process.env.DATABASE_URL
  if (url === undefined || url === '') {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env.local, then run `pnpm db:up`.',
    )
  }
  return url
}

// The pool and the Drizzle handle wrapping it are created together: a handle
// pointing at a pool nobody else holds is how a test ends up closing one pool
// and querying another.
function createHandles() {
  const pool = new Pool({
    connectionString: connectionString(),
    // One replica, ~250 writes/s at target load: 20 is the sizing in
    // docs/stack-technique.md §10.
    max: 20,
  })
  return { pool, db: drizzle(pool, { schema }) }
}

type Handles = ReturnType<typeof createHandles>

// Next's dev server re-evaluates modules on every edit; without this the pools
// pile up until Postgres refuses new connections. Development only: under test,
// each file owns its pool and closes it, and a cached closed pool would poison
// the next file in the same worker.
const globalForDb = globalThis as unknown as { ppfqHandles?: Handles }
let handles: Handles | undefined

function resolveHandles(): Handles {
  handles ??= globalForDb.ppfqHandles ?? createHandles()
  if (process.env.NODE_ENV === 'development') globalForDb.ppfqHandles = handles
  return handles
}

/**
 * A stand-in that builds the real object on first touch, then forwards to it.
 *
 * Methods are bound to that object: `this` inside pg and Drizzle has to be the
 * object itself, never the proxy. Note the proxy is what `db` and `pool` are,
 * not what Drizzle is handed — `drizzle()` inspects its first argument, so it
 * gets the real pool.
 */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const instance = resolve()
      const value = Reflect.get(instance, property) as unknown
      return typeof value === 'function' ? (value.bind(instance) as unknown) : value
    },
    has: (_target, property) => Reflect.has(resolve(), property),
  })
}

export const db = lazy(() => resolveHandles().db)

export type Db = typeof db

export const pool = lazy(() => resolveHandles().pool)

/**
 * A transaction handle — what `db.transaction` hands its callback.
 *
 * Derived from `db` rather than written out, so it cannot drift from the
 * handle, and named here rather than in each service that takes one: a service
 * whose writes belong inside somebody else's transaction takes this, and there
 * is one spelling of it.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]
