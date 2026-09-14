import { signInWithCode } from '@/server/services/account.service'
import { AccountSignInInput } from '@/shared/account'
import type { AccountOutcome } from '@/shared/account'

import { PERSONAL_HEADERS, jsonBody } from '../../personal-request'

/**
 * Le code, saisi dans l'onglet où l'on joue — et c'est là tout le sujet.
 *
 * Le lien magique existe aussi, mais il s'ouvre souvent dans un autre
 * navigateur et y perd le cookie qui porte la progression
 * (`docs/stack-technique.md` §4bis). Un code tapé ici ne quitte pas l'onglet :
 * la partie en cours reste sous les yeux, et la reprise n'a même pas besoin du
 * détour par `pending_claims`.
 *
 * Cette porte **repose le cookie du joueur**, et c'est pour ça qu'elle doit
 * passer par la même file que les trois autres : la reprise vient peut-être de
 * désigner une autre ligne `players` que celle du cookie présenté, et une
 * requête d'état qui reviendrait après elle reposerait l'ancienne valeur.
 *
 * Le refus est un 200 avec `{ ok: false }`, comme la demande : « ce code n'est
 * pas valide » est une phrase à mettre sous un champ.
 */
export async function POST(request: Request): Promise<Response> {
  const input = AccountSignInInput.safeParse(await jsonBody(request))
  if (!input.success) {
    // Une saisie mal formée est refusée comme un code faux, et avec la même
    // phrase : dire « ce n'est pas six chiffres » apprendrait à une machine à
    // ne plus dépenser d'essai pour rien.
    return Response.json({ ok: false, refusal: 'bad-code' } satisfies AccountOutcome, {
      headers: PERSONAL_HEADERS,
    })
  }

  const outcome = await signInWithCode(input.data.email, input.data.code)

  return Response.json(outcome satisfies AccountOutcome, { headers: PERSONAL_HEADERS })
}
