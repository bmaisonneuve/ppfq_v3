import 'server-only'

import { headers } from 'next/headers'

import { accountAuth, isAccountConfigured } from './account-auth'

/**
 * Qui est connecté, lu depuis la requête en cours.
 *
 * Le pendant exact de `player-cookie.ts` d'un cran plus haut : celui-là décide
 * ce qu'est une identité anonyme, celui-ci lit l'identité qu'un compte donne.
 * Les deux vivent dans `auth/` et ne décident rien du jeu ; ce qu'on fait de
 * l'une et de l'autre est `services/player.service.ts`.
 *
 * ## Ce que ça coûte, et pourquoi c'est acceptable sur le chemin du pic
 *
 * `currentPlayerId` appelle cette fonction à **chaque** requête personnelle, et
 * ces requêtes-là sont ce que minuit envoie par dizaines de milliers
 * (ADR-0008). Deux choses la rendent presque gratuite : sans cookie de session
 * elle répond sans toucher la base, et c'est le cas de la quasi-totalité du
 * trafic puisque le jeu est entièrement jouable sans compte (specs §6) ; avec
 * un cookie de session, le cache de cookie signé de Better Auth
 * (`session.cookieCache`, cinq minutes) évite l'aller-retour la plupart du
 * temps.
 *
 * ## Elle n'échoue pas
 *
 * Une session illisible, un secret absent, une base qui répond mal : la réponse
 * est « personne ». Faire tomber une requête de jeu parce que l'authentification
 * a un souci reviendrait à rendre le jeu indisponible pour tout le monde à
 * cause d'une pièce dont il n'a pas besoin — et il y aurait alors un moyen de
 * couper le jeu en cassant le compte.
 */

/** Le compte qui parle, réduit à ce qui sert ailleurs. */
export type AccountIdentity = {
  userId: string
  /** Normalisée par Better Auth à l'inscription — la clé d'une association. */
  email: string
}

export async function currentAccountIdentity(): Promise<AccountIdentity | null> {
  if (!isAccountConfigured()) return null

  try {
    const session = await accountAuth().api.getSession({ headers: await headers() })
    if (session === null) return null

    return { userId: session.user.id, email: session.user.email }
  } catch (error) {
    console.error(`[compte] session illisible : ${String(error)}`)
    return null
  }
}
