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
export function AdminLoginForm({ signInAction }: { signInAction: AdminSignInAction }) {
  const [state, action, pending] = useActionState(signInAction, IDLE_SIGN_IN)

  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <label htmlFor="admin-password" className="text-sm font-medium text-neutral-700">
        Mot de passe
      </label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        className="rounded-md border border-neutral-300 px-3 py-2 text-base outline-none focus:border-neutral-900"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? 'Vérification…' : 'Entrer'}
      </button>
      {state.error === null ? null : (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  )
}
