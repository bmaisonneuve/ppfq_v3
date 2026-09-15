import 'server-only'

import { and, count, eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { challengeItems, dailyChallenges, playerProgress } from '@/server/db/schema'
import { todayInParis } from '@/server/domain/challenge-calendar'
import { enigmaStatsOf } from '@/server/domain/enigma-stats'
import type { ChallengeDate, Position } from '@/shared/schedule'
import type { EnigmaStats } from '@/shared/enigma-stats'

/**
 * Comment les autres s'en sont sortis sur une énigme.
 *
 * La seule lecture du jeu qui n'appartienne à personne : elle ne prend pas de
 * joueur, n'en crée pas, et ne pose aucun cookie. C'est ce qui lui vaut un GET
 * public là où les sept autres portes sont des POST privés
 * (`app/api/personal-request.ts`) — et c'est aussi ce qui la rend supportable au
 * pic, puisqu'une réponse sert tout le monde.
 *
 * ## Une seule requête, sur l'index qui existe déjà
 *
 * Le chemin est `daily_challenges → challenge_items → player_progress`, et le
 * dernier saut se fait par `challenge_item_id`, qui est le **préfixe** de
 * l'index unique `(challenge_item_id, player_id)` du modèle. Les parties d'une
 * énigme sont donc contiguës dans cet index : le `GROUP BY` les parcourt sans
 * qu'aucun index n'ait été ajouté pour lui, ce qui est la raison pour laquelle
 * cette statistique ne coûte pas une table de compteurs.
 *
 * Elle n'en a pas non plus le droit : un compteur matérialisé s'écrirait dans la
 * transaction de l'essai, sur le chemin du pic, et un compteur faux ne se répare
 * jamais tout seul (ADR-0013). Ce qui se recompte à la lecture ne peut pas
 * dériver.
 *
 * ## Tout le monde, quel que soit le jour où il a joué
 *
 * Aucun filtre sur le mode : une énigme est une énigme, et ce qu'on veut savoir
 * est ce qu'elle a fait à ceux qui l'ont affrontée — le jour même ou trois
 * semaines plus tard par l'archive. Un panneau qui n'aurait compté que le
 * quotidien aurait annoncé « 5 joueurs » sur une énigme qu'une centaine de
 * personnes ont jouée depuis, et c'est le seuil de publication
 * (`MIN_ENIGMA_SAMPLE`) qui en aurait pâti en premier, sur les écrans
 * d'archive, c'est-à-dire exactement là où ce chiffre se lit le plus.
 *
 * Le mode reste dans le `select` parce que la **règle de lecture** en dépend :
 * une partie d'archive laissée ouverte ne devient jamais un abandon
 * (`server/domain/play.ts`), donc elle ne conclut rien et ne gonfle aucun
 * dénominateur. Il ne voyage toujours pas dans la requête (ADR-0016) : il est
 * lu sur la ligne.
 *
 * Aucun droit n'est vérifié, et c'est exact : la fenêtre d'archive protège le
 * fait de **jouer** une journée passée, pas celui de savoir qu'elle a été
 * difficile. Rien de ce qui sort d'ici ne nomme un footballeur.
 */
export async function getEnigmaStats(
  date: ChallengeDate,
  position: Position,
): Promise<EnigmaStats> {
  const tallies = await db
    .select({
      status: playerProgress.status,
      mode: playerProgress.mode,
      triesUsed: playerProgress.triesUsed,
      parties: count(),
    })
    .from(playerProgress)
    .innerJoin(challengeItems, eq(challengeItems.id, playerProgress.challengeItemId))
    .innerJoin(dailyChallenges, eq(dailyChallenges.id, challengeItems.dailyChallengeId))
    .where(and(eq(dailyChallenges.date, date), eq(challengeItems.position, position)))
    .groupBy(playerProgress.status, playerProgress.mode, playerProgress.triesUsed)

  // Une journée sans grille, une journée à venir, une énigme que personne n'a
  // ouverte : trois absences, aucune erreur. Le pli rend des zéros, et le seuil
  // de publication fait le reste — un écran ne montre rien de tout ça.
  return enigmaStatsOf(tallies, { gridDate: date, today: todayInParis() })
}
