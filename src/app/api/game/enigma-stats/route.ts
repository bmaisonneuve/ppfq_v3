import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { getEnigmaStats } from '@/server/services/enigma-stats.service'
import { CHALLENGE_DATE_PATTERN, asPosition } from '@/shared/schedule'
import type { EnigmaStats } from '@/shared/enigma-stats'

/**
 * Comment les autres s'en sont sortis sur une énigme.
 *
 * ## La seule porte du jeu qui soit un GET, et la seule qui se cache
 *
 * Les sept autres sont des POST privés, pour deux raisons qui tombent toutes
 * les deux ici : elles rendent la valeur d'**un** joueur, donc rien ne doit la
 * garder (ADR-0009), et elles **créent** un joueur quand l'appelant n'a pas de
 * cookie, donc un préchargement de lien gonflerait `players` (ADR-0013).
 *
 * Celle-ci ne fait ni l'un ni l'autre. Elle ne lit pas de cookie, n'en pose
 * pas, ne nomme personne : ce qu'elle rend est la même chose pour tout le
 * monde. C'est donc un GET, sa question tient dans son URL, et Cloudflare peut
 * l'absorber comme il absorbe le typeahead — ce qui compte parce qu'elle est
 * demandée à la fin de chaque partie, soit trois fois par joueur et par jour.
 *
 * Rien de ce qui sort d'ici ne dit qui est la réponse : un taux de réussite est
 * une difficulté, pas un nom. L'écran, lui, ne l'affiche qu'une fois la partie
 * terminée, et c'est un choix d'écran et non une protection — un chiffre de
 * difficulté montré avant l'essai serait un conseil que personne n'a demandé.
 *
 * ## Une minute de cache, et ce qu'elle coûte
 *
 * Une réponse gardée une minute peut ne pas encore contenir la partie que le
 * joueur vient de finir. C'est assumé : sous le seuil de publication le panneau
 * ne s'affiche pas du tout, et au-dessus, une partie sur vingt ou plus ne
 * déplace pas un pourcentage d'un point. En échange, la minute qui suit minuit
 * — celle où tout le monde arrive — se sert depuis le bord.
 *
 * Un adaptateur, comme toutes les portes du serveur : parse, appelle le
 * service, répond. La règle qui décide quelles parties comptent est
 * `server/domain/enigma-stats.ts`.
 */

/**
 * Les parties d'une énigme bougent le jour de sa grille et plus jamais après.
 * Une minute au navigateur, cinq au bord, et une réponse périmée reste servie
 * pendant qu'elle se renouvelle : rien ici ne mérite qu'un joueur attende.
 */
const CACHE_CONTROL = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300'

/**
 * `(date, position)` — de quelle énigme on parle, et c'est tout.
 *
 * La même façon de nommer une énigme que partout ailleurs : le couple la
 * désigne sans nommer une ligne, et la page mise en cache n'a de toute façon
 * aucun identifiant à donner au client (`shared/grid.ts`).
 *
 * Le schéma reste ici plutôt que dans `shared/` : rien d'autre ne lit cette
 * chaîne de requête, et un schéma Zod dans un module que l'écran importe
 * embarquerait le validateur dans le paquet du jeu.
 */
const EnigmaStatsQuery = z.object({
  date: z.string().regex(CHALLENGE_DATE_PATTERN),
  // Pas de `refine` ici : `asPosition` plus bas est le seul juge de ce qu'est
  // une position, et il refuse déjà `NaN` comme il refuse `4`. Un second
  // contrôle n'aurait fait que déplacer la moitié de la règle.
  position: z.string().transform(Number),
})

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams
  const parsed = EnigmaStatsQuery.safeParse({
    date: params.get('date') ?? undefined,
    position: params.get('position') ?? undefined,
  })

  const position = parsed.success ? asPosition(parsed.data.position) : null

  // Une date mal formée ou une position qui n'existe pas est un bug d'appelant,
  // et le dire vaut mieux que de répondre des zéros — qui se liraient comme une
  // énigme que personne n'a jouée.
  if (!parsed.success || position === null) {
    return Response.json({ error: 'Invalid enigma.' }, { status: 400 })
  }

  const stats = await getEnigmaStats(parsed.data.date, position)

  return Response.json(stats satisfies EnigmaStats, {
    headers: { 'Cache-Control': CACHE_CONTROL },
  })
}
