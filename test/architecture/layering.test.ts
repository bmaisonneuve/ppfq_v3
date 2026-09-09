import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

/**
 * The layering rule is only worth having if it fails the build. This checks
 * that it does — that `eslint.config.mjs` actually rejects a shortcut from the
 * routing layer to the database or the domain, and lets the legal import
 * through.
 *
 * `lintText` is given a `filePath` that need not exist: ESLint resolves the
 * config, and the rule's zones, from the path alone. That is what lets us test
 * a forbidden import without committing one.
 */
const eslint = new ESLint({ cwd: process.cwd() })

const RULE = 'import/no-restricted-paths'

async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false })
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE).map((m) => m.message)
}

describe('the layering rule', () => {
  it('rejects routing that imports the database layer', async () => {
    const messages = await violations(
      'src/app/(game)/forbidden.ts',
      `import { db } from '@/server/db/client'\nexport const x = db\n`,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/only reach the server through a service/)
  })

  it('rejects routing that imports the domain layer', async () => {
    const messages = await violations(
      'src/app/(game)/forbidden.ts',
      `import { sortPlayerClubs } from '@/server/domain/career'\nexport const x = sortPlayerClubs\n`,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/only reach the server through a service/)
  })

  it('rejects the shortcut written as a relative path too', async () => {
    // The rule is about paths, not about the shape of the import specifier.
    const messages = await violations(
      'src/app/(game)/forbidden.ts',
      `import { footballers } from '../../server/db/schema'\nexport const x = footballers\n`,
    )

    expect(messages).toHaveLength(1)
  })

  it('rejects a worker task that imports the database layer', async () => {
    const messages = await violations(
      'src/server/jobs/forbidden.ts',
      `import { db } from '@/server/db/client'\nexport const x = db\n`,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/A task is an adapter/)
  })

  it('lets a worker task import a service and another task', async () => {
    const messages = await violations(
      'src/server/jobs/allowed.ts',
      `import { getFootballerCareer } from '@/server/services/catalogue.service'\nexport const x = getFootballerCareer\n`,
    )

    expect(messages).toEqual([])
  })

  it('rejects routing that imports a server directory nobody has created yet', async () => {
    // The whitelist is the point: `server/ingest` (#4) and `server/auth` (#8)
    // must be guarded the day they appear, not the day someone remembers.
    // Resolution has to succeed for the rule to fire, so this stands in for
    // them with a directory that exists.
    const messages = await violations(
      'src/app/(game)/forbidden.ts',
      `import { footballers } from '@/server/db/schema'\nexport const x = footballers\n`,
    )

    expect(messages).toHaveLength(1)
  })

  it('rejects a domain module that reaches for the database', async () => {
    const messages = await violations(
      'src/server/domain/forbidden.ts',
      `import { footballers } from '@/server/db/schema'\nexport const x = footballers\n`,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/The domain layer is pure/)
  })

  it('rejects a domain module that reaches for a service', async () => {
    const messages = await violations(
      'src/server/domain/forbidden.ts',
      `import { getFootballerCareer } from '@/server/services/catalogue.service'\nexport const x = getFootballerCareer\n`,
    )

    expect(messages).toHaveLength(1)
    expect(messages[0]).toMatch(/The domain layer is pure/)
  })

  it('rejects isomorphic code that reaches for the server', async () => {
    const messages = await violations(
      'src/shared/forbidden.ts',
      `import { db } from '@/server/db/client'\nexport const x = db\n`,
    )

    expect(messages).toHaveLength(1)
  })

  it('lets routing import a service', async () => {
    const messages = await violations(
      'src/app/(game)/allowed.ts',
      `import { getFootballerCareer } from '@/server/services/catalogue.service'\nexport const x = getFootballerCareer\n`,
    )

    expect(messages).toEqual([])
  })

  it('lets routing import the isomorphic layer', async () => {
    const messages = await violations(
      'src/app/(game)/allowed.ts',
      `import type { FootballerCareer } from '@/shared/career'\nexport type X = FootballerCareer\n`,
    )

    expect(messages).toEqual([])
  })

  it('lets a service import the database and the domain', async () => {
    const messages = await violations(
      'src/server/services/allowed.ts',
      `import { db } from '@/server/db/client'\nimport { sortPlayerClubs } from '@/server/domain/career'\nexport const x = [db, sortPlayerClubs]\n`,
    )

    expect(messages).toEqual([])
  })
})
