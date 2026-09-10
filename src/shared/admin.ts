/**
 * The back-office's isomorphic layer: what every admin form and every admin
 * action agree on, whatever screen they belong to.
 *
 * It earns its file twice over. The forms live in `ui/`, which may not import
 * from `app/`, and the actions live under `app/(admin)/` — declaring these
 * shapes on each side is how the two start disagreeing. And the door's own
 * shape is deliberately not in `shared/curation.ts`: signing in is not
 * curation, and when #13 replaces the shared secret with the six-digit code,
 * this is the file that changes and that one does not.
 */
import type { z } from 'zod'

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

/** The first message of a Zod error — a form field has one thing wrong at a time. */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Saisie invalide.'
}

/**
 * A text field, read out of a `FormData`.
 *
 * `FormData.get` answers `string | File | null`: a file input, or no field at
 * all, are as much a possible answer as the text the admin typed. Passing that
 * straight to `String()` turns an uploaded file into the id `"[object File]"`,
 * which then reaches a query as a perfectly well-formed nonsense value. This
 * is the one place that narrowing happens; a `File` reads as the empty string
 * and every caller already refuses that.
 */
export function textField(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/** The same narrowing for a field submitted several times, in document order. */
export function textFields(form: FormData, name: string): string[] {
  return form.getAll(name).map((value) => (typeof value === 'string' ? value : ''))
}

/** What `signInAction` answers. `null` while nothing has gone wrong yet. */
export type AdminSignInState = { error: string | null }

export const IDLE_SIGN_IN: AdminSignInState = { error: null }

/** The signature the login form takes as a prop. */
export type AdminSignInAction = (
  previous: AdminSignInState,
  form: FormData,
) => Promise<AdminSignInState>
