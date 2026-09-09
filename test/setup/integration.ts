import { afterAll, beforeEach } from 'vitest'

import { pool, resetDatabase } from './db'

/**
 * Runs for every file in the `services` project.
 *
 * Each test starts from an empty database and seeds what it needs. The suite
 * shares one database and runs its files sequentially (`fileParallelism: false`
 * in `vitest.config.ts`); the day that gets slow, give each worker its own
 * database — the change is confined to this file and `global-setup.ts`.
 */
beforeEach(async () => {
  await resetDatabase()
})

afterAll(async () => {
  await pool.end()
})
