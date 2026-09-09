'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'

import {
  ADMIN_HOME_PATH,
  ADMIN_LOGIN_PATH,
  signInAdmin,
  signOutAdmin,
} from '@/server/services/admin-auth.service'
import type { AdminSignInState } from '@/shared/admin'

/**
 * The two actions of the door itself, and the only ones under `(admin)` that do
 * not call `requireAdmin()` — signing in would be unreachable behind it, and
 * signing out has to work for someone whose session has already expired.
 *
 * `test/architecture/admin-guard.test.ts` exempts this file by name and asserts
 * the file still exists, so the exemption cannot outlive a rename.
 *
 * Adapters, like every door into the server: parse, call the service, answer.
 */

/**
 * The password is not length-capped by a schema on purpose beyond a sane bound:
 * a long passphrase is a good password, and the comparison is constant time.
 */
const SignInForm = z.object({ password: z.string().min(1).max(512) })

export async function signInAction(
  _previous: AdminSignInState,
  form: FormData,
): Promise<AdminSignInState> {
  const parsed = SignInForm.safeParse({ password: form.get('password') ?? '' })
  if (!parsed.success) return { error: 'Mot de passe requis.' }

  const result = await signInAdmin(parsed.data.password)

  if (result === 'signed-in') redirect(ADMIN_HOME_PATH)

  // A wrong password and an unconfigured back-office answer differently, and
  // that is deliberate: the second is an operator's mistake, not an attacker's
  // information — nobody can reach this page without already knowing where the
  // back-office is.
  if (result === 'not-configured') {
    return {
      error:
        'Back-office non configuré : ADMIN_PASSWORD et ADMIN_SESSION_SECRET doivent être définis.',
    }
  }
  if (result === 'locked-out') {
    return { error: 'Trop de tentatives. Réessayez dans quelques minutes.' }
  }

  return { error: 'Mot de passe incorrect.' }
}

export async function signOutAction(): Promise<void> {
  await signOutAdmin()
  redirect(ADMIN_LOGIN_PATH)
}
