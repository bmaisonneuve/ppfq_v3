import { requestSignIn } from '@/server/services/account.service'
import { AccountRequestInput } from '@/shared/account'
import type { AccountOutcome } from '@/shared/account'

import { PERSONAL_HEADERS, jsonBody } from '../../personal-request'

/**
 * « Envoyez-moi un code » — ou un lien, pour qui est sur le même appareil.
 *
 * La réponse est la même pour une adresse connue et pour une inconnue, et c'est
 * la conséquence directe de « s'inscrire et se connecter sont une seule
 * action » (specs §6) : il n'y a rien à distinguer, donc rien à révéler.
 *
 * Un refus n'est pas une panne : `{ ok: false, refusal }` et un 200. La limite
 * de fréquence est atteinte, ou l'email n'est pas parti — dans les deux cas le
 * client a une phrase à afficher sous le champ, pas une erreur à remonter. Un
 * 429 aurait dit la même chose en obligeant le client à lire deux canaux.
 *
 * Un adaptateur, comme toutes les portes : parser, appeler le service,
 * répondre. La limite de fréquence, l'association à reprendre et l'envoi sont
 * `account.service.ts`.
 */
export async function POST(request: Request): Promise<Response> {
  const input = AccountRequestInput.safeParse(await jsonBody(request))
  if (!input.success) {
    return Response.json({ error: 'Requête invalide.' }, { status: 400, headers: PERSONAL_HEADERS })
  }

  const outcome = await requestSignIn(input.data.email, input.data.via)

  return Response.json(outcome satisfies AccountOutcome, { headers: PERSONAL_HEADERS })
}
