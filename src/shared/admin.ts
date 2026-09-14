/**
 * The back-office's isomorphic layer: what every admin form and every admin
 * action agree on, whatever screen they belong to.
 *
 * It earns its file twice over. The forms live in `ui/`, which may not import
 * from `app/`, and the actions live under `app/(admin)/` — declaring these
 * shapes on each side is how the two start disagreeing. And the door's own
 * shape is deliberately not in `shared/curation.ts`: signing in is not
 * curation, and when #13 replaced the shared secret with the six-digit code,
 * this is the file that changed and that one did not.
 *
 * Ce qui *lit* un formulaire — `textField`, `firstZodMessage` — est parti dans
 * `shared/forms.ts` avec #13 : une page de connexion côté joueur en avait besoin
 * et n'a rien à faire d'importer la couche du back-office.
 */

/**
 * What an admin edit answered.
 *
 * One shape for every screen — curation, scheduling, whatever comes next —
 * because they all want the same thing: a refusal that lands as a sentence next
 * to the field, rather than as an error boundary over a form the admin was
 * halfway through filling in. `ActionStatus` renders this and nothing else.
 */
export type AdminActionState = {
  status: 'idle' | 'ok' | 'error'
  message: string | null
}

export const IDLE_ADMIN_ACTION: AdminActionState = { status: 'idle', message: null }

/**
 * The signature every admin Server Action has, so a presentational component
 * can take one as a prop without importing anything from `server/`.
 */
export type AdminAction = (
  previous: AdminActionState,
  form: FormData,
) => Promise<AdminActionState>

/** An edit that went through, and what to say about it. */
export const adminActionOk = (message: string): AdminActionState => ({
  status: 'ok',
  message,
})

/** An edit that was refused, and why — in the admin's words, never a stack. */
export const adminActionFailed = (message: string): AdminActionState => ({
  status: 'error',
  message,
})

/**
 * Où en est la connexion du back-office — et c'est un état à deux temps depuis
 * #13, parce que la porte est devenue un code à six chiffres reçu par email.
 *
 * `email` voyage d'un temps à l'autre dans l'état plutôt que dans un champ
 * caché : c'est le serveur qui l'a normalisée, et la ressaisir au second temps
 * serait une seconde adresse à valider.
 */
export type AdminSignInState = {
  /** `email` : on demande le code. `code` : il est parti, on l'attend. */
  step: 'email' | 'code'
  /** L'adresse telle que le serveur l'a retenue. Vide au premier temps. */
  email: string
  error: string | null
}

export const IDLE_SIGN_IN: AdminSignInState = { step: 'email', email: '', error: null }

/** The signature the login form takes as a prop. */
export type AdminSignInAction = (
  previous: AdminSignInState,
  form: FormData,
) => Promise<AdminSignInState>
