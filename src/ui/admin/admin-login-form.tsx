'use client'

import { useActionState } from 'react'

import { IDLE_SIGN_IN } from '@/shared/admin'
import type { AdminSignInAction } from '@/shared/admin'

/**
 * The only form outside the gate.
 *
 * It says nothing about who the admin is — there is one, and the password is
 * the whole credential until #13 replaces this with the six-digit code.
 */
export function AdminLoginForm({ signInAction }: Readonly<{ signInAction: AdminSignInAction }>) {
  const [state, action, pending] = useActionState(signInAction, IDLE_SIGN_IN)

  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <label htmlFor="admin-password" className="field-label">
        Mot de passe
      </label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="field"
      />
      <button
        type="submit"
        disabled={pending}
        className="btn"
      >
        {pending ? 'Vérification…' : 'Entrer'}
      </button>
      {state.error === null ? null : (
        <p role="alert" className="status-error">
          {state.error}
        </p>
      )}
    </form>
  )
}
