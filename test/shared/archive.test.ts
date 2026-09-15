import { describe, expect, it } from 'vitest'

import {
  ARCHIVE_OPEN_DAYS,
  DAILY_BASE,
  archiveBase,
  archiveReach,
  dayNeighbours,
  daysSince,
  gridHome,
  gridLevel,
  shiftDate,
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

describe('la journée voisine', () => {
  it('nomme la veille et le lendemain', () => {
    expect(shiftDate('2026-09-15', -1)).toBe('2026-09-14')
    expect(shiftDate('2026-09-15', 1)).toBe('2026-09-16')
  })

  it('traverse les mois et les années', () => {
    expect(shiftDate('2026-09-01', -1)).toBe('2026-08-31')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('compte le 29 février des années bissextiles, et pas des autres', () => {
    expect(shiftDate('2028-03-01', -1)).toBe('2028-02-29')
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('reste sur un jour plein aux deux changements d’heure de Paris', () => {
    // Le 29 mars 2026 fait 23 heures, le 25 octobre en fait 25 : une
    // soustraction locale rendrait deux fois le même jour.
    expect(shiftDate('2026-03-29', -1)).toBe('2026-03-28')
    expect(shiftDate('2026-10-25', -1)).toBe('2026-10-24')
    expect(shiftDate('2026-03-28', 1)).toBe('2026-03-29')
    expect(shiftDate('2026-10-24', 1)).toBe('2026-10-25')
  })

  it('écrit les mois et les quantièmes sur deux chiffres', () => {
    // Le format est celui de la colonne `date` et de toutes les comparaisons
    // du dépôt : un `2026-9-1` passerait les tests d'égalité de travers.
    expect(shiftDate('2026-09-09', 1)).toBe('2026-09-10')
    expect(shiftDate('2026-02-01', -1)).toBe('2026-01-31')
  })
})

describe('les deux flèches d’une journée', () => {
  const TODAY = '2026-09-15'

  it('mène en arrière à l’aperçu de la veille, en archive', () => {
    expect(dayNeighbours(TODAY, TODAY).previous).toEqual({
      date: '2026-09-14',
      href: '/archive/2026-09-14',
    })
  })

  it('ne propose pas de lendemain à la grille du jour', () => {
    // Les grilles sont programmées à l'avance : une flèche vers demain serait
    // le chemin par lequel l'énigme du lendemain fuit.
    expect(dayNeighbours(TODAY, TODAY).next).toBeNull()
  })

  it('propose le lendemain d’une journée passée', () => {
    expect(dayNeighbours('2026-09-08', TODAY).next).toEqual({
      date: '2026-09-09',
      href: '/archive/2026-09-09',
    })
  })

  it('renvoie à la racine quand le voisin est la grille du jour', () => {
    // `/` et non `/archive/<aujourd'hui>`, qui n'aurait été qu'une redirection
    // de plus : la grille du jour a son adresse à elle.
    expect(dayNeighbours('2026-09-14', TODAY).next?.href).toBe('/')
  })

  it('ne borne pas la remontée : un trou ou un cadenas reste un voisin', () => {
    // La destination explique ce qu'elle est (`archive-gate.tsx`) ; la flèche
    // ne décide pas à sa place, et ne lit donc pas le calendrier.
    expect(dayNeighbours('2020-01-01', TODAY).previous.date).toBe('2019-12-31')
  })

  it('n’avance pas au-delà d’aujourd’hui depuis une journée à venir', () => {
    // L'écran d'une journée à venir existe — l'adresse est valide — et la seule
    // direction qu'il propose est le retour vers aujourd'hui.
    const tomorrow = dayNeighbours('2026-09-16', TODAY)

    expect(tomorrow.next).toBeNull()
    expect(tomorrow.previous.href).toBe('/')
  })
})
