import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getEnigmaStats } from '@/server/services/enigma-stats.service'
import { getDayPlays, submitTry } from '@/server/services/play.service'
import { scheduleGrid } from '@/server/services/schedule.service'
import type { Position } from '@/shared/schedule'

import { db } from '@test/setup/db'
import { FOOTBALLER_IDS, seedCatalogue } from '@test/fixtures/catalogue'
import { PLAYER_IDS, seedPlayers } from '@test/fixtures/players'

/**
 * Les chiffres d'une énigme contre un vrai Postgres, joués par la seule porte
 * qui existe : ouvrir une énigme, puis proposer des footballeurs.
 *
 * C'est la première lecture du jeu qui **traverse les joueurs**, et c'est tout
 * ce qui la rend intéressante. Quatre propriétés la portent :
 *
 * - **elle compte tout le monde**, là où chaque autre lecture personnelle passe
 *   son temps à ne lire qu'un joueur. L'erreur symétrique est donc la seule à
 *   craindre : compter quelqu'un qui n'a rien à faire là ;
 * - **une partie en cours n'a rien conclu** tant que sa grille est celle du
 *   jour, et devient un abandon dès qu'elle a tourné. La règle est celle de
 *   `server/domain/play.ts`, et elle s'observe ici en déplaçant l'horloge sans
 *   rien écrire ;
 * - **l'archive compte comme le reste.** Une énigme est jugée sur tous ceux qui
 *   l'ont affrontée, le jour même ou trois semaines plus tard ; ce qui ne
 *   compte pas est ce qui n'a rien conclu ;
 * - **une énigme est nommée par `(date, position)`**, donc les deux autres
 *   positions du jour et la même position d'un autre jour sont deux façons de
 *   se tromper de tas.
 */
const TODAY = '2026-09-15'
const YESTERDAY = '2026-09-14'
const TOMORROW = '2026-09-16'

const SCHEDULABLE = [
  FOOTBALLER_IDS.complete,
  FOOTBALLER_IDS.untypedReserve,
  FOOTBALLER_IDS.loan,
]

const answerAt = (position: Position) => SCHEDULABLE[position - 1] ?? null
const WRONG = FOOTBALLER_IDS.incomplete

const schedule = async (date: string) =>
  await scheduleGrid({ date, theme: 'standard', footballerIds: SCHEDULABLE })

/** L'horloge que lisent les services. Toutes les dates ici sont des jours de Paris. */
function paris(date: string): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${date}T11:00:00Z`))
}

/** Ouvre une énigme — ce qui crée la partie, et rien de plus. */
const open = async (position: Position, date: string, playerId = PLAYER_IDS.mine) =>
  await getDayPlays({ playerId, date, open: position })

const tryOne = async (
  position: Position,
  footballerId: string | null,
  date: string,
  playerId = PLAYER_IDS.mine,
) => await submitTry({ playerId, date, position, footballerId })

/** Ouvre l'énigme et la trouve, après `errors` erreurs payées. */
async function solve(
  position: Position,
  date: string,
  errors = 0,
  playerId = PLAYER_IDS.mine,
): Promise<void> {
  await open(position, date, playerId)
  for (let i = 0; i < errors; i++) {
    // Espacés, sinon la fenêtre anti-double-clic avalerait le second essai.
    vi.advanceTimersByTime(5_000)
    await tryOne(position, WRONG, date, playerId)
  }
  vi.advanceTimersByTime(5_000)
  await tryOne(position, answerAt(position), date, playerId)
}

/** Ouvre l'énigme et y épuise les six essais. */
async function fail(position: Position, date: string, playerId = PLAYER_IDS.mine): Promise<void> {
  await open(position, date, playerId)
  for (let i = 0; i < 6; i++) {
    vi.advanceTimersByTime(5_000)
    await tryOne(position, WRONG, date, playerId)
  }
}

beforeEach(async () => {
  await seedCatalogue(db)
  await seedPlayers(db)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('une énigme que personne n’a jouée', () => {
  it('rend des zéros, et une journée sans grille aussi', async () => {
    await schedule(TODAY)
    paris(TODAY)

    const empty = { finishedCount: 0, solvedCount: 0, solvedByTries: [0, 0, 0, 0, 0, 0] }

    expect(await getEnigmaStats(TODAY, 1)).toEqual(empty)
    // Aucune grille ce jour-là : une absence, pas une erreur.
    expect(await getEnigmaStats('2026-01-01', 1)).toEqual(empty)
  })
})

describe('les parties comptées', () => {
  it('sont celles de tous les joueurs, rangées par nombre d’essais', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await solve(1, TODAY)
    await solve(1, TODAY, 2, PLAYER_IDS.other)

    expect(await getEnigmaStats(TODAY, 1)).toEqual({
      finishedCount: 2,
      solvedCount: 2,
      solvedByTries: [1, 0, 1, 0, 0, 0],
    })
  })

  it('ne sont pas celles des deux autres niveaux', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await solve(2, TODAY)
    await solve(3, TODAY)

    expect(await getEnigmaStats(TODAY, 1)).toMatchObject({ finishedCount: 0 })
    expect(await getEnigmaStats(TODAY, 2)).toMatchObject({ finishedCount: 1, solvedCount: 1 })
  })

  it('ne sont pas celles du même niveau d’un autre jour', async () => {
    await schedule(YESTERDAY)
    await schedule(TODAY)
    paris(YESTERDAY)
    await solve(1, YESTERDAY)
    paris(TODAY)

    expect(await getEnigmaStats(TODAY, 1)).toMatchObject({ finishedCount: 0 })
    expect(await getEnigmaStats(YESTERDAY, 1)).toMatchObject({ finishedCount: 1 })
  })

  it('comptent une partie perdue sur les six essais', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await fail(1, TODAY)

    expect(await getEnigmaStats(TODAY, 1)).toEqual({
      finishedCount: 1,
      solvedCount: 0,
      solvedByTries: [0, 0, 0, 0, 0, 0],
    })
  })
})

describe('une partie ouverte et laissée là', () => {
  it('ne compte pas tant que la grille est celle du jour', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await open(1, TODAY)

    // Elle se joue encore : la compter comme perdue ferait plonger le taux de
    // la grille du jour toute la matinée.
    expect(await getEnigmaStats(TODAY, 1)).toMatchObject({ finishedCount: 0, solvedCount: 0 })
  })

  it('devient un abandon dès que la grille a tourné, sans que rien ne l’écrive', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await open(1, TODAY)
    paris(TOMORROW)

    // Aucun job n'est passé entre les deux lectures : seule l'horloge a bougé.
    expect(await getEnigmaStats(TODAY, 1)).toMatchObject({ finishedCount: 1, solvedCount: 0 })
  })
})

describe('l’archive', () => {
  it('compte dans les chiffres de l’énigme, comme le jour même', async () => {
    await schedule(YESTERDAY)
    paris(YESTERDAY)
    await solve(1, YESTERDAY)

    paris(TODAY)
    // Hier est maintenant de l'archive : le mode se déduit de la date
    // (ADR-0016), et ce rejoueur-là a joué la même énigme que le premier.
    await solve(1, YESTERDAY, 2, PLAYER_IDS.other)

    expect(await getEnigmaStats(YESTERDAY, 1)).toEqual({
      finishedCount: 2,
      solvedCount: 2,
      solvedByTries: [1, 0, 1, 0, 0, 0],
    })
  })

  it('ne rend jamais une partie d’archive laissée ouverte', async () => {
    // Elle n'a pas de lendemain qui la change en abandon
    // (`server/domain/play.ts`) : elle se joue encore, et rien ne la conclut.
    await schedule(YESTERDAY)
    paris(TODAY)
    await open(1, YESTERDAY)

    expect(await getEnigmaStats(YESTERDAY, 1)).toMatchObject({ finishedCount: 0 })
  })
})
