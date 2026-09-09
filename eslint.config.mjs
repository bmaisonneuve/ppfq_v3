import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import tseslint from 'typescript-eslint'

/**
 * The layering rule, enforced.
 *
 * `app/` (routing and rendering) and `jobs/` (worker tasks) may import
 * `services/` and `shared/`. Never `db/`, never `domain/`. Services are the only
 * way in, and an adapter that reaches past them is the shortcut that erodes the
 * architecture in three weeks (docs/stack-technique.md §3).
 *
 * Two barriers, not one: this rule fails the lint and therefore CI, and every
 * file under `server/` carries `import 'server-only'`, which fails the *build*
 * the moment a client component pulls it in.
 *
 * `test/architecture/layering.test.ts` checks that this rule actually fires.
 */
export const LAYERING_ZONES = [
  {
    // The rule is a whitelist, not a blacklist: `app/` sees `services/` and
    // nothing else under `server/`. Written this way, `server/ingest` (#4) and
    // `server/auth` (#8) are guarded the day they are created, without anyone
    // having to remember to come back here.
    target: './src/app',
    from: './src/server',
    except: ['./services'],
    message:
      'Routing may only reach the server through a service in src/server/services.',
  },
  {
    // Same whitelist for worker tasks, plus `./jobs` so tasks may import each
    // other. A task is an adapter: parse, call a service, nothing else.
    target: './src/server/jobs',
    from: './src/server',
    except: ['./services', './jobs'],
    message:
      'A task is an adapter: parse, call a service, nothing else. Go through src/server/services.',
  },
  {
    // The Wikidata pipeline reads the source and hands back plain values. It is
    // what makes the rules of `docs/research/wikidata-coverage.md` testable in
    // milliseconds, and it stays that way only if nothing in here can reach a
    // table: the writing belongs to `services/ingest.service.ts`.
    target: './src/server/ingest',
    from: './src/server',
    except: ['./ingest'],
    message:
      'The Wikidata pipeline returns values; writing them is a service’s job. Go through src/server/services.',
  },
  {
    target: './src/server/domain',
    from: './src/server',
    except: ['./domain'],
    message:
      'The domain layer is pure: no database, no services, no Next. It is called, it does not call.',
  },
  {
    target: './src/ui',
    from: './src/server',
    message: 'UI components are presentational: server data reaches them as props.',
  },
  {
    target: './src/shared',
    from: './src/server',
    message: 'src/shared is isomorphic: it runs on the client too.',
  },
]

const config = [
  { ignores: ['.next/**', 'node_modules/**', 'drizzle/**', 'next-env.d.ts'] },
  ...nextCoreWebVitals,
  {
    rules: {
      'import/no-restricted-paths': ['error', { zones: LAYERING_ZONES }],
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // `verbatimModuleSyntax` keeps imports verbatim: a type imported as a
      // value survives into the emitted module and blows up at runtime.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Tests reach into every layer on purpose: that is what testing a service
    // against a real Postgres means.
    files: ['test/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: { 'import/no-restricted-paths': 'off' },
  },
]

export default config
