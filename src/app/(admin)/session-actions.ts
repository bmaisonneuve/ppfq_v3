'use server'

import { redirect } from 'next/navigation'

import {
  ADMIN_HOME_PATH,
  ADMIN_LOGIN_PATH,
  requestAdminCode,
  signInAdmin,
  signOutAdmin,
} from '@/server/services/admin-auth.service'
import { ACCOUNT_REFUSALS, EmailInput, SignInCodeInput } from '@/shared/account'
import { firstZodMessage, textField } from '@/shared/forms'
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
 *
 * ## Une seule action pour les deux temps
 *
 * Depuis #13 la connexion est une adresse puis un code, et c'est **une** action
 * et non deux : ce qui distingue les deux temps est la présence du champ `code`
 * dans le formulaire, et un `useActionState` unique suffit alors à porter l'état
 * de l'écran. Deux actions auraient demandé deux états et un moyen de dire
 * lequel des deux est le vrai.
 */
export async function signInAction(
  previous: AdminSignInState,
  form: FormData,
): Promise<AdminSignInState> {
  const email = EmailInput.safeParse(textField(form, 'email'))
  if (!email.success) return { ...previous, error: firstZodMessage(email.error) }

  const typed = textField(form, 'code')
  if (typed === '') return await askForCode(email.data)

  const code = SignInCodeInput.safeParse(typed)
  if (!code.success) {
    return { step: 'code', email: email.data, error: firstZodMessage(code.error) }
  }

  const result = await signInAdmin(email.data, code.data)
  if (result.ok) redirect(ADMIN_HOME_PATH)

  return { step: 'code', email: email.data, error: ACCOUNT_REFUSALS[result.refusal] }
}

export async function signOutAction(): Promise<void> {
  await signOutAdmin()
  redirect(ADMIN_LOGIN_PATH)
}

/**
 * Le premier temps.
 *
 * L'écran passe à l'attente du code **quoi qu'il arrive**, et c'est délibéré :
 * une adresse qui n'est pas celle de l'admin ne reçoit rien et ne l'apprend pas
 * (`admin-auth.service.ts`). Le seul refus qui s'affiche ici est celui qui
 * parle de nous — un back-office non configuré — parce que c'est l'erreur d'un
 * exploitant et non un renseignement pour un curieux (ADR-0006).
 */
async function askForCode(email: string): Promise<AdminSignInState> {
  const result = await requestAdminCode(email)

  if (!result.ok) return { step: 'email', email, error: ACCOUNT_REFUSALS[result.refusal] }

  return { step: 'code', email, error: null }
}
