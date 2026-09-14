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
        <h1 className="text-title text-white">Back-office</h1>
        <p className="text-body text-white/80">
          Curation des parcours et programmation des grilles. La connexion se
          fait par un code à six chiffres reçu par email, comme côté jeu.
        </p>
      </div>
      <div className="panel max-w-sm">
        <AdminLoginForm signInAction={signInAction} />
      </div>
    </div>
  )
}
