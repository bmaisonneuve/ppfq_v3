import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, eq, sql } from 'drizzle-orm'

import { challengeItems, dailyChallenges, playerStats } from '@/server/db/schema'
import { TryRefusedError, getDayPlays, submitTry } from '@/server/services/play.service'
import { scheduleGrid } from '@/server/services/schedule.service'
import { getPlayerStats } from '@/server/services/stats.service'
import { successRatePercent } from '@/shared/stats'
import type { Position } from '@/shared/schedule'

import { db } from '@test/setup/db'
import { FOOTBALLER_IDS, seedCatalogue } from '@test/fixtures/catalogue'
import { PLAYER_IDS, seedPlayers } from '@test/fixtures/players'

/**
 * La fin de grille — série, carton plein, statistiques — contre un vrai
 * Postgres, et jouée par la seule porte qui existe : ouvrir une énigme, puis
 * proposer des footballeurs. Rien ici n'écrit un agrégat à la main, parce que
 * c'est justement l'écriture qui est en cause.
 *
 * Quatre propriétés portent le ticket :
 *
 * - **La série ne compte que le titulaire.** L'échauffement et la légende n'y
 *   entrent pas : « un joueur ne perd pas soixante jours de série sur une
 *   légende impossible » (specs §5).
 * - **Un jour manqué ramène la série affichée à zéro, et aucun job n'est
 *   passé.** C'est affirmé des deux côtés — la valeur lue *et* la ligne restée
 *   telle quelle — parce que « il n'y a pas de job » ne s'observe que comme une
 *   ligne que personne n'a touchée (`docs/modele-donnees.md` §5).
 * - **Le carton plein se calcule sur la grille entière**, et son compteur est
 *   indépendant de la série : trouver les trois n'avance pas la série deux
 *   fois, et une série tombée à zéro ne reprend pas un carton plein.
 * - **Les agrégats sont écrits dans la transaction qui termine la partie.** Il
 *   n'y a pas de réconciliation nocturne, donc un agrégat faux ne se répare pas
 *   tout seul : c'est une règle de jeu, et elle est affirmée sur la lecture qui
 *   suit immédiatement l'essai.
 */
const TODAY = '2026-09-09'
const YESTERDAY = '2026-09-08'
const TWO_DAYS_AGO = '2026-09-07'

/** Position 1, 2, 3 — l'échauffement, le titulaire, la légende. */
const SCHEDULABLE = [
  FOOTBALLER_IDS.complete,
  FOOTBALLER_IDS.untypedReserve,
  FOOTBALLER_IDS.loan,
]

/** Le footballeur qui est la réponse d'une position — ce qui la fait trouver. */
const answerAt = (position: Position) => SCHEDULABLE[position - 1] ?? null

/** Un footballeur du catalogue qui n'est la réponse d'aucune des trois. */
const WRONG = FOOTBALLER_IDS.incomplete

const schedule = async (date: string) =>
  await scheduleGrid({ date, theme: 'standard', footballerIds: SCHEDULABLE })

/** L'horloge que lisent les services. Toutes les dates ici sont des jours de Paris. */
function paris(date: string): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${date}T11:00:00Z`))
}

/** Ouvre une énigme — ce qui crée la partie, et ce qui la compte comme jouée. */
async function open(position: Position, date = TODAY, playerId = PLAYER_IDS.mine) {
  await getDayPlays({ playerId, date, open: position })
}

/** Un essai. `null` est un tour passé, et il coûte comme une erreur. */
async function tryOne(
  position: Position,
  footballerId: string | null,
  date = TODAY,
  playerId = PLAYER_IDS.mine,
) {
  return await submitTry({ playerId, date, position, footballerId })
}

/** Ouvre l'énigme et la trouve, après `errors` erreurs payées. */
async function solve(position: Position, date = TODAY, errors = 0): Promise<void> {
  await open(position, date)
  for (let i = 0; i < errors; i++) {
    // Espacés, sinon la fenêtre anti-double-clic avalerait le second essai.
    vi.advanceTimersByTime(5_000)
    await tryOne(position, WRONG, date)
  }
  vi.advanceTimersByTime(5_000)
  await tryOne(position, answerAt(position), date)
}

/** Ouvre l'énigme et y épuise les six essais. */
async function fail(position: Position, date = TODAY): Promise<void> {
  await open(position, date)
  for (let i = 0; i < 6; i++) {
    vi.advanceTimersByTime(5_000)
    await tryOne(position, WRONG, date)
  }
}

const mine = async () => await getPlayerStats(PLAYER_IDS.mine)

/** L'identité d'une énigme — ce qu'il faut pour en retirer une de la grille. */
async function enigmaId(date: string, position: Position): Promise<string> {
  const rows = await db
    .select({ id: challengeItems.id })
    .from(challengeItems)
    .innerJoin(dailyChallenges, eq(dailyChallenges.id, challengeItems.dailyChallengeId))
    .where(and(eq(dailyChallenges.date, date), eq(challengeItems.position, position)))

  const found = rows[0]
  if (found === undefined) throw new Error(`Aucune énigme en position ${position} du ${date}.`)
  return found.id
}

/** La ligne d'agrégat telle qu'elle dort en base — jamais ce que le joueur lit. */
async function storedStats(playerId = PLAYER_IDS.mine) {
  const rows = await db
    .select()
    .from(playerStats)
    .where(and(eq(playerStats.playerId, playerId), eq(playerStats.mode, 'daily')))

  return rows[0]
}

beforeEach(async () => {
  await seedCatalogue(db)
  await seedPlayers(db)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('un joueur qui n’a rien joué', () => {
  it('lit des statistiques vides plutôt que rien du tout', async () => {
    paris(TODAY)

    expect(await mine()).toEqual({
      playedCount: 0,
      solvedCount: 0,
      perfectChallenges: 0,
      serie: 0,
      bestSerie: 0,
      solvedByTries: [0, 0, 0, 0, 0, 0],
    })
  })

  it('n’a aucune ligne d’agrégat : la lire n’en crée pas', async () => {
    paris(TODAY)
    await mine()

    expect(await storedStats()).toBeUndefined()
  })
})

describe('les parties jouées', () => {
  it('comptent une partie ouverte et abandonnée', async () => {
    // Le critère qui sépare « jouée » de « terminée » : la partie naît à
    // l'ouverture, et l'abandon ne la retire pas du dénominateur.
    await schedule(TODAY)
    paris(TODAY)
    await open(1)

    expect(await mine()).toMatchObject({ playedCount: 1, solvedCount: 0 })
  })

  it('ne comptent qu’une fois une énigme ouverte deux fois', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await open(1)
    await open(1)

    expect(await mine()).toMatchObject({ playedCount: 1 })
  })

  it('comptent une partie perdue sur les six essais', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await fail(1)

    expect(await mine()).toMatchObject({ playedCount: 1, solvedCount: 0 })
  })

  it('ne comptent pas les parties de quelqu’un d’autre', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await open(1, TODAY, PLAYER_IDS.other)
    await open(2, TODAY, PLAYER_IDS.other)

    expect(await mine()).toMatchObject({ playedCount: 0 })
  })
})

describe('le taux de réussite et la répartition', () => {
  it('se lisent sur les parties jouées, abandons compris', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await solve(1, TODAY, 1)
    await open(2)
    await open(3)

    const stats = await mine()

    expect(stats).toMatchObject({ playedCount: 3, solvedCount: 1 })
    expect(successRatePercent(stats)).toBe(33)
  })

  it('rangent chaque réussite au nombre d’essais qu’elle a coûté', async () => {
    // Trouvé au 1ᵉʳ essai, au 3ᵉ, et une partie perdue qui n'entre pas dans la
    // répartition : c'est la répartition des *réussites* (specs §5).
    await schedule(TODAY)
    await schedule(YESTERDAY)

    paris(YESTERDAY)
    await solve(1, YESTERDAY, 0)
    await fail(2, YESTERDAY)

    paris(TODAY)
    await solve(1, TODAY, 2)

    expect((await mine()).solvedByTries).toEqual([1, 0, 1, 0, 0, 0])
  })
})

describe('la série', () => {
  // La règle entière, position par position : seul le titulaire la fait
  // avancer. « Un joueur ne perd pas soixante jours de série sur une légende
  // impossible » (specs §5) — et il n'en gagne pas un non plus.
  it.each([
    { position: 1, expected: 0 },
    { position: 2, expected: 1 },
    { position: 3, expected: 0 },
  ])('vaut $expected quand la position $position est trouvée', async ({ position, expected }) => {
    await schedule(TODAY)
    paris(TODAY)
    await solve(position as Position)

    expect(await mine()).toMatchObject({ serie: expected, bestSerie: expected })
  })

  it('compte les jours consécutifs, et pas les titulaires trouvés', async () => {
    await schedule(YESTERDAY)
    await schedule(TODAY)

    paris(YESTERDAY)
    await solve(2, YESTERDAY)
    paris(TODAY)
    await solve(2, TODAY)

    expect(await mine()).toMatchObject({ serie: 2, bestSerie: 2 })
  })

  it('n’avance qu’une fois sur une grille dont les trois sont trouvées', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await solve(1)
    await solve(2)
    await solve(3)

    expect(await mine()).toMatchObject({ serie: 1 })
  })

  it('tombe à zéro à la lecture après un jour manqué', async () => {
    await schedule(TWO_DAYS_AGO)
    paris(TWO_DAYS_AGO)
    await solve(2, TWO_DAYS_AGO)

    paris(TODAY)

    expect(await mine()).toMatchObject({ serie: 0 })
  })

  it('tient encore le lendemain : la grille du jour n’est pas jouée à minuit', async () => {
    await schedule(YESTERDAY)
    paris(YESTERDAY)
    await solve(2, YESTERDAY)

    paris(TODAY)

    expect(await mine()).toMatchObject({ serie: 1 })
  })

  it('laisse la ligne intacte quand elle tombe : aucun job n’est passé', async () => {
    // « Il n'y a pas de job » ne s'observe que comme ça : la valeur affichée
    // est zéro, et la valeur stockée est restée celle du dernier titulaire.
    await schedule(TWO_DAYS_AGO)
    paris(TWO_DAYS_AGO)
    await solve(2, TWO_DAYS_AGO)

    paris(TODAY)
    await mine()

    expect(await storedStats()).toMatchObject({
      currentStreak: 1,
      lastSolvedChallenge: TWO_DAYS_AGO,
    })
  })

  it('garde la meilleure série qu’une absence a interrompue', async () => {
    await schedule(TWO_DAYS_AGO)
    await schedule(YESTERDAY)
    await schedule(TODAY)

    paris(TWO_DAYS_AGO)
    await solve(2, TWO_DAYS_AGO)
    paris(YESTERDAY)
    await solve(2, YESTERDAY)

    // Le titulaire d'aujourd'hui reste à trouver : la série de deux jours est
    // encore lisible, et la meilleure ne bougera plus.
    paris(TODAY)
    expect(await mine()).toMatchObject({ serie: 2, bestSerie: 2 })
  })
})

describe('le carton plein', () => {
  it('se compte sur la grille entière', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await solve(1)
    await solve(2)
    await solve(3)

    expect(await mine()).toMatchObject({ perfectChallenges: 1, solvedCount: 3 })
  })

  it('ne se compte pas sur deux énigmes trouvées sur trois', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await solve(1)
    await solve(2)
    await fail(3)

    expect(await mine()).toMatchObject({ perfectChallenges: 0 })
  })

  it('ne se compte qu’une fois par grille', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await solve(3)
    await solve(1)
    await solve(2)

    expect(await mine()).toMatchObject({ perfectChallenges: 1 })
  })

  it('est indépendant de la série : elle tombe, il reste', async () => {
    await schedule(TWO_DAYS_AGO)
    paris(TWO_DAYS_AGO)
    await solve(1, TWO_DAYS_AGO)
    await solve(2, TWO_DAYS_AGO)
    await solve(3, TWO_DAYS_AGO)

    paris(TODAY)

    expect(await mine()).toMatchObject({ perfectChallenges: 1, serie: 0 })
  })

  it('ne se donne pas sur une grille à qui il manque une énigme', async () => {
    // Une grille malformée : l'écran de programmation en écrit toujours trois,
    // et une ligne supprimée à la main en laisse deux. « Trouver les trois
    // footballeurs du jour » (specs §5) — en trouver deux sur deux n'est pas un
    // carton plein, et ce compteur-là, le joueur le voit.
    await schedule(TODAY)
    await db
      .delete(challengeItems)
      .where(eq(challengeItems.id, await enigmaId(TODAY, 3)))

    paris(TODAY)
    await solve(1)
    await solve(2)

    expect(await mine()).toMatchObject({ solvedCount: 2, perfectChallenges: 0 })
  })

  it('ne se perd pas entre deux énigmes terminées en même temps', async () => {
    // Deux onglets, ou la file du client contournée. Sans le verrou pris sur la
    // ligne d'agrégat, chaque transaction compterait les énigmes résolues sans
    // voir ce que l'autre vient d'écrire : chacune en verrait deux sur trois, et
    // le carton plein tomberait entre les deux (ADR-0013).
    await schedule(TODAY)
    paris(TODAY)
    for (const position of [1, 2, 3] as const) await open(position)
    vi.advanceTimersByTime(5_000)
    await tryOne(1, answerAt(1))

    await Promise.all([tryOne(2, answerAt(2)), tryOne(3, answerAt(3))])

    expect(await mine()).toMatchObject({ solvedCount: 3, perfectChallenges: 1 })
  })

  it('ne compte pas une grille dont un carton plein appartient à un autre', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await solve(1)
    await solve(2)
    await open(3, TODAY, PLAYER_IDS.other)
    await tryOne(3, answerAt(3), TODAY, PLAYER_IDS.other)

    expect(await mine()).toMatchObject({ perfectChallenges: 0 })
  })
})

describe('les agrégats sont écrits par la partie elle-même', () => {
  it('sont à jour dès que l’essai qui termine la partie a répondu', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await open(2)
    vi.advanceTimersByTime(5_000)

    const play = await tryOne(2, answerAt(2))

    expect(play.status).toBe('solved')
    expect(await mine()).toMatchObject({ solvedCount: 1, serie: 1 })
  })

  it('ne bougent pas sur un essai qui ne termine rien', async () => {
    await schedule(TODAY)
    paris(TODAY)
    await open(2)
    vi.advanceTimersByTime(5_000)
    await tryOne(2, WRONG)

    expect(await mine()).toMatchObject({ playedCount: 1, solvedCount: 0, serie: 0 })
  })

  it('ne recomptent rien sur un essai refusé après la fin de la partie', async () => {
    // Le double-clic sur l'essai qui trouve n'arrive jamais jusqu'à la fenêtre
    // des deux secondes : la partie est terminée, donc le service refuse avant
    // de regarder. C'est ce refus qui protège l'agrégat, et il est ici parce
    // qu'un refus qui compterait quand même serait invisible côté client.
    await schedule(TODAY)
    paris(TODAY)
    await open(2)
    vi.advanceTimersByTime(5_000)
    await tryOne(2, answerAt(2))

    await expect(tryOne(2, answerAt(2))).rejects.toThrow(TryRefusedError)
    expect(await mine()).toMatchObject({ solvedCount: 1, serie: 1 })
  })
})

/**
 * La reprise du jour où la table apparaît — `drizzle/0011_backfill_player_stats.sql`.
 *
 * C'est la **seule** réconciliation que le modèle autorise, celle du moment où
 * l'agrégat commence à exister (`docs/modele-donnees.md` §5, ADR-0013). Sans
 * elle, un joueur qui avait des parties en cours partirait à `played_count = 0`
 * pendant que sa première réussite ferait `solved_count = 1` : un taux de
 * réussite au-dessus de 100 %, que rien ne viendrait réparer.
 *
 * La propriété affirmée ici est la seule qui vaille, et elle n'est pas
 * tautologique : **la reconstruction doit retrouver exactement ce que le jeu
 * avait écrit**. On fait donc jouer les services, on jette la ligne, on rejoue
 * le vrai fichier SQL livré — pas une requête réécrite pour le test — et les
 * deux chemins doivent tomber d'accord, compteur par compteur.
 */
describe('la reprise des parties antérieures à la table', () => {
  const backfill = async () => {
    const file = join(process.cwd(), 'drizzle', '0011_backfill_player_stats.sql')
    await db.execute(sql.raw(await readFile(file, 'utf8')))
  }

  it('retrouve ce que le jeu avait compté lui-même', async () => {
    await schedule(TWO_DAYS_AGO)
    await schedule(YESTERDAY)
    await schedule(TODAY)

    // Une histoire qui touche les quatre compteurs : un carton plein, une série
    // de deux jours, une partie perdue et une partie ouverte puis laissée.
    paris(TWO_DAYS_AGO)
    await solve(1, TWO_DAYS_AGO)
    await solve(2, TWO_DAYS_AGO)
    await solve(3, TWO_DAYS_AGO)

    paris(YESTERDAY)
    await solve(2, YESTERDAY, 2)
    await fail(1, YESTERDAY)

    paris(TODAY)
    await open(3)

    const written = await storedStats()
    await db.delete(playerStats)
    await backfill()

    const rebuilt = await storedStats()
    expect(rebuilt).toMatchObject({
      playedCount: written?.playedCount,
      solvedCount: written?.solvedCount,
      perfectChallenges: written?.perfectChallenges,
      currentStreak: written?.currentStreak,
      bestStreak: written?.bestStreak,
      lastSolvedChallenge: written?.lastSolvedChallenge,
    })
    // Et ce que le jeu avait écrit était bien ça, sinon les deux se tromperaient
    // ensemble : 6 parties, 4 réussites, 1 carton plein, 2 jours de série.
    expect(written).toMatchObject({
      playedCount: 6,
      solvedCount: 4,
      perfectChallenges: 1,
      currentStreak: 2,
      bestStreak: 2,
      lastSolvedChallenge: YESTERDAY,
    })
  })

  it('ne touche pas une ligne que le jeu a déjà écrite', async () => {
    // Le jeu a raison contre une reconstruction : la migration n'écrase rien.
    await schedule(TODAY)
    paris(TODAY)
    await solve(2)

    await backfill()

    expect(await storedStats()).toMatchObject({ playedCount: 1, solvedCount: 1, currentStreak: 1 })
  })

  it('ne crée aucune ligne quand personne n’a jamais rien ouvert', async () => {
    paris(TODAY)
    await backfill()

    expect(await storedStats()).toBeUndefined()
  })
})
