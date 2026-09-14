import { signOutAccount } from '@/server/services/account.service'
import type { AccountState } from '@/shared/account'

import { PERSONAL_HEADERS } from '../../personal-request'

/**
 * Fermer la session — et rien d'autre.
 *
 * Le cookie du joueur n'est pas touché : se déconnecter n'est pas se retirer du
 * jeu. La ligne `players` reste celle du compte, le navigateur garde son
 * identité anonyme, et la personne rejoue immédiatement là où elle en était.
 * Se reconnecter la retrouvera par `auth_user_id`, sans rien à reprendre.
 *
 * Aucun corps à lire, et rien à répondre qu'un état vide : la porte de sortie
 * ne doit jamais coincer, donc elle réussit même sans session à fermer.
 */
export async function POST(): Promise<Response> {
  await signOutAccount()

  return Response.json(null satisfies AccountState, { headers: PERSONAL_HEADERS })
}
