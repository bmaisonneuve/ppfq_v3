/**
 * The back-office door's isomorphic layer.
 *
 * One type, and it earns its file: the login form lives in `ui/`, which may not
 * import from `app/`, and the action lives in `app/(admin)/session-actions.ts`.
 * Declaring the shape twice is how the two sides start disagreeing.
 *
 * It is deliberately not in `shared/curation.ts`: signing in is not curation,
 * and when #13 replaces the shared secret with the six-digit code, this is the
 * file that changes and that one does not.
 */

/** What `signInAction` answers. `null` while nothing has gone wrong yet. */
export type AdminSignInState = { error: string | null }

export const IDLE_SIGN_IN: AdminSignInState = { error: null }

/** The signature the login form takes as a prop. */
export type AdminSignInAction = (
  previous: AdminSignInState,
  form: FormData,
) => Promise<AdminSignInState>
