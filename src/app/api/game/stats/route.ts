import { z } from 'zod'

import { PERSONAL_HEADERS, jsonBody } from '../../personal-request'

import { currentPlayerId } from '@/server/services/player.service'
import { getPlayerStatsOfGrid } from '@/server/services/stats.service'
import { CHALLENGE_DATE_PATTERN } from '@/shared/schedule'
import type { PlayerStats } from '@/shared/stats'

/**
 * Les statistiques d'un joueur : sa série, ses cartons pleins, son histoire.
 *
 * ## Pourquoi une porte à elle, et pas un champ de plus sur l'état personnel
 *
 * Parce que les deux ne changent pas au même rythme et ne coûtent pas le même
 * prix (ADR-0013). `POST /api/game/state` est le chemin du pic : à minuit, la
 * quasi-totalité de la circulation est une ouverture d'énigme, et l'ADR-0012
 * tient à ce que cette requête-là ne lise même pas un nom de footballeur. Lui
 * greffer une lecture d'agrégat plus un `GROUP BY tries_used` sur toute
 * l'histoire du joueur ferait payer à chaque pli un panneau que la plupart des
 * requêtes n'affichent jamais.
 *
 * À l'inverse, un agrégat bouge au plus trois fois par jour — une fois par
 * partie terminée. Deux cadences, deux portes.
 *
 * ## POST, alors que la requête ne fait que lire
 *
 * Pour la raison de l'ADR-0009, et elle tient mot pour mot : cette route
 * **crée** un joueur quand l'appelant ne présente pas de cookie. Un GET serait
 * déclenché par tout ce qui parcourt le web sans qu'on le lui demande — un
 * préchargement de lien, un crawler, un bot d'aperçu de messagerie — et chacun
 * gonflerait `players` d'une ligne que la purge devra reprendre. La méthode est
 * le garde-fou le moins cher possible, et c'est aussi ce qui fait que les trois
 * portes personnelles du jeu se ressemblent.
 *
 * ## Le corps ne porte qu'une date, et jamais un mode
 *
 * Le joueur est dans le cookie ; ce qui reste à dire est **de quelle grille on
 * parle**, parce que l'archive est comptée séparément (specs §7). La date, donc,
 * et le mode s'en déduit côté serveur comme aux deux portes qui jouent
 * (ADR-0016) : un appelant qui pourrait nommer son mode aurait une deuxième
 * définition de ce qu'est l'archive.
 *
 * Absente, c'est le quotidien — l'écran de la grille du jour et celui des jours
 * sans grille viennent tous deux y lire la série et les cartons pleins. Un
 * corps vide reste donc une requête valide, et c'est celle que le jeu envoie le
 * plus souvent.
 *
 * Un adaptateur, comme toutes les portes du serveur : identité, service,
 * réponse. La remise à zéro de la série, la répartition par nombre d'essais et
 * ce qui n'a pas le droit de sortir sont `stats.service.ts` et
 * `server/domain/stats.ts`.
 *
 * ## Ce qui n'est pas ici
 *
 * Une limite de débit, pour les raisons que donnent déjà les deux autres portes
 * (`docs/stack-technique.md` §10, #16) : c'est la table `players` qui est
 * exposée, pas la triche, et cela se traite au bord.
 */
const StatsRequest = z.object({
  date: z.string().regex(CHALLENGE_DATE_PATTERN).optional(),
})

export async function POST(request: Request): Promise<Response> {
  // Un corps absent est le cas courant, pas une erreur : `jsonBody` répond
  // `null` sur un corps vide, et le schéma n'a que des champs optionnels — ce
  // qui est refusé ici est une date mal formée, jamais une requête muette.
  const parsed = StatsRequest.safeParse((await jsonBody(request)) ?? {})
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid stats request.' },
      { status: 400, headers: PERSONAL_HEADERS },
    )
  }

  // Avant le service, et dans cet ordre, exactement comme les deux autres
  // portes : tout ce qui suit a besoin d'un joueur, et le cookie est réécrit en
  // sortie — c'est le « glissant » des 13 mois.
  const playerId = await currentPlayerId()

  const stats = await getPlayerStatsOfGrid(playerId, parsed.data.date ?? null)

  return Response.json(stats satisfies PlayerStats, { headers: PERSONAL_HEADERS })
}
