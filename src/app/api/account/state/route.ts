import { currentAccount } from '@/server/services/account.service'
import type { AccountState } from '@/shared/account'

import { PERSONAL_HEADERS } from '../../personal-request'

/**
 * Qui est connecté : une adresse, ou rien.
 *
 * ## POST, comme les trois portes du jeu, mais pas pour la même raison
 *
 * Les autres sont des POST parce qu'elles **créent** un joueur pour un appelant
 * sans cookie (ADR-0009). Celle-ci ne crée rien : elle lit une session et n'en
 * ouvre pas. Elle est POST quand même parce que la réponse nomme une personne,
 * et qu'un GET est ce que préchargent les liens, les crawlers et les aperçus de
 * messagerie — une adresse email dans un cache partagé serait une fuite qu'on
 * n'aurait aucun moyen de voir.
 *
 * Elle est donc la seule des sept à pouvoir sortir de la file cliente sans
 * risque, et elle y reste quand même : une file, une identité.
 *
 * ## Ce qui n'en sort pas
 *
 * Ni identifiant de compte, ni échéance de session, ni rôle. Le client n'a rien
 * à en faire — toutes ses requêtes portent le cookie — et un client qui
 * connaîtrait l'échéance en aurait une seconde définition, celle qui finit par
 * diverger de la vraie.
 */
export async function POST(): Promise<Response> {
  const account = await currentAccount()

  return Response.json(account satisfies AccountState, { headers: PERSONAL_HEADERS })
}
