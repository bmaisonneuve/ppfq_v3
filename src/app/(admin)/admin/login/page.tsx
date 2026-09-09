import { AdminLoginForm } from '@/ui/admin/admin-login-form'

import { signInAction } from '../../session-actions'

/**
 * The one admin page not behind `requireAdmin()` — it is the page that gets you
 * a session. `test/architecture/admin-guard.test.ts` exempts it by name.
 */
export default function AdminLoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Back-office</h1>
        <p className="text-sm text-neutral-600">
          Curation des parcours et programmation des grilles.
        </p>
      </div>
      <AdminLoginForm signInAction={signInAction} />
    </div>
  )
}
