'use client'

import { useActionState } from 'react'

import { IDLE_SIGN_IN } from '@/shared/admin'
import type { AdminSignInAction } from '@/shared/admin'
import { SignInCodeField } from '@/ui/sign-in-code-field'

/**
 * The only form outside the gate.
 *
 * Depuis #13, la porte est celle de tout le monde : une adresse, un code à six
 * chiffres reçu par email, et la même session que le jeu. Il n'y a plus de mot
 * de passe partagé à taper, ni à faire tourner.
 *
 * Deux temps sur **un seul écran** : le champ d'adresse reste affiché quand le
 * code arrive, en lecture seule, parce que la première chose qu'on veut savoir
 * en ne recevant rien est à quelle adresse on l'a demandé. Il reste soumis avec
 * le formulaire — c'est lui que l'action relit — et le bouton « changer
 * d'adresse » est le chemin de retour.
 */
export function AdminLoginForm({ signInAction }: Readonly<{ signInAction: AdminSignInAction }>) {
  const [state, action, pending] = useActionState(signInAction, IDLE_SIGN_IN)
  const awaitingCode = state.step === 'code'

  return (
    <form action={action} className="flex max-w-sm flex-col gap-3">
      <label htmlFor="admin-email" className="field-label">
        Adresse email
      </label>
      <input
        id="admin-email"
        name="email"
        type="email"
        autoComplete="email"
        required
        readOnly={awaitingCode}
        defaultValue={state.email}
        // `key` : passer d'un temps à l'autre remonte le champ, donc la valeur
        // que le serveur a retenue devient sa valeur par défaut. Sans cela,
        // React garderait la saisie non normalisée de l'écran précédent.
        key={state.step}
        className="field"
      />

      {awaitingCode ? (
        <>
          <label htmlFor="admin-code" className="field-label">
            Code reçu par email
          </label>
          <SignInCodeField id="admin-code" />
        </>
      ) : null}

      <button type="submit" disabled={pending} className="btn">
        {buttonLabel(pending, awaitingCode)}
      </button>

      {state.error === null ? null : (
        <p role="alert" className="status-error">
          {state.error}
        </p>
      )}
    </form>
  )
}

function buttonLabel(pending: boolean, awaitingCode: boolean): string {
  if (pending) return awaitingCode ? 'Vérification…' : 'Envoi…'
  return awaitingCode ? 'Entrer' : 'Recevoir un code'
}
