import { describe, expect, it } from 'vitest'

import { displayedSerie, serieAfterTitulaire } from '@/server/domain/stats'
import type { StoredSerie } from '@/server/domain/stats'

/**
 * La série — la seule règle du ticket qui compte des jours, et la seule qu'un
 * `Date` mal placé rendrait fausse une fois par an.
 *
 * Deux propriétés vivent ici, et elles tirent dans des directions opposées :
 *
 * - **Elle avance sur le titulaire trouvé, et sur la veille.** Un jour sauté la
 *   fait repartir à 1, jamais à 0 : le jour qu'on est en train de gagner
 *   compte. C'est `serieAfterTitulaire`, et c'est ce qui s'écrit.
 * - **Elle est remise à zéro à la *lecture*.** Une absence ne déclenche rien :
 *   sans cette règle il faudrait un job nocturne parcourant tous les joueurs
 *   (`docs/modele-donnees.md` §5). C'est `displayedSerie`, et ça n'écrit rien.
 *
 * Les deux se croisent sur `last_solved_challenge` et c'est le seul état
 * partagé : la valeur stockée n'est jamais contredite, elle est lue autrement.
 */
const stored = (over: Partial<StoredSerie> = {}): StoredSerie => ({
  currentStreak: 0,
  bestStreak: 0,
  lastSolvedChallenge: null,
  ...over,
})

describe('la série qui avance', () => {
  it('part à 1 pour un joueur qui trouve son premier titulaire', () => {
    expect(serieAfterTitulaire(stored(), '2026-09-09')).toEqual({
      currentStreak: 1,
      bestStreak: 1,
      lastSolvedChallenge: '2026-09-09',
    })
  })

  it('avance d’un jour quand le titulaire de la veille avait été trouvé', () => {
    const before = stored({
      currentStreak: 7,
      bestStreak: 12,
      lastSolvedChallenge: '2026-09-08',
    })

    expect(serieAfterTitulaire(before, '2026-09-09')).toEqual({
      currentStreak: 8,
      bestStreak: 12,
      lastSolvedChallenge: '2026-09-09',
    })
  })

  it('repart à 1 après un jour manqué — et pas à 0 : ce jour-ci est gagné', () => {
    const before = stored({
      currentStreak: 60,
      bestStreak: 60,
      lastSolvedChallenge: '2026-09-07',
    })

    expect(serieAfterTitulaire(before, '2026-09-09')).toMatchObject({
      currentStreak: 1,
      bestStreak: 60,
    })
  })

  it('franchit le changement de mois', () => {
    const before = stored({ currentStreak: 3, bestStreak: 3, lastSolvedChallenge: '2026-08-31' })

    expect(serieAfterTitulaire(before, '2026-09-01')).toMatchObject({ currentStreak: 4 })
  })

  it('relève la meilleure série dès qu’elle est dépassée', () => {
    const before = stored({ currentStreak: 4, bestStreak: 4, lastSolvedChallenge: '2026-09-08' })

    expect(serieAfterTitulaire(before, '2026-09-09')).toMatchObject({
      currentStreak: 5,
      bestStreak: 5,
    })
  })

  it('ne compte pas deux fois le même jour', () => {
    // Une partie ne passe à `solved` qu'une fois, donc ce cas ne devrait pas se
    // présenter — mais la série est le compteur le plus visible du jeu, et
    // l'idempotence est ce qui fait qu'une reprogrammation ne l'invente pas.
    const before = stored({ currentStreak: 5, bestStreak: 9, lastSolvedChallenge: '2026-09-09' })

    expect(serieAfterTitulaire(before, '2026-09-09')).toEqual(before)
  })
})

describe('la série remise à zéro à la lecture', () => {
  it('vaut zéro pour un joueur qui n’a jamais trouvé de titulaire', () => {
    expect(displayedSerie(stored(), '2026-09-09')).toBe(0)
  })

  it('tient le jour même', () => {
    const held = stored({ currentStreak: 8, lastSolvedChallenge: '2026-09-09' })

    expect(displayedSerie(held, '2026-09-09')).toBe(8)
  })

  it('tient encore la veille : la grille du jour n’est pas jouée à minuit', () => {
    const held = stored({ currentStreak: 8, lastSolvedChallenge: '2026-09-08' })

    expect(displayedSerie(held, '2026-09-09')).toBe(8)
  })

  it('tombe à zéro dès l’avant-veille, sans qu’aucun job ne soit passé', () => {
    const lapsed = stored({ currentStreak: 60, lastSolvedChallenge: '2026-09-07' })

    expect(displayedSerie(lapsed, '2026-09-09')).toBe(0)
  })

  it('ne touche pas à la valeur stockée : elle la lit autrement', () => {
    const lapsed = stored({ currentStreak: 60, lastSolvedChallenge: '2026-09-07' })
    displayedSerie(lapsed, '2026-09-09')

    expect(lapsed.currentStreak).toBe(60)
  })
})
