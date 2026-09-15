import { describe, expect, it } from 'vitest'

import {
  MIN_ENIGMA_SAMPLE,
  betterThanPercent,
  enigmaRatePercent,
  hasEnoughPlays,
} from '@/shared/enigma-stats'
import type { EnigmaStats } from '@/shared/enigma-stats'

/**
 * Ce qu'une énigme dit d'elle-même, côté affichage.
 *
 * Rien ici ne décide d'une règle de jeu : les compteurs arrivent déjà comptés,
 * et le tri entre une partie conclue et une partie en cours a eu lieu sur le
 * serveur (`server/domain/enigma-stats.ts`). Ce qui est affirmé ici est ce
 * qu'un joueur lit, et les trois façons de se tromper sont :
 *
 * - **diviser par les solveurs plutôt que par tout le monde.** Le taux et le
 *   rang se mesurent sur la même population — ceux qui ont conclu — sinon les
 *   deux nombres du même panneau se contredisent ;
 * - **compter quelqu'un comme meilleur que lui-même.** Un solveur à égalité
 *   n'est pas dépassé ;
 * - **publier une mesure faite sur trois personnes.** Le seuil existe pour les
 *   premiers jours du jeu, où « 50 % » est un tirage à pile ou face.
 */
const stats = (over: Partial<EnigmaStats> = {}): EnigmaStats => ({
  finishedCount: 0,
  solvedCount: 0,
  solvedByTries: [0, 0, 0, 0, 0, 0],
  ...over,
})

describe('le taux de réussite d’une énigme', () => {
  it('n’existe pas tant que personne ne l’a conclue', () => {
    expect(enigmaRatePercent(stats())).toBeNull()
  })

  it('se divise par les parties conclues, échecs et abandons compris', () => {
    expect(enigmaRatePercent(stats({ finishedCount: 200, solvedCount: 76 }))).toBe(38)
  })

  it('s’arrondit à l’entier', () => {
    expect(enigmaRatePercent(stats({ finishedCount: 3, solvedCount: 2 }))).toBe(67)
  })

  it('vaut zéro pour une énigme que personne n’a trouvée', () => {
    // Zéro est un vrai taux ici, contrairement à celui d'un joueur : il parle
    // de l'énigme et ne reproche rien à celui qui le lit.
    expect(enigmaRatePercent(stats({ finishedCount: 40, solvedCount: 0 }))).toBe(0)
  })
})

describe('le seuil de publication', () => {
  it('retient un panneau qu’une poignée de parties dessinerait', () => {
    expect(hasEnoughPlays(stats({ finishedCount: MIN_ENIGMA_SAMPLE - 1 }))).toBe(false)
  })

  it('s’ouvre à partir du nombre de parties qu’il nomme', () => {
    expect(hasEnoughPlays(stats({ finishedCount: MIN_ENIGMA_SAMPLE }))).toBe(true)
  })

  it('ne laisse jamais un joueur seul lire sa propre partie comme une mesure', () => {
    // Le cas que le seuil existe vraiment pour empêcher : « 100 % l'ont
    // trouvée » sur une seule partie est une phrase sur celui qui la lit.
    expect(hasEnoughPlays(stats({ finishedCount: 1, solvedCount: 1 }))).toBe(false)
  })

  it('reste assez bas pour que le panneau existe les premiers jours', () => {
    // Il est volontairement bas : un jeu qui n'a que quelques dizaines de
    // joueurs doit quand même montrer ce panneau, sinon il n'existe pas au
    // moment où il est le plus intéressant à régler.
    expect(MIN_ENIGMA_SAMPLE).toBeLessThanOrEqual(10)
  })
})

describe('le rang du joueur', () => {
  const played = stats({
    finishedCount: 100,
    solvedCount: 40,
    solvedByTries: [10, 10, 10, 10, 0, 0],
  })

  it('n’existe pas quand il n’y a personne à qui se comparer', () => {
    expect(betterThanPercent(stats(), 1)).toBeNull()
  })

  it('compte ceux qui n’ont pas trouvé comme dépassés', () => {
    // Trouver en quatre essais reste mieux que ne pas trouver : les soixante
    // échecs sont dans le numérateur, et les solveurs plus rapides n'y sont pas.
    expect(betterThanPercent(played, 4)).toBe(60)
  })

  it('compte en plus les solveurs qui ont dépensé davantage', () => {
    expect(betterThanPercent(played, 2)).toBe(80)
  })

  it('ne compte pas ceux qui ont fait exactement pareil', () => {
    // Deux solveurs, un en un essai et un en deux : celui du premier coup en
    // dépasse un sur deux, et surtout pas lui-même.
    const pair = stats({ finishedCount: 2, solvedCount: 2, solvedByTries: [1, 1, 0, 0, 0, 0] })

    expect(betterThanPercent(pair, 1)).toBe(50)
    expect(betterThanPercent(pair, 2)).toBe(0)
  })

  it('vaut au plus le taux d’échec plus les solveurs plus lents', () => {
    // Le premier coup sur une énigme où quarante pour cent trouvent : soixante
    // échecs et trente solveurs plus lents, et jamais cent.
    expect(betterThanPercent(played, 1)).toBe(90)
  })
})
