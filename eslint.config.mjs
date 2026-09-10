import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import sonarjs from 'eslint-plugin-sonarjs'
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
    // `server/auth` (#5) were guarded the day they were created, without anyone
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

  // Type-aware linting. `projectService` hands every rule below the real
  // checker, which is what separates "this looks wrong" from "this *is*
  // wrong": a promise nobody awaits, a `String(File)` that yields
  // `"[object File]"`, a branch the types already made unreachable. It costs
  // a few seconds of `pnpm lint`, and it is the only reason the rest of this
  // file is worth anything.
  ...tseslint.configs.strictTypeChecked.map((c) => ({
    ...c,
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
  })),
  ...tseslint.configs.stylisticTypeChecked.map((c) => ({
    ...c,
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
  })),
  { ...sonarjs.configs.recommended, files: ['**/*.ts', '**/*.tsx', '**/*.mts'] },

  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // `verbatimModuleSyntax` keeps imports verbatim: a type imported as a
      // value survives into the emitted module and blows up at runtime.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],

      // The codebase writes `type`, never `interface`: no declaration merging
      // means a type says everything it will ever say, at its definition.
      '@typescript-eslint/consistent-type-definitions': ['error', 'type'],

      // Strictness the `strictTypeChecked` preset leaves out.
      //
      // `strict-boolean-expressions` is the sharpest of them: `if (value)` on
      // a `string` conflates empty with absent, and the difference between "no
      // nationality" and "nationality recorded as blank" is a data bug you
      // only see months later.
      '@typescript-eslint/strict-boolean-expressions': 'error',
      // A `switch` over a union must handle the union. When a variant is added
      // to `PassageFlag` or a challenge theme, this is what points at every
      // place that has to learn about it.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/return-await': ['error', 'always'],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/method-signature-style': 'error',
      '@typescript-eslint/no-unnecessary-qualifier': 'error',
      '@typescript-eslint/no-shadow': 'error',
      eqeqeq: ['error', 'always'],

      // `${year}` is not a bug and never was. What the rule is here for is
      // `${maybeUndefined}` rendering the string `"undefined"` into a message,
      // and `${object}` rendering `"[object Object]"`; both stay errors.
      // Passing options replaces the preset's whole block, so every other
      // permission is restated as `false` on purpose.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowAny: false,
          allowBoolean: false,
          allowNullish: false,
          allowRegExp: false,
          allowNever: false,
        },
      ],

      // Complexity ceilings, each set at what the codebase actually measures
      // today: they are ratchets, not aspirations. Nothing here forbids a hard
      // function — it forbids a hard function *growing* without anyone
      // deciding to let it.
      //
      // Cyclomatic complexity is the looser of the two on purpose. It counts
      // every `??` as a branch, and `noUncheckedIndexedAccess` puts a `??` on
      // nearly every read: `readIdentity` scores 13 for an object literal with
      // nine fallbacks in it, and splitting that in two would help nobody.
      complexity: ['error', 13],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-nested-callbacks': ['error', 3],
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],

      // Which is why this one is the real gate: cognitive complexity counts
      // nesting, not branches. A flat ten-arm switch is readable and a
      // triple-nested pair of loops is not, and only this rule tells them
      // apart. 12 is the worst score left standing after the CSV reader in
      // `scripts/referential.ts` was taken apart — it had scored 32.
      'sonarjs/cognitive-complexity': ['error', 12],

      // Wikidata identifiers *are* `http://` URIs — `http://www.wikidata.org/
      // entity/Q1835` names an entity, it is never fetched. The endpoint the
      // pipeline actually calls is asserted in `src/server/ingest/sparql.ts`.
      'sonarjs/no-clear-text-protocols': 'off',
      // `type ChallengeDate = string` is the domain vocabulary of CONTEXT.md,
      // not a redundant alias: it is what keeps a `YYYY-MM-DD` from being read
      // as a `Date` three layers down.
      'sonarjs/redundant-type-aliases': 'off',
      // `prefer-readonly-parameter-types` would be the strictest rule here and
      // is the one we refuse: it demands deep readonly on every parameter,
      // which Drizzle's and Zod's inferred types cannot satisfy. 287 findings,
      // none of them a bug. `sonarjs/prefer-read-only-props` keeps the half
      // that pays — React props, which really must not be mutated.
      '@typescript-eslint/prefer-readonly-parameter-types': 'off',
    },
  },

  {
    // An exported function's signature is a contract, and inference widens it
    // silently: return `rows` and the return type becomes whatever Drizzle
    // inferred that day. Components are the exception — their return type is
    // JSX and annotating it says nothing.
    files: ['**/*.ts', '**/*.mts'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'error' },
  },

  {
    // Tests reach into every layer on purpose: that is what testing a service
    // against a real Postgres means. Length ceilings go too — a `describe`
    // block is a table of cases, and splitting it to please a line count
    // scatters the thing it documents.
    files: ['test/**/*.ts', '*.config.ts', '*.config.mjs'],
    rules: {
      'import/no-restricted-paths': 'off',
      'max-lines': 'off',
      'max-nested-callbacks': 'off',
      'sonarjs/no-nested-functions': 'off',
    },
  },
]

export default config
