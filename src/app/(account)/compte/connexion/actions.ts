'use server'

import { redirect } from 'next/navigation'

import { confirmSignInLink } from '@/server/services/account.service'
import { ACCOUNT_REFUSALS } from '@/shared/account'
import { textField } from '@/shared/forms'
import type { ConfirmState } from '@/ui/account/sign-in-link-form'

/**
 * La confirmation du lien magique — le second temps du callback.
 *
 * C'est **ici** que le jeton est consommé, et nulle part avant : la page qui
 * précède est un bouton et rien d'autre. Un préchargement de lien — Outlook
 * SafeLinks, un antivirus mail, l'aperçu d'une messagerie — fait un GET sur la
 * page, n'atteint pas cette action, et le jeton attend toujours le clic
 * (`docs/stack-technique.md` §4bis).
 *
 * Une Server Action, alors que les quatre portes du compte sont des Route
 * Handlers : la raison qui les en a fait des routes ne vaut pas ici. Elles
 * partent d'un effet ou d'un champ dans la page de la grille — prérendue,
 * servie depuis un cache partagé — donc chaque appel en ramènerait le payload
 * RSC (ADR-0012). Cette page-ci n'est pas cachée, est visitée une fois, et le
 * geste est la soumission d'un formulaire : la forme qu'une Server Action
 * décrit exactement.
 */
/**
 * Un module `'use server'` n'exporte que des fonctions async : la forme de
 * l'état et sa valeur de départ vivent donc avec le formulaire qui les affiche,
 * et cette action s'y conforme.
 */
export async function confirmAction(
  _previous: ConfirmState,
  form: FormData,
): Promise<ConfirmState> {
  const token = textField(form, 'jeton')
  if (token === '') return { error: ACCOUNT_REFUSALS['bad-code'] }

  const outcome = await confirmSignInLink(token)
  if (outcome.ok) redirect('/')

  return { error: ACCOUNT_REFUSALS[outcome.refusal] }
}
