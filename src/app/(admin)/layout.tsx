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
 *
 * It paints no background of its own. The green comes from the `<body>` of the
 * root layout, which is the whole point: the admin and the player look at one
 * product, and the theme is configured in `globals.css` for both at once. What
 * is admin-specific here is the width and the header — a five-column page for a
 * desktop tool, where the game is a 430 px column.
 */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const signedIn = await isAdmin()

  return (
    <div className="min-h-dvh">
      <header className="border-b border-white/15">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <nav className="flex flex-wrap items-baseline gap-4 text-white">
            <span className="text-wordmark">PPFQ</span>
            <Link href="/admin" className="link text-body text-white/80">
              Curation
            </Link>
            <Link href="/admin/clubs" className="link text-body text-white/80">
              Clubs
            </Link>
            <Link href="/admin/schedule" className="link text-body text-white/80">
              Calendrier
            </Link>
          </nav>
          {signedIn ? (
            <form action={signOutAction}>
              <button type="submit" className="link text-body text-white/80">
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
