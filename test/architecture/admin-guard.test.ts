import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { pathKey, sourceFilesUnder } from './tree'

/**
 * The third barrier, and the one this ticket adds: **every admin page and every
 * admin Server Action calls `requireAdmin()`**.
 *
 * It is checked rather than remembered, for the same reason the `server-only`
 * marker is, and because in this case forgetting has a name: an open
 * back-office. Two properties of Next 16 make the rule unavoidable rather than
 * belt-and-braces:
 *
 * - a Server Action is reachable by a direct POST, whatever the page around it
 *   does — so the guard cannot live in the page that renders the form;
 * - a layout does **not** control whether its child segments render. The router
 *   renders them, so a layout that swaps its children for a login form does not
 *   stop the page underneath from running its queries and reaching the RSC
 *   payload — so the guard cannot live in the layout either.
 *
 * What is left is the page and the action themselves, one call each, in a dozen
 * files. Hence this test.
 */
const ADMIN_ROOT = join(process.cwd(), 'src', 'app', '(admin)')

/**
 * The call, `await` included. Stricter than the bare name on purpose: prose
 * about the guard — this file's own exemptions explain themselves in comments —
 * must not read as the guard being present.
 */
const GUARD = 'await requireAdmin()'

/**
 * The two documented exemptions, and both are the door itself:
 *
 * - the login page cannot require a session to show the form that creates one;
 * - the session actions are sign-in and sign-out — the first would be
 *   unreachable behind the guard, and the second must work for someone whose
 *   session has already expired.
 *
 * Anything else added here is a hole, which is why the list is asserted to
 * still describe real files: an exemption left behind after a rename would
 * otherwise quietly cover the next file that takes the name.
 */
const EXEMPT = new Set(['admin/login/page.tsx', 'session-actions.ts'])

const key = (file: string) => pathKey(ADMIN_ROOT, file)

type AdminFile = { key: string; source: string }

async function readAdminFiles(): Promise<AdminFile[]> {
  const files = await sourceFilesUnder(ADMIN_ROOT)
  return await Promise.all(
    files.map(async (file) => ({ key: key(file), source: await readFile(file, 'utf8') })),
  )
}

/**
 * Every exported async function of a `'use server'` module, as
 * `[name, body-ish]`. The body-ish is everything up to the next export, which
 * is enough to answer "does this one call the guard" without a parser.
 */
function exportedServerFunctions(source: string): [string, string][] {
  const parts = source.split(/^export async function /m).slice(1)

  return parts.map((part) => {
    const name = part.slice(0, part.indexOf('('))
    return [name, part]
  })
}

describe('the admin guard', () => {
  it('finds admin routes to check', async () => {
    const files = await readAdminFiles()
    expect(files.length).toBeGreaterThan(0)
  })

  it('is called by every admin page', async () => {
    const files = await readAdminFiles()
    const pages = files.filter((f) => f.key.endsWith('page.tsx') && !EXEMPT.has(f.key))
    expect(pages.length).toBeGreaterThan(0)

    const unguarded = pages.filter((f) => !f.source.includes(GUARD)).map((f) => f.key)

    expect(unguarded).toEqual([])
  })

  it('is called by every exported function of every admin Server Action module', async () => {
    const files = await readAdminFiles()
    const actionModules = files.filter(
      (f) => /^'use server'$/m.test(f.source) && !EXEMPT.has(f.key),
    )
    expect(actionModules.length).toBeGreaterThan(0)

    const unguarded: string[] = []
    for (const actions of actionModules) {
      const exported = exportedServerFunctions(actions.source)
      // A `'use server'` file with no exported async function is either a
      // mistake or a file that will grow one; either way, say so.
      if (exported.length === 0) unguarded.push(`${actions.key} (no exported action)`)

      for (const [name, body] of exported) {
        if (!body.includes(GUARD)) unguarded.push(`${actions.key}#${name}`)
      }
    }

    expect(unguarded).toEqual([])
  })

  it('takes its guard from the service layer, like everything else in app/', async () => {
    // `requireAdmin` reaching `app/` from anywhere but `server/services` would
    // mean the layering rule had been worked around.
    const files = await readAdminFiles()

    for (const file of files) {
      if (EXEMPT.has(file.key) || !file.source.includes(GUARD)) continue
      expect(file.source).toMatch(
        /import \{[^}]*requireAdmin[^}]*\} from '@\/server\/services\/admin-auth\.service'/,
      )
    }
  })

  it('exempts only files that exist, so a rename cannot leave a hole behind', async () => {
    const files = await readAdminFiles()
    const keys = new Set(files.map((f) => f.key))

    for (const exempt of EXEMPT) {
      expect(keys).toContain(exempt)
    }
  })
})
