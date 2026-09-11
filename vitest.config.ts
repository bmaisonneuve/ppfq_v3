import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

import { TEST_DATABASE_URL } from './test/setup/database-url.ts'

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

const alias = {
  '@': resolvePath('./src'),
  '@test': resolvePath('./test'),
  // `server-only` throws on import outside a React Server Component graph. Next
  // resolves it to an empty module through the `react-server` condition; the
  // test runner does the same, explicitly.
  'server-only': resolvePath('./node_modules/server-only/empty.js'),
}

export default defineConfig({
  test: {
    projects: [
      {
        // The pure seam: no I/O, nothing to start, milliseconds. Reserved for
        // wide case matrices — the reveal ladder, the Europe/Paris calendar,
        // the order of a career, the normalisation of a search term, the
        // reading of a Wikidata statement.
        //
        // `test/shared/` sits here rather than in a project of its own: the
        // isomorphic layer is pure too, and it is the same seam. So is the
        // reading half of `server/ingest/`: it takes statements and gives back
        // passages, and the endpoint is handed to it.
        resolve: { alias },
        test: {
          name: 'domain',
          include: ['test/domain/**/*.test.ts', 'test/shared/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        // Not tests of the product: tests of the guards that keep the product
        // honest. They read the ESLint config and the source tree, nothing else.
        resolve: { alias },
        test: {
          name: 'architecture',
          include: ['test/architecture/**/*.test.ts'],
          environment: 'node',
          // `layering.test.ts` runs the real ESLint over a probe file, and the
          // config is type-aware: the first case pays for TypeScript's project
          // service booting a program over the whole repo. That is seconds, it
          // grows with the repo, and the default 5 s budget turned a rule check
          // into a machine-load check — green alone, red right after a
          // `pnpm lint`. The test measures a rule; the clock is not the point.
          testTimeout: 60_000,
        },
      },
      {
        // The one suite that leaves the machine: the real Wikidata endpoint and
        // the real database. Excluded from `pnpm test` — a suite that fails
        // when a third-party endpoint is slow is a suite people stop believing
        // — and run on demand with `pnpm test:live`.
        //
        // It shares the test database with the `postgres` project rather than
        // owning one, which is safe precisely because the two never run
        // together: `pnpm test` filters this project out, `pnpm test:live` runs
        // nothing else.
        resolve: { alias },
        test: {
          name: 'live',
          include: ['test/live/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/setup/global-setup.ts'],
          setupFiles: ['test/setup/integration.ts'],
          fileParallelism: false,
          env: { DATABASE_URL: TEST_DATABASE_URL },
          // Two SPARQL queries per footballer, against a free service.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
      {
        // Everything that needs a real Postgres. One project, because the global
        // setup drops and re-migrates the schema and must run exactly once.
        //
        // `test/services/` is the main seam — services called the way the
        // application calls them, no doubles, no query counting. The one double
        // anywhere is the SPARQL runner of the career import: the endpoint is
        // replayed from recordings, and `test/live/` is what calls it for real.
        // `test/database/` holds schema-level checks that call no service.
        resolve: { alias },
        test: {
          name: 'postgres',
          include: ['test/services/**/*.test.ts', 'test/database/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['test/setup/global-setup.ts'],
          setupFiles: ['test/setup/integration.ts'],
          // One database shared by the suite, truncated between tests. Swap this
          // for a database per worker the day the suite gets slow.
          fileParallelism: false,
          env: { DATABASE_URL: TEST_DATABASE_URL },
          testTimeout: 20_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
})
