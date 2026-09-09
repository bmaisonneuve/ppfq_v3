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
        // the order of a career.
        resolve: { alias },
        test: {
          name: 'domain',
          include: ['test/domain/**/*.test.ts'],
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
        },
      },
      {
        // Everything that needs a real Postgres. One project, because the global
        // setup drops and re-migrates the schema and must run exactly once.
        //
        // `test/services/` is the main seam — services called the way the
        // application calls them, no doubles, no query counting.
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
