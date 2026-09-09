import { loadEnvLocal } from '../../scripts/db.ts'

// CI sets TEST_DATABASE_URL directly; the default below matches docker-compose.yml.
loadEnvLocal()

/**
 * Where the integration suite points. One definition, read both by
 * `vitest.config.ts` (which hands it to the workers as DATABASE_URL) and by the
 * global setup, which runs in the main process and never sees `test.env`.
 *
 * The default matches the `postgres-test` service in `docker-compose.yml`.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://ppfq:ppfq@localhost:5433/ppfq_test'
