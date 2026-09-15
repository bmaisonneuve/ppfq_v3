import { describe, expect, it } from 'vitest'

import { gridAccess, modeOfDate, needsAccountCheck } from '@/server/domain/archive'

/**
 * Le droit de jouer une grille, et le mode qui en découle.
 *
 * Trois affirmations, et chacune protège une chose différente :
 *
 * - **le mode vient de la date**, donc une grille passée ne peut pas être
 *   jouée comme la grille du jour, quoi qu'un client raconte. C'est la règle
 *   qui garde la série d'être reconstruite en une soirée (specs §7) ;
 * - **une grille à venir se refuse**, parce que les grilles sont programmées à
 *   l'avance : sans cette ligne, l'énigme de demain est lisible à son adresse ;
 * - **un compte n'ouvre que le passé lointain**, et il n'ouvre pas demain.
 */
const TODAY = '2026-09-15'

const access = (date: string, hasAccount = false) =>
  gridAccess({ date, today: TODAY, hasAccount })

describe('la grille du jour', () => {
  it('se joue en quotidien, avec ou sans compte', () => {
    expect(access(TODAY)).toEqual({ granted: true, mode: 'daily' })
    expect(access(TODAY, true)).toEqual({ granted: true, mode: 'daily' })
  })
})

describe('une grille passée', () => {
  it('se joue en archive dans les sept derniers jours, sans compte', () => {
    expect(access('2026-09-14')).toEqual({ granted: true, mode: 'archive' })
    expect(access('2026-09-08')).toEqual({ granted: true, mode: 'archive' })
  })

  it('demande un compte au-delà', () => {
    expect(access('2026-09-07')).toEqual({ granted: false, refusal: 'account-required' })
  })

  it('s’ouvre en archive dès qu’il y a un compte, aussi loin qu’on remonte', () => {
    expect(access('2026-09-07', true)).toEqual({ granted: true, mode: 'archive' })
    expect(access('2019-05-02', true)).toEqual({ granted: true, mode: 'archive' })
  })

  it('n’est jamais jouée en quotidien, même le jour d’avant', () => {
    // La règle entière du ticket tient dans cette ligne : rien de ce qui est
    // passé n'alimente la série, et ce n'est pas au client de le dire.
    expect(access('2026-09-14', true)).not.toEqual({ granted: true, mode: 'daily' })
  })
})

describe('une grille à venir', () => {
  it('se refuse, et un compte n’y change rien', () => {
    expect(access('2026-09-16')).toEqual({ granted: false, refusal: 'not-yet' })
    expect(access('2026-09-16', true)).toEqual({ granted: false, refusal: 'not-yet' })
  })
})

describe('le mode dont on lit les statistiques', () => {
  it('est le quotidien pour la grille du jour, et l’archive pour tout le reste', () => {
    expect(modeOfDate(TODAY, TODAY)).toBe('daily')
    expect(modeOfDate('2026-09-14', TODAY)).toBe('archive')
    // Un jour verrouillé se regarde même s'il ne se joue pas : lire ses
    // agrégats n'est pas jouer.
    expect(modeOfDate('2019-05-02', TODAY)).toBe('archive')
  })
})

describe('ce qu’il faut lire pour répondre', () => {
  it('ne demande le compte que pour le passé lointain', () => {
    // Le chemin du pic — la grille du jour — ne lit rien de plus sur `players`.
    expect(needsAccountCheck(TODAY, TODAY)).toBe(false)
    expect(needsAccountCheck('2026-09-08', TODAY)).toBe(false)
    expect(needsAccountCheck('2026-09-16', TODAY)).toBe(false)
    expect(needsAccountCheck('2026-09-07', TODAY)).toBe(true)
  })
})
