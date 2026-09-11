import 'server-only'

import { previousDate } from './challenge-calendar'
import type { ChallengeDate } from '@/shared/schedule'

/**
 * La série et le carton plein, en règles — pures, sans base et sans Next.
 *
 * ## La série est écrite d'un côté et lue de l'autre, et ce n'est pas un doublon
 *
 * Deux fonctions touchent au même état et aucune ne fait le travail de l'autre :
 *
 * - `serieAfterTitulaire` est ce qui **s'écrit**, dans la transaction qui
 *   termine la partie. Elle ne sait que ce qu'un joueur vient de réussir.
 * - `displayedSerie` est ce qui **se lit**, et c'est la remise à zéro
 *   (`docs/modele-donnees.md` §5). Une absence ne déclenche rien : si elle
 *   écrivait, il faudrait quelqu'un pour la déclencher, donc un job nocturne
 *   parcourant tous les joueurs — précisément ce que le modèle refuse.
 *
 * Le prix de ce refus est à connaître : `current_streak` en base peut être
 * périmé indéfiniment, et personne ne le répare. C'est `last_solved_challenge`
 * qui porte la vérité, et la valeur stockée n'a de sens qu'avec elle.
 *
 * ## Elle ne compte que le titulaire, et c'est la règle entière
 *
 * L'échauffement et la légende n'y entrent pas (specs §5) : « un joueur ne perd
 * pas soixante jours de série sur une légende impossible ». Ce module ne le sait
 * pas — il ne voit jamais de position — et c'est l'appelant qui ne l'appelle que
 * pour la position 2. La règle est donc écrite une fois, dans `play.service.ts`,
 * là où la position est connue.
 */

/** La série telle qu'elle dort en base — les trois colonnes qui la portent. */
export type StoredSerie = {
  currentStreak: number
  bestStreak: number
  /** La date de la dernière grille dont le titulaire a été trouvé. */
  lastSolvedChallenge: ChallengeDate | null
}

/**
 * La série après un titulaire trouvé sur la grille du `date`.
 *
 * Trois cas, et le troisième est celui qu'on écrit de travers une fois sur
 * deux : un jour manqué fait repartir à **1** et non à 0, parce que le jour
 * qu'on est en train de gagner compte. Repartir à 0 afficherait « série : 0 »
 * à quelqu'un qui vient de trouver le titulaire.
 *
 * Le premier cas — la même date deux fois — ne devrait pas se présenter : une
 * partie ne passe à `solved` qu'une fois, par compare-and-set. Il est traité
 * quand même, parce que la série est le compteur le plus visible du jeu et que
 * l'idempotence coûte ici une ligne.
 */
export function serieAfterTitulaire(
  stored: StoredSerie,
  date: ChallengeDate,
): StoredSerie & { lastSolvedChallenge: ChallengeDate } {
  if (stored.lastSolvedChallenge === date) {
    return { ...stored, lastSolvedChallenge: date }
  }

  const currentStreak =
    stored.lastSolvedChallenge === previousDate(date) ? stored.currentStreak + 1 : 1

  return {
    currentStreak,
    bestStreak: Math.max(stored.bestStreak, currentStreak),
    lastSolvedChallenge: date,
  }
}

/**
 * La série telle que le joueur la voit — **remise à zéro à la lecture**.
 *
 * Aujourd'hui ou hier : hier parce que la grille du jour n'est pas jouée à
 * minuit, et qu'une série qui tomberait à zéro entre le réveil et la partie du
 * jour serait fausse toute la matinée. Avant-hier, la série est finie, et
 * personne n'est passé l'écrire.
 *
 * `today` est passé en argument plutôt que lu à l'horloge : cette couche n'en a
 * pas, et deux lectures dans la même seconde doivent répondre pareil.
 */
export function displayedSerie(stored: StoredSerie, today: ChallengeDate): number {
  const last = stored.lastSolvedChallenge
  if (last === null) return 0

  return last === today || last === previousDate(today) ? stored.currentStreak : 0
}
