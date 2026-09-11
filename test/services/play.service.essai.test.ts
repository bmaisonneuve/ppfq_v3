import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'

import { playerProgress } from '@/server/db/schema'
import { TryRefusedError, getDayPlays, submitTry } from '@/server/services/play.service'
import { scheduleGrid } from '@/server/services/schedule.service'
import { DOUBLE_SUBMIT_MS, MAX_TRIES } from '@/shared/play'
import type { EnigmaPlay } from '@/shared/play'
import type { Position } from '@/shared/schedule'

import { db } from '@test/setup/db'
import { FOOTBALLER_IDS, seedCatalogue } from '@test/fixtures/catalogue'
import { PLAYER_IDS, seedPlayers } from '@test/fixtures/players'

/**
 * L'essai, against a real Postgres — the heart of the game.
 *
 * The constraint the whole ticket exists for is asserted on **every** answer
 * this file produces and not in one test of its own: la réponse ne sort jamais
 * du serveur avant la fin (specs §10.1). `play()` below checks it on the way
 * past, so a leak anywhere fails here whatever the test was about.
 *
 * The rest is the mechanics, and three of them are easy to get subtly wrong:
 *
 * - **Une erreur dévoile exactement un indice, le suivant.** Not the five in a
 *   block, which would name the footballer to anyone with a network tab open.
 * - **Le doublon coûte un essai, le double-clic n'en coûte pas.** Two
 *   mechanisms that look alike and are opposites (`docs/stack-technique.md` §4).
 * - **Passer emprunte le chemin d'une erreur.** Same cost, same hint, no
 *   `skips_used` column to tell them apart afterwards.
 */
const TODAY = '2026-09-09'
const YESTERDAY = '2026-09-08'

/** Position 1 is Zidane; position 2 is somebody else entirely. */
const SCHEDULABLE = [
  FOOTBALLER_IDS.complete,
  FOOTBALLER_IDS.untypedReserve,
  FOOTBALLER_IDS.loan,
]

/** The name at position 1 — what must never appear before the end. */
const ANSWER = 'Zinedine Zidane'

const schedule = async (date: string) =>
  await scheduleGrid({ date, theme: 'standard', footballerIds: SCHEDULABLE })

/** The clock the service reads. Every date in this file is a Paris date. */
function paris(date: string): void {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${date}T11:00:00Z`))
}

/** A day scheduled, the clock set to it, and the enigma at `position` opened. */
async function opened(position: Position = 1): Promise<void> {
  await schedule(TODAY)
  paris(TODAY)
  await getDayPlays({ playerId: PLAYER_IDS.mine, date: TODAY, open: position })
}

/**
 * One essai — and the guard that runs on every answer of this file.
 *
 * The answer is allowed to name the footballer only once the partie is over.
 * Asserting it here rather than in a test of its own is deliberate: a leak
 * introduced by any change, in any of the cases below, fails immediately and
 * with the case that produced it.
 */
async function play(
  footballerId: string | null,
  over: { position?: Position; date?: string } = {},
): Promise<EnigmaPlay> {
  const result = await submitTry({
    playerId: PLAYER_IDS.mine,
    date: TODAY,
    position: 1,
    footballerId,
    ...over,
  })

  if (result.status === 'in_progress') {
    expect(JSON.stringify(result)).not.toContain(ANSWER)
    expect(result.answer).toBeNull()
  }

  return result
}

/**
 * A wrong footballer, a few seconds after whatever came before.
 *
 * The wait is the test being honest about what it is doing: the clock is frozen
 * here, and two identical propositions at the same instant are a double-clic,
 * which costs nothing on purpose. A joueur making six erreurs makes them
 * seconds apart. The tests that *are* about the double-clic call `again` below.
 */
const wrong = async (over?: { position?: Position }) => {
  vi.advanceTimersByTime(5_000)
  return await play(FOOTBALLER_IDS.duplicatePassage, over)
}

/** The same proposition, at whatever instant the clock is at. */
const again = async () => await play(FOOTBALLER_IDS.duplicatePassage)

/** Passer son tour: a proposition of nobody, a few seconds later. */
const skip = async () => {
  vi.advanceTimersByTime(5_000)
  return await play(null)
}

/** Passer again, at whatever instant the clock is at. */
const skipAgain = async () => await play(null)

/** The tiers a partie has been shown, in order. */
const tiers = (result: EnigmaPlay) => result.hints.map((hint) => hint.tier)

beforeEach(async () => {
  await seedCatalogue(db)
  await seedPlayers(db)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('an essai that is wrong', () => {
  it('spends one essai and reveals one hint', async () => {
    await opened()

    const result = await wrong()

    expect(result).toMatchObject({ position: 1, triesUsed: 1, status: 'in_progress' })
    expect(tiers(result)).toEqual([1])
  })

  it('reveals exactly one more hint per erreur, and never one more', async () => {
    // The first constraint of the specs read from the other end: sending the
    // five tiers in a block would name the footballer to anyone who opens a
    // network tab.
    await opened()

    expect(tiers(await wrong())).toEqual([1])
    expect(tiers(await wrong())).toEqual([1, 2])
    expect(tiers(await wrong())).toEqual([1, 2, 3])
    expect(tiers(await wrong())).toEqual([1, 2, 3, 4])
    expect(tiers(await wrong())).toEqual([1, 2, 3, 4, 5])
  })

  it('reveals the tiers in the order the specs fix', async () => {
    // Décennie, durée par club, nationalité, matchs en championnat, buts en
    // championnat (specs §3). The order is the game.
    await opened()
    for (let i = 0; i < 4; i++) await wrong()

    const result = await wrong()

    expect(result.hints).toEqual([
      { tier: 1, decade: 1980 },
      {
        tier: 2,
        durations: [
          { clubName: 'AS Cannes', figure: 5 },
          { clubName: 'Girondins de Bordeaux', figure: 5 },
          { clubName: 'Juventus', figure: 6 },
          { clubName: 'Real Madrid', figure: 6 },
        ],
      },
      { tier: 3, nationality: { frName: 'France', flagKey: expect.any(String) as string } },
      {
        tier: 4,
        matches: [
          { clubName: 'AS Cannes', figure: 61 },
          { clubName: 'Girondins de Bordeaux', figure: 139 },
          { clubName: 'Juventus', figure: 151 },
          { clubName: 'Real Madrid', figure: 155 },
        ],
      },
      {
        tier: 5,
        goals: [
          { clubName: 'AS Cannes', figure: 6 },
          { clubName: 'Girondins de Bordeaux', figure: 28 },
          { clubName: 'Juventus', figure: 24 },
          { clubName: 'Real Madrid', figure: 37 },
        ],
      },
    ])
  })

  it('says nothing about the footballer beyond the tier it reveals', async () => {
    await opened()

    const result = await wrong()

    expect(JSON.stringify(result)).not.toContain(ANSWER)
    // Tier 1 gives a decade, never a year: the years would hand over far more.
    expect(JSON.stringify(result)).not.toContain('1988')
  })
})

describe('the sixth erreur', () => {
  it('ends the partie and reveals the answer', async () => {
    await opened()
    for (let i = 0; i < MAX_TRIES - 1; i++) await wrong()

    const result = await wrong()

    expect(result).toMatchObject({ triesUsed: MAX_TRIES, status: 'failed', answer: ANSWER })
  })

  it('gives no sixth hint: there are five tiers for six essais', async () => {
    await opened()
    for (let i = 0; i < MAX_TRIES; i++) await wrong()

    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: TODAY })

    expect(day.plays[0]?.hints.map((hint) => hint.tier)).toEqual([1, 2, 3, 4, 5])
  })

  it('closes the partie in the database, and only then', async () => {
    await opened()
    for (let i = 0; i < MAX_TRIES - 1; i++) await wrong()

    const [before] = await db.select().from(playerProgress)
    expect(before?.finishedAt).toBeNull()

    await wrong()

    const [after] = await db.select().from(playerProgress)
    expect(after).toMatchObject({ status: 'failed', triesUsed: MAX_TRIES })
    expect(after?.finishedAt).not.toBeNull()
  })

  it('refuses the seventh essai', async () => {
    await opened()
    for (let i = 0; i < MAX_TRIES; i++) await wrong()

    await expect(wrong()).rejects.toThrow(TryRefusedError)

    const [partie] = await db.select().from(playerProgress)
    expect(partie?.triesUsed).toBe(MAX_TRIES)
  })
})

describe('an essai that is right', () => {
  it('ends the partie and gives the name', async () => {
    await opened()

    const result = await play(FOOTBALLER_IDS.complete)

    expect(result).toMatchObject({ triesUsed: 1, status: 'solved', answer: ANSWER })
  })

  it('does not spend a hint on the essai that found it', async () => {
    // Found on the second essai is one erreur, therefore one hint. Counting the
    // winning essai would give a tier away for getting it right.
    await opened()
    await wrong()

    const result = await play(FOOTBALLER_IDS.complete)

    expect(result.triesUsed).toBe(2)
    expect(tiers(result)).toEqual([1])
  })

  it('is refused afterwards: a partie found is finished', async () => {
    await opened()
    await play(FOOTBALLER_IDS.complete)

    await expect(wrong()).rejects.toThrow(TryRefusedError)
  })

  it('compares against the footballer of that position and no other', async () => {
    // Position 2 is a different enigma. Proposing its footballer at position 1
    // is an ordinary erreur.
    await opened()

    const result = await play(FOOTBALLER_IDS.untypedReserve)

    expect(result.status).toBe('in_progress')
  })
})

describe('passer son tour', () => {
  it('consumes an essai and reveals the next hint, exactly like an erreur', async () => {
    await opened()

    const result = await skip()

    expect(result).toMatchObject({ triesUsed: 1, status: 'in_progress' })
    expect(tiers(result)).toEqual([1])
  })

  it('is indistinguishable from an erreur once it is stored', async () => {
    // There is no `skips_used` column and there must not be one: everything
    // consumes an essai, and the row says only how many (specs §3).
    await opened()
    await skip()
    await wrong()

    const [partie] = await db.select().from(playerProgress)
    expect(partie?.triesUsed).toBe(2)
  })

  it('can lose the partie on its own', async () => {
    await opened()
    for (let i = 0; i < MAX_TRIES - 1; i++) await skip()

    const result = await skip()

    expect(result).toMatchObject({ status: 'failed', answer: ANSWER })
  })
})

describe('a footballer already proposed', () => {
  it('consumes an essai, like any other (specs §10)', async () => {
    await opened()
    await wrong()

    // The same footballer again, far enough apart to be two clicks rather than
    // one sent twice. Nothing is looked up against what was already tried: the
    // rule is that it costs, so there is nothing to look up.
    const result = await wrong()

    expect(result.triesUsed).toBe(2)
    expect(tiers(result)).toEqual([1, 2])
  })
})

describe('the double-clic, which is not the doublon', () => {
  it('costs nothing when the same proposition arrives inside two seconds', async () => {
    // A technical protection and not a game rule: one click the browser sent
    // twice. It became a real risk the day the doublon started costing.
    await opened()
    const first = await wrong()

    vi.advanceTimersByTime(500)
    const second = await again()

    expect(second.triesUsed).toBe(first.triesUsed)
    expect(second).toEqual(first)
  })

  it('costs an essai once the two seconds have passed', async () => {
    await opened()
    await wrong()

    vi.advanceTimersByTime(DOUBLE_SUBMIT_MS)
    const result = await again()

    expect(result.triesUsed).toBe(2)
  })

  it('lets a different footballer through inside the window', async () => {
    // The window catches a repeated click, never a second real essai.
    await opened()
    await wrong()

    vi.advanceTimersByTime(100)
    const result = await play(FOOTBALLER_IDS.incomplete)

    expect(result.triesUsed).toBe(2)
  })

  it('catches a double-clic on « passer » too', async () => {
    // A tour passé is stored as a proposition of nobody, so one window covers
    // both gestures — the column is nullable and this is what for.
    await opened()
    await skip()

    vi.advanceTimersByTime(500)
    const result = await skipAgain()

    expect(result.triesUsed).toBe(1)
  })

  it('does not swallow the very first essai', async () => {
    // `last_guess_at` is null on a fresh partie, and null must not read as
    // "just now".
    await opened()

    expect((await skip()).triesUsed).toBe(1)
  })

  it('writes the proposition and its instant, which is what the window reads', async () => {
    await opened()
    await wrong()

    const [partie] = await db.select().from(playerProgress)
    expect(partie?.lastGuessFootballerId).toBe(FOOTBALLER_IDS.duplicatePassage)
    expect(partie?.lastGuessAt).not.toBeNull()
  })
})

describe('an essai the service refuses', () => {
  it('refuses one on an enigma that was never opened', async () => {
    // The fold is what creates the partie (`docs/modele-donnees.md` §4), so an
    // essai before it is a client bug and not a move.
    await opened(1)

    await expect(wrong({ position: 2 })).rejects.toMatchObject({ reason: 'not-open' })
  })

  it('refuses one on a position the grid does not have', async () => {
    paris(TODAY)

    await expect(wrong()).rejects.toMatchObject({ reason: 'no-enigma' })
  })

  it('refuses one on a grid that is no longer the grid of the day', async () => {
    // Read as failed by the clock (`server/domain/play.ts`), so it is over —
    // the same refusal as the seventh essai, by the same rule.
    await schedule(YESTERDAY)
    paris(YESTERDAY)
    await getDayPlays({ playerId: PLAYER_IDS.mine, date: YESTERDAY, open: 1 })

    paris(TODAY)
    await expect(
      submitTry({
        playerId: PLAYER_IDS.mine,
        date: YESTERDAY,
        position: 1,
        footballerId: FOOTBALLER_IDS.duplicatePassage,
      }),
    ).rejects.toMatchObject({ reason: 'over' })
  })

  it('writes nothing when it refuses', async () => {
    await opened()
    await play(FOOTBALLER_IDS.complete)

    await expect(wrong()).rejects.toThrow(TryRefusedError)

    const [partie] = await db.select().from(playerProgress)
    expect(partie?.triesUsed).toBe(1)
  })
})

describe('essais that race each other', () => {
  it('spends one essai for one click, however many requests it became', async () => {
    // A double-clic that got through, a retry, a second tab submitting the same
    // proposition. Two mechanisms cover it between them: the compare-and-set
    // catches what read the partie before the first write, and the two-second
    // window catches what read it after — the loser goes round again and
    // recognises its own proposition.
    await opened()

    await Promise.all(Array.from({ length: 8 }, async () => await again()))

    const [partie] = await db.select().from(playerProgress)
    expect(partie?.triesUsed).toBe(1)
  })

  it('spends an essai for every genuinely different proposition', async () => {
    // The other side of the same guard, and the one that would go unnoticed:
    // « tout consomme un essai » (specs §10). Three propositions of three
    // different footballers arriving together are three essais, not one — the
    // two that lose the row must go round again rather than report the winner's
    // move as their own.
    await opened()

    await Promise.all([
      play(FOOTBALLER_IDS.duplicatePassage),
      play(FOOTBALLER_IDS.incomplete),
      play(FOOTBALLER_IDS.loan),
    ])

    const [partie] = await db.select().from(playerProgress)
    expect(partie?.triesUsed).toBe(3)
  })

  it('never spends more than the six essais there are', async () => {
    await opened()

    for (let i = 0; i < MAX_TRIES; i++) await wrong()
    await Promise.all(
      Array.from({ length: 4 }, async () => await again().catch(() => null)),
    )

    const [partie] = await db.select().from(playerProgress)
    expect(partie?.triesUsed).toBe(MAX_TRIES)
    expect(partie?.status).toBe('failed')
  })
})

describe('what a reload finds', () => {
  it('gives back the hints already revealed, whole and in order', async () => {
    // « Les informations dévoilées restent affichées jusqu'à la fin de la
    // partie » (specs §3) — and the page they were on is thrown away on every
    // refresh, so they have to come back over the state request.
    await opened()
    await wrong()
    await wrong()

    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: TODAY })

    expect(day.plays[0]?.hints.map((hint) => hint.tier)).toEqual([1, 2])
  })

  it('still says nothing about the footballer while the partie is playable', async () => {
    await opened()
    await wrong()

    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: TODAY })

    expect(JSON.stringify(day)).not.toContain(ANSWER)
    expect(day.plays[0]?.answer).toBeNull()
  })

  it('gives the answer back once the partie is over', async () => {
    await opened()
    await play(FOOTBALLER_IDS.complete)

    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: TODAY })

    expect(day.plays[0]).toMatchObject({ status: 'solved', answer: ANSWER })
  })

  it('says nothing about an enigma just opened, and reads no catalogue for it', async () => {
    // The common case at the minute of the peak: a partie with nothing spent
    // has no hint and no answer, so the footballer is never read.
    await opened()

    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: TODAY })

    expect(day.plays).toEqual([
      { position: 1, triesUsed: 0, status: 'in_progress', hints: [], answer: null },
    ])
  })

  it('reveals the answer of a partie the day took away', async () => {
    // Read as failed, therefore over, therefore no longer a secret — and the
    // row is still untouched, as `play.service.test.ts` asserts.
    await schedule(YESTERDAY)
    paris(YESTERDAY)
    await getDayPlays({ playerId: PLAYER_IDS.mine, date: YESTERDAY, open: 1 })

    paris(TODAY)
    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: YESTERDAY })

    expect(day.plays[0]).toMatchObject({ status: 'failed', answer: ANSWER })
  })

  it('never gives another joueur’s partie away', async () => {
    await opened()
    await wrong()

    await getDayPlays({ playerId: PLAYER_IDS.other, date: TODAY, open: 1 })
    const day = await getDayPlays({ playerId: PLAYER_IDS.other, date: TODAY })

    expect(day.plays).toEqual([
      { position: 1, triesUsed: 0, status: 'in_progress', hints: [], answer: null },
    ])
  })
})

describe('a partie left with an essai spent', () => {
  it('keeps its count across an enigma reopened', async () => {
    await opened()
    await wrong()

    const day = await getDayPlays({ playerId: PLAYER_IDS.mine, date: TODAY, open: 1 })

    expect(day.plays[0]?.triesUsed).toBe(1)
  })

  it('is not restarted by the open of another enigma', async () => {
    await opened()
    await wrong()

    await getDayPlays({ playerId: PLAYER_IDS.mine, date: TODAY, open: 2 })

    const [mine] = await db
      .select()
      .from(playerProgress)
      .where(eq(playerProgress.playerId, PLAYER_IDS.mine))
      .orderBy(playerProgress.triesUsed)

    expect(mine).toMatchObject({ triesUsed: 0 })
  })
})
