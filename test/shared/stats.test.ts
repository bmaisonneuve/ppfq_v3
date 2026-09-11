import { describe, expect, it } from 'vitest'

import { MAX_TRIES } from '@/shared/play'
import { distributionBars, successRatePercent } from '@/shared/stats'
import type { PlayerStats } from '@/shared/stats'

/**
 * Les statistiques telles qu'elles s'affichent — la moitié isomorphe du ticket.
 *
 * Rien ici ne décide d'une règle de jeu : la série arrive déjà remise à zéro et
 * les compteurs arrivent déjà comptés. Ce qui est affirmé ici est ce qu'un
 * joueur lit, et les deux façons de se tromper sont des divisions :
 *
 * - **le taux de réussite se divise par les parties jouées**, pas par les jours
 *   ni par les grilles. Une partie ouverte et abandonnée est au dénominateur
 *   (specs §5, `docs/modele-donnees.md` §5) ;
 * - **la répartition se dessine relativement à sa plus grande barre**, pas au
 *   total : c'est une forme qu'on lit d'un coup d'œil, et un joueur qui trouve
 *   surtout au quatrième essai doit le voir.
 */
const stats = (over: Partial<PlayerStats> = {}): PlayerStats => ({
  playedCount: 0,
  solvedCount: 0,
  perfectChallenges: 0,
  serie: 0,
  bestSerie: 0,
  solvedByTries: Array.from({ length: MAX_TRIES }, () => 0),
  ...over,
})

describe('le taux de réussite', () => {
  it('n’existe pas tant qu’aucune partie n’a été jouée', () => {
    // Zéro sur zéro ne vaut pas « 0 % » : c'est un taux qu'on n'a pas, et
    // afficher 0 % à quelqu'un qui n'a jamais joué est un reproche.
    expect(successRatePercent(stats())).toBeNull()
  })

  it('se divise par les parties jouées, abandons compris', () => {
    expect(successRatePercent(stats({ playedCount: 4, solvedCount: 3 }))).toBe(75)
  })

  it('s’arrondit à l’entier', () => {
    expect(successRatePercent(stats({ playedCount: 3, solvedCount: 2 }))).toBe(67)
  })

  it('vaut 100 pour un sans-faute', () => {
    expect(successRatePercent(stats({ playedCount: 9, solvedCount: 9 }))).toBe(100)
  })
})

describe('la répartition des réussites par nombre d’essais', () => {
  it('a une barre par essai possible, même vide', () => {
    // Six barres, dont les creux : « je ne trouve jamais du premier coup » est
    // une information, et une barre absente ne la donne pas.
    const bars = distributionBars(stats())

    expect(bars.map((bar) => bar.tries)).toEqual([1, 2, 3, 4, 5, 6])
    expect(bars.every((bar) => bar.count === 0 && bar.share === 0)).toBe(true)
  })

  it('mesure chaque barre contre la plus grande', () => {
    const bars = distributionBars(stats({ solvedByTries: [1, 0, 4, 2, 0, 0] }))

    expect(bars.map((bar) => bar.count)).toEqual([1, 0, 4, 2, 0, 0])
    expect(bars.map((bar) => bar.share)).toEqual([0.25, 0, 1, 0.5, 0, 0])
  })
})
