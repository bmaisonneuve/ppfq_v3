import 'server-only'

import { readPlayStatus } from './play'
import { MAX_TRIES } from '@/shared/play'
import type { PlayMode, PlayStatus } from '@/shared/play'
import type { ChallengeDate } from '@/shared/schedule'
import type { EnigmaStats } from '@/shared/enigma-stats'

/**
 * Ce qu'une énigme a fait à ceux qui l'ont jouée — en règle, sans base.
 *
 * Le service pose une question à Postgres et rapporte des tas : tant de parties
 * dans tel état avec tant d'essais dépensés. Tout ce qui décide de ce qu'on en
 * fait est ici, parce que la décision n'est pas une requête : **une partie
 * encore ouverte n'a rien fait**, et savoir si elle est encore ouverte dépend du
 * jour qu'on est, pas de sa colonne.
 *
 * C'est exactement la règle de lecture de `play.ts` — « une partie non terminée
 * avant le changement de grille compte comme un échec » — et c'est elle qu'on
 * appelle plutôt que de la réécrire. Deux formulations d'une même règle
 * finissent toujours par diverger d'un jour, et ce jour-là est celui où le taux
 * de la grille du jour serait faux toute la matinée.
 *
 * ## L'archive entre ici, et le mode avec elle
 *
 * Une énigme est comptée sur tous ceux qui l'ont jouée, le jour même ou plus
 * tard (`enigma-stats.service.ts`). Le mode arrive donc sur chaque tas, et il
 * n'est pas décoratif : `readPlayStatus` laisse une partie d'archive ouverte
 * indéfiniment, là où une partie du jour laissée ouverte devient un abandon dès
 * que la grille a tourné. Le lui écrire en dur reviendrait à compter comme
 * échec des parties d'archive que personne n'a abandonnées.
 */

/**
 * Un tas rapporté par le `GROUP BY` : un état, un mode, un nombre d'essais, un
 * compte.
 *
 * Le mode est là pour la seule règle qui le lit — une partie d'archive ouverte
 * n'est pas un abandon — et pour rien d'autre : les chiffres qui sortent d'ici
 * ne distinguent pas le quotidien de l'archive.
 */
export type EnigmaTally = {
  status: PlayStatus
  mode: PlayMode
  triesUsed: number
  parties: number
}

/**
 * Les tas, pliés en ce qu'un écran affiche.
 *
 * `today` est passé plutôt que lu à l'horloge : cette couche n'en a pas, et
 * deux lectures dans la même seconde doivent répondre pareil.
 */
export function enigmaStatsOf(
  tallies: readonly EnigmaTally[],
  args: { gridDate: ChallengeDate; today: ChallengeDate },
): EnigmaStats {
  const solvedByTries = Array.from({ length: MAX_TRIES }, () => 0)
  let finishedCount = 0
  let solvedCount = 0

  for (const tally of tallies) {
    const status = readPlayStatus(
      { status: tally.status, mode: tally.mode, gridDate: args.gridDate },
      args.today,
    )

    // Une partie en cours sur la grille du jour n'est ni une réussite ni un
    // échec : elle se joue. La compter comme perdue ferait plonger le taux le
    // matin pour le faire remonter le soir, sur un chiffre que le joueur voit.
    if (status === 'in_progress') continue

    finishedCount += tally.parties
    if (status !== 'solved') continue

    solvedCount += tally.parties

    // Une partie trouvée a dépensé de 1 à `MAX_TRIES` essais. Hors de ces
    // bornes, la ligne a été écrite à la main : elle reste au dénominateur —
    // quelqu'un a bien joué — mais elle ne déborde pas du tableau que
    // l'interface dessine. Même prudence que la répartition d'un joueur.
    const index = tally.triesUsed - 1
    if (index >= 0 && index < MAX_TRIES) {
      solvedByTries[index] = (solvedByTries[index] ?? 0) + tally.parties
    }
  }

  return { finishedCount, solvedCount, solvedByTries }
}
