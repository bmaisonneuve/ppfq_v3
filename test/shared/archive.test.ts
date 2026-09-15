import { describe, expect, it } from 'vitest'

import {
  ARCHIVE_OPEN_DAYS,
  DAILY_BASE,
  archiveBase,
  archiveReach,
  daysSince,
  gridHome,
  gridLevel,
} from '@/shared/archive'

/**
 * La fenêtre d'archive, en arithmétique de texte.
 *
 * Deux propriétés portent le ticket et aucune n'est une question de calendrier
 * d'affichage :
 *
 * - **sept jours passés, et le huitième demande un compte.** La frontière est
 *   la seule chose que ce module décide, et elle se dit des deux côtés — le
 *   service refuse, l'écran explique — donc elle est affirmée ici une fois
 *   pour les deux ;
 * - **une distance en jours ne se compte pas en millisecondes locales.** Le
 *   changement d'heure de Paris donne des journées de 23 et 25 heures, et un
 *   écart arrondi à l'heure près vaut zéro jour au mauvais moment de l'année.
 */
describe('la distance en jours', () => {
  it('compte zéro pour la grille du jour', () => {
    expect(daysSince('2026-09-15', '2026-09-15')).toBe(0)
  })

  it('compte les jours passés en positif et les jours à venir en négatif', () => {
    expect(daysSince('2026-09-14', '2026-09-15')).toBe(1)
    expect(daysSince('2026-09-16', '2026-09-15')).toBe(-1)
  })

  it('traverse les mois et les années', () => {
    expect(daysSince('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysSince('2025-12-31', '2026-01-01')).toBe(1)
    // 2024 est bissextile : le 29 février existe, et il compte.
    expect(daysSince('2024-02-28', '2024-03-01')).toBe(2)
  })

  it('compte un jour plein au passage à l’heure d’été, et à celui d’hiver', () => {
    // Paris avance le 29 mars 2026 à 2 h : la journée fait 23 heures.
    expect(daysSince('2026-03-28', '2026-03-29')).toBe(1)
    // Et recule le 25 octobre : elle en fait 25.
    expect(daysSince('2026-10-24', '2026-10-25')).toBe(1)
  })
})

describe('jusqu’où on remonte sans compte', () => {
  const TODAY = '2026-09-15'

  it('ne range pas la grille du jour dans l’archive', () => {
    expect(archiveReach(TODAY, TODAY)).toBe('today')
  })

  it('ouvre à tous les sept jours passés, le septième compris', () => {
    expect(archiveReach('2026-09-14', TODAY)).toBe('open')
    expect(archiveReach('2026-09-08', TODAY)).toBe('open')
    expect(daysSince('2026-09-08', TODAY)).toBe(ARCHIVE_OPEN_DAYS)
  })

  it('demande un compte au huitième jour, et pour tout ce qui est derrière', () => {
    expect(archiveReach('2026-09-07', TODAY)).toBe('account')
    expect(archiveReach('2025-01-01', TODAY)).toBe('account')
  })

  it('ne verrouille pas une grille à venir : elle n’existe pas encore', () => {
    // La nuance vaut son test : un compte n'ouvre pas demain, donc l'écran ne
    // doit surtout pas proposer de s'inscrire pour y accéder.
    expect(archiveReach('2026-09-16', TODAY)).toBe('future')
  })
})

describe('les adresses d’une grille', () => {
  it('mène le quotidien à la racine', () => {
    expect(gridHome(DAILY_BASE)).toBe('/')
    expect(gridLevel(DAILY_BASE, 2)).toBe('/2')
  })

  it('mène une grille passée sous sa date', () => {
    const base = archiveBase('2026-09-08')

    expect(gridHome(base)).toBe('/archive/2026-09-08')
    expect(gridLevel(base, 3)).toBe('/archive/2026-09-08/3')
  })
})
