import Link from 'next/link'
import type { ReactNode } from 'react'

import { isAdmin } from '@/server/services/admin-auth.service'

import { signOutAction } from './session-actions'

/**
 * The back-office shell.
 *
 * A route group, so Next code-splits it and the admin bundle never weighs on
 * the game (`docs/stack-technique.md` §6).
 *
 * This layout is **chrome, not a gate**. It reads the session only to decide
 * whether to draw the sign-out button: a Next 16 layout does not control
 * whether its child segments render, so hiding `{children}` here would still
 * let the page underneath run its queries. The gate is `requireAdmin()` in each
 * page and each action, checked by `test/architecture/admin-guard.test.ts`.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const signedIn = await isAdmin()

  return (
    <div className="min-h-dvh bg-neutral-50">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/admin" className="text-sm font-semibold tracking-tight">
            PPFQ · curation
          </Link>
          {signedIn ? (
            <form action={signOutAction}>
              <button
                type="submit"
                className="text-sm text-neutral-600 underline underline-offset-2"
              >
                Se déconnecter
              </button>
            </form>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  )
}
