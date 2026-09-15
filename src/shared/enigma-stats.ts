/**
 * Une énigme vue par tous ceux qui l'ont jouée — l'autre axe des statistiques.
 *
 * `shared/stats.ts` décrit **un joueur sur toute son histoire** ; celui-ci
 * décrit **une énigme sur tous ses joueurs**. Les deux se ressemblent de loin
 * et n'ont ni la même population, ni le même rythme, ni le même droit d'accès :
 * les agrégats d'un joueur sont personnels et ne se cachent nulle part
 * (ADR-0009), ceux d'une énigme n'appartiennent à personne et se cachent donc
 * partout — c'est la seule donnée du jeu qui passe par un GET public.
 *
 * Ce qu'on y lit ne dit rien de la réponse : un taux de réussite est une
 * difficulté, pas un nom. C'est ce qui autorise la porte publique ; c'est aussi
 * pour ça que l'écran ne l'affiche qu'une fois la partie terminée — non par
 * sécurité, mais parce qu'un chiffre de difficulté avant l'essai est un conseil
 * que personne n'a demandé.
 *
 * **Tout le monde est compté**, quel que soit le jour où il a joué. C'est là
 * que cet axe se sépare de l'autre : « l'archive est comptée séparément »
 * (specs §7) est une règle sur la **série et les cartons pleins d'un joueur**,
 * et elle protège un palmarès. Une énigme n'a pas de palmarès à protéger — ce
 * qu'on lui demande est sa difficulté, et quelqu'un qui l'a affrontée trois
 * semaines plus tard l'a affrontée quand même. N'avoir compté que le jour de la
 * grille aurait surtout privé de chiffres les écrans d'archive, c'est-à-dire
 * ceux qui les montrent le plus.
 */
import { MAX_TRIES } from './play'
import { percent } from './stats'

/** Où les statistiques d'une énigme se demandent. Une définition, deux côtés. */
export const ENIGMA_STATS_PATH = '/api/game/enigma-stats'

/**
 * En dessous de ce nombre de parties conclues, **rien ne s'affiche**.
 *
 * Bas, et assumé comme tel : le panneau doit exister dès les premiers jours du
 * jeu, où quelques dizaines de personnes jouent. Ce qu'il empêche est le seul
 * cas vraiment faux — **un joueur seul qui lirait sa propre partie présentée
 * comme une mesure**, « 100 % l'ont trouvée » étant alors une phrase sur
 * lui-même. À cinq, un joueur pèse un cinquième et le chiffre commence à
 * parler de l'énigme plutôt que de celui qui le lit.
 *
 * C'est aussi pour ça que les barres portent une **part** et non un compte :
 * un pourcentage dit tout de suite de quoi il est la fraction, là où « 2 » sur
 * une population qu'on ne voit pas ne dit rien du tout.
 *
 * Il porte sur les parties **conclues**, donc sur le dénominateur du taux : ce
 * qui manque pour que le chiffre existe est ce qui manque pour qu'il soit
 * publiable.
 */
export const MIN_ENIGMA_SAMPLE = 5

/**
 * Ce qu'une énigme a fait à ceux qui l'ont jouée.
 *
 * `finishedCount` est le dénominateur et il ne compte que les parties
 * **conclues** — ce qui n'est pas le `playedCount` d'un joueur, et la différence
 * est la seule subtilité de ce fichier. Une partie ouverte ce matin et encore en
 * cours à midi n'a pas échoué : elle n'a rien fait, et la compter comme un échec
 * ferait tomber le taux de la grille du jour toute la matinée pour le faire
 * remonter le soir. Une partie ouverte sur une grille qui a tourné, elle, est un
 * abandon, donc un échec — c'est la règle de lecture de `server/domain/play.ts`,
 * et c'est elle qui trie, ici comme partout.
 */
export type EnigmaStats = {
  /** Les parties conclues : trouvées, perdues, abandonnées. Le dénominateur. */
  finishedCount: number
  solvedCount: number
  /**
   * Les réussites par nombre d'essais : `solvedByTries[i]` compte les parties
   * trouvées en `i + 1` essais. Longueur `MAX_TRIES`, creux compris — la même
   * forme que celle d'un joueur, pour que la même barre la dessine.
   */
  solvedByTries: readonly number[]
}

/** Une énigme que personne n'a encore conclue. Aucun écran n'en montre rien. */
export const NO_ENIGMA_STATS: EnigmaStats = {
  finishedCount: 0,
  solvedCount: 0,
  solvedByTries: Array.from({ length: MAX_TRIES }, () => 0),
}

/**
 * Y a-t-il assez de monde pour que ces chiffres veuillent dire quelque chose ?
 *
 * Une seule question posée une seule fois : l'écran s'affiche ou ne s'affiche
 * pas, et il n'existe pas de demi-panneau où le taux serait montrable et la
 * répartition non. Les deux se lisent sur la même population.
 */
export function hasEnoughPlays(stats: EnigmaStats): boolean {
  return stats.finishedCount >= MIN_ENIGMA_SAMPLE
}

/**
 * Le taux de réussite de l'énigme, en pourcentage entier.
 *
 * `null` quand personne ne l'a conclue — zéro sur zéro n'est pas un taux, la
 * même règle que pour un joueur (`shared/stats.ts`), et pour une fois sans le
 * reproche : une énigme que personne n'a trouvée est une information sur
 * l'énigme, pas sur celui qui la lit.
 */
export function enigmaRatePercent(stats: EnigmaStats): number | null {
  return percent(stats.solvedCount, stats.finishedCount)
}

/**
 * Le rang du joueur, en une phrase : « mieux que 71 % des joueurs ».
 *
 * Il se mesure sur **tous ceux qui ont conclu** et non sur les seuls
 * solveurs, et ce choix tient en deux raisons :
 *
 * - c'est plus juste. Quelqu'un qui n'a pas trouvé a fait moins bien que
 *   quelqu'un qui a trouvé, même en six essais. Écarter les échecs ferait dire
 *   « mieux que 4 % » à quelqu'un qui vient de réussir là où huit joueurs sur
 *   dix ont échoué ;
 * - c'est la même population que le taux affiché juste au-dessus, donc les deux
 *   nombres ne peuvent pas se contredire. Un rang compté sur les solveurs seuls
 *   aurait eu son propre dénominateur, donc son propre seuil de publication.
 *
 * Le joueur est dans son propre dénominateur et jamais dans son numérateur : on
 * ne fait pas mieux que soi-même. `null` quand il n'y a rien à comparer.
 */
export function betterThanPercent(stats: EnigmaStats, triesUsed: number): number | null {
  const missed = stats.finishedCount - stats.solvedCount
  const slower = stats.solvedByTries.reduce(
    (total, solved, index) => (index + 1 > triesUsed ? total + solved : total),
    0,
  )

  return percent(missed + slower, stats.finishedCount)
}
