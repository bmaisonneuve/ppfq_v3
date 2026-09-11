/**
 * Les statistiques d'un joueur, telles qu'elles voyagent jusqu'à son écran.
 *
 * Le pendant de `shared/play.ts` d'un cran plus haut : celui-là décrit une
 * partie sur une énigme, celui-ci décrit un joueur sur toute son histoire. Les
 * deux sont strictement personnels et ne doivent être cachés nulle part
 * (ADR-0009), et ils voyagent séparément parce qu'ils ne changent pas au même
 * rythme — l'état d'une grille change à chaque pli, un agrégat au plus trois
 * fois par jour (ADR-0013).
 *
 * Ce qui n'est pas dans ce type est le point : **aucune date, et aucune valeur
 * stockée telle quelle**. `serie` arrive déjà remise à zéro par la lecture, et
 * `last_solved_challenge` — la colonne qui porte la vérité de la série — ne sort
 * jamais du serveur. Un client qui la recevrait pourrait recalculer la série,
 * donc en avoir une deuxième définition, et deux définitions d'un même fait
 * finissent par diverger.
 */
import { MAX_TRIES } from './play'

/** Où les statistiques d'un joueur se demandent. Une définition, deux côtés. */
export const GAME_STATS_PATH = '/api/game/stats'

/**
 * Ce qu'un joueur voit de son histoire — un mode, et rien qu'un mode.
 *
 * L'archive est comptée séparément (specs §7), donc c'est la valeur d'un
 * `(joueur, mode)` et jamais une somme des deux : une série de 200 jours ne se
 * reconstruit pas en une soirée, et un total qui les mélangerait aurait exigé
 * de choisir quelle série afficher.
 */
export type PlayerStats = {
  /** Toute partie ouverte compte, abandonnée comprise (specs §5). */
  playedCount: number
  solvedCount: number
  /** Les grilles dont les trois énigmes ont été trouvées. */
  perfectChallenges: number
  /**
   * La série, **déjà remise à zéro à la lecture**.
   *
   * Ce n'est pas la colonne : si le dernier titulaire trouvé n'est ni
   * aujourd'hui ni hier, la valeur stockée est périmée et vaut zéro ici. Une
   * absence ne déclenche rien, donc rien ne l'a réparée en base
   * (`docs/modele-donnees.md` §5, `server/domain/stats.ts`).
   */
  serie: number
  /**
   * La meilleure série jamais tenue. Elle, aucune absence ne la fait tomber.
   *
   * Stockée parce que le modèle la demande (`docs/modele-donnees.md` §5), et
   * **pas affichée** : les specs §5 énumèrent ce que le joueur voit, et elle n'y
   * est pas. Elle attend l'écran qui la demandera.
   */
  bestSerie: number
  /**
   * Les réussites par nombre d'essais : `solvedByTries[i]` compte les parties
   * trouvées en `i + 1` essais.
   *
   * Longueur `MAX_TRIES`, creux compris — « je ne trouve jamais du premier
   * coup » est une information, et une entrée absente ne la donne pas. Ce n'est
   * pas stocké : c'est un `GROUP BY tries_used` sur les parties résolues, qu'un
   * joueur a au plus trois par jour (`docs/modele-donnees.md` §5, §9).
   */
  solvedByTries: readonly number[]
}

/** Un joueur qui n'a encore rien joué. Ce que répond la porte sans ligne à lire. */
export const NO_STATS: PlayerStats = {
  playedCount: 0,
  solvedCount: 0,
  perfectChallenges: 0,
  serie: 0,
  bestSerie: 0,
  solvedByTries: Array.from({ length: MAX_TRIES }, () => 0),
}

/**
 * Le taux de réussite en pourcentage entier, ou `null` quand il n'existe pas.
 *
 * Le dénominateur est **les parties jouées**, donc les abandons y sont : une
 * partie ouverte et laissée compte comme jouée (specs §5), et un taux qui les
 * écarterait flatterait exactement les journées où le joueur a renoncé.
 *
 * `null` plutôt que zéro pour un joueur qui n'a rien joué : « 0 % » est un
 * reproche, et zéro sur zéro n'est pas un taux.
 */
export function successRatePercent(stats: PlayerStats): number | null {
  if (stats.playedCount === 0) return null

  return Math.round((stats.solvedCount / stats.playedCount) * 100)
}

/** Une barre de la répartition : son nombre d'essais, son compte, sa longueur. */
export type DistributionBar = {
  /** 1 à `MAX_TRIES`. */
  tries: number
  count: number
  /** De 0 à 1, **relative à la plus grande barre** — voir ci-dessous. */
  share: number
}

/**
 * La répartition, prête à dessiner.
 *
 * Mesurée contre la plus grande barre et non contre le total, parce que ce
 * qu'on lit là-dedans est une **forme** : quelqu'un qui trouve surtout au
 * quatrième essai doit le voir d'un coup d'œil, et des parts d'un total
 * écraseraient tout le monde à quelques pour cent de haut.
 */
export function distributionBars(stats: PlayerStats): DistributionBar[] {
  const largest = Math.max(0, ...stats.solvedByTries)

  return Array.from({ length: MAX_TRIES }, (_, index) => {
    const count = stats.solvedByTries[index] ?? 0
    return { tries: index + 1, count, share: largest === 0 ? 0 : count / largest }
  })
}
