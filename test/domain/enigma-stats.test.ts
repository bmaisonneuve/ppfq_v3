import { describe, expect, it } from 'vitest'

import { enigmaStatsOf } from '@/server/domain/enigma-stats'
import type { EnigmaTally } from '@/server/domain/enigma-stats'

/**
 * Quelles parties comptent dans les chiffres d'une énigme.
 *
 * Une seule règle, et c'est celle que le modèle appelle une **règle de
 * lecture** : une partie non terminée avant le changement de grille compte
 * comme un échec, et aucun job ne l'écrit (`docs/modele-donnees.md` §4). Elle
 * se voit ici des deux côtés de la même journée, sur les mêmes tas :
 *
 * - **sur la grille du jour**, une partie ouverte se joue encore. La compter
 *   comme perdue ferait plonger le taux le matin pour le faire remonter le
 *   soir, sur un chiffre que le joueur voit ;
 * - **une fois la grille tournée**, la même ligne est un abandon, donc un
 *   échec — et elle entre au dénominateur, exactement comme le taux d'un joueur
 *   compte les journées où il a renoncé.
 *
 * C'est `readPlayStatus` qui tranche, appelé et non recopié : deux
 * formulations d'une même règle finissent par diverger d'un jour, et ce
 * jour-là est celui où le taux de la grille du jour serait faux.
 *
 * L'archive est comptée comme le reste — une énigme est jugée sur tous ceux qui
 * l'ont affrontée, quel que soit le jour — et c'est justement pour ça que le
 * mode arrive jusqu'ici : une partie d'archive n'a pas de lendemain qui la
 * transforme en abandon.
 */
const TODAY = '2026-09-15'
const YESTERDAY = '2026-09-14'

const tally = (over: Partial<EnigmaTally> = {}): EnigmaTally => ({
  status: 'solved',
  mode: 'daily',
  triesUsed: 1,
  parties: 1,
  ...over,
})

const ofToday = (tallies: readonly EnigmaTally[]) =>
  enigmaStatsOf(tallies, { gridDate: TODAY, today: TODAY })

const ofYesterday = (tallies: readonly EnigmaTally[]) =>
  enigmaStatsOf(tallies, { gridDate: YESTERDAY, today: TODAY })

describe('une énigme que personne n’a jouée', () => {
  it('rend des zéros plutôt que rien du tout', () => {
    expect(ofToday([])).toEqual({
      finishedCount: 0,
      solvedCount: 0,
      solvedByTries: [0, 0, 0, 0, 0, 0],
    })
  })
})

describe('une partie encore ouverte', () => {
  it('n’est ni une réussite ni un échec sur la grille du jour', () => {
    const stats = ofToday([tally({ status: 'in_progress', triesUsed: 2, parties: 7 })])

    expect(stats).toMatchObject({ finishedCount: 0, solvedCount: 0 })
  })

  it('est un abandon une fois la grille tournée', () => {
    const stats = ofYesterday([tally({ status: 'in_progress', triesUsed: 2, parties: 7 })])

    expect(stats).toMatchObject({ finishedCount: 7, solvedCount: 0 })
  })

  it('ne dévoile pas son nombre d’essais dans la répartition', () => {
    // La répartition est celle des **réussites** : un abandon à deux essais
    // n'est pas une énigme trouvée en deux essais.
    const stats = ofYesterday([tally({ status: 'in_progress', triesUsed: 2, parties: 7 })])

    expect(stats.solvedByTries).toEqual([0, 0, 0, 0, 0, 0])
  })
})

describe('les parties conclues', () => {
  it('rangent chaque réussite au nombre d’essais qu’elle a coûté', () => {
    const stats = ofToday([
      tally({ triesUsed: 1, parties: 4 }),
      tally({ triesUsed: 3, parties: 9 }),
    ])

    expect(stats.solvedByTries).toEqual([4, 0, 9, 0, 0, 0])
    expect(stats).toMatchObject({ finishedCount: 13, solvedCount: 13 })
  })

  it('comptent les échecs au dénominateur et nulle part ailleurs', () => {
    const stats = ofToday([
      tally({ triesUsed: 2, parties: 3 }),
      tally({ status: 'failed', triesUsed: 6, parties: 12 }),
    ])

    expect(stats).toMatchObject({ finishedCount: 15, solvedCount: 3 })
    expect(stats.solvedByTries).toEqual([0, 3, 0, 0, 0, 0])
  })

  it('additionnent les tas d’un même nombre d’essais', () => {
    // Le `GROUP BY` rend un tas par (état, essais), donc deux tas ne portent
    // jamais le même couple — sauf le jour où la requête changera de forme.
    const stats = ofToday([tally({ triesUsed: 1, parties: 2 }), tally({ triesUsed: 1, parties: 5 })])

    expect(stats.solvedByTries).toEqual([7, 0, 0, 0, 0, 0])
  })
})

describe('l’archive', () => {
  it('compte comme le reste une fois la partie conclue', () => {
    const stats = ofYesterday([tally({ mode: 'archive', triesUsed: 3, parties: 4 })])

    expect(stats).toMatchObject({ finishedCount: 4, solvedCount: 4 })
    expect(stats.solvedByTries).toEqual([0, 0, 4, 0, 0, 0])
  })

  it('n’abandonne jamais une partie laissée ouverte, si vieille soit la grille', () => {
    // Une partie d'archive n'a pas de lendemain (`server/domain/play.ts`) :
    // la compter comme un abandon gonflerait le dénominateur d'une énigme de
    // parties que personne n'a jamais rendues.
    const stats = ofYesterday([tally({ mode: 'archive', status: 'in_progress', parties: 9 })])

    expect(stats).toMatchObject({ finishedCount: 0, solvedCount: 0 })
  })
})

describe('une réussite hors des six essais', () => {
  it('reste comptée sans déborder du tableau que l’écran dessine', () => {
    // Impossible par le jeu — le septième essai est refusé — donc une ligne
    // écrite à la main. Quelqu'un a bien joué : le taux la garde, la forme non.
    const stats = ofToday([tally({ triesUsed: 9, parties: 1 })])

    expect(stats).toMatchObject({ finishedCount: 1, solvedCount: 1 })
    expect(stats.solvedByTries).toEqual([0, 0, 0, 0, 0, 0])
  })
})
