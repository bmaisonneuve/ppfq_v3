'use client'

import { useActionState } from 'react'

import { ACCOUNT_LINK_TOKEN } from '@/shared/account'

/** Ce que `confirmAction` répond, sans que ce composant sache d'où elle vient. */
export type ConfirmState = { error: string | null }

export type ConfirmAction = (
  previous: ConfirmState,
  form: FormData,
) => Promise<ConfirmState>

/**
 * Le bouton qui consomme le jeton — le seul geste de la page.
 *
 * Le jeton voyage dans un champ caché plutôt que dans l'action : il est arrivé
 * par l'URL, il repart par le formulaire, et rien entre les deux ne l'a lu en
 * base. C'est ce qui fait qu'un préchargement de lien ne consomme rien.
 */
export function SignInLinkForm({
  token,
  confirmAction,
}: Readonly<{ token: string; confirmAction: ConfirmAction }>) {
  const [state, action, pending] = useActionState(confirmAction, { error: null })

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name={ACCOUNT_LINK_TOKEN} value={token} />

      <button type="submit" disabled={pending} className="btn">
        {pending ? 'Connexion…' : 'Confirmer la connexion'}
      </button>

      {state.error === null ? null : (
        <p role="alert" className="status-error">
          {state.error}
        </p>
      )}
    </form>
  )
}
