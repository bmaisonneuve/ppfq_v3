import { beforeEach, describe, expect, it } from 'vitest'

import { footballers } from '@/server/db/schema'
import { getFootballerCareer } from '@/server/services/catalogue.service'

import { db } from '@test/setup/db'
import {
  CLUB_IDS,
  FOOTBALLER_IDS,
  PASSAGE_IDS,
  seedCatalogue,
} from '@test/fixtures/catalogue'

describe('getFootballerCareer', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('returns null for a footballer who is not in the catalogue', async () => {
    expect(await getFootballerCareer('00000000-0000-4000-8000-000000009999')).toBeNull()
  })

  it('reads a curated career with its nationality and its passages', async () => {
    const career = await getFootballerCareer(FOOTBALLER_IDS.complete)

    expect(career).not.toBeNull()
    expect(career?.name).toBe('Zinedine Zidane')
    expect(career?.wikiFrUrl).toBe('https://fr.wikipedia.org/wiki/Zinedine_Zidane')
    expect(career?.nationality).toEqual({
      id: expect.any(String),
      code: 'FR',
      frName: 'France',
      flagS3Key: 'flags/fr.svg',
    })
    expect(career?.playerClubs.map((p) => p.clubName)).toEqual([
      'AS Cannes',
      'Girondins de Bordeaux',
      'Juventus',
      'Real Madrid',
    ])
    expect(career?.playerClubs.map((p) => [p.matches, p.goals])).toEqual([
      [61, 6],
      [139, 28],
      [151, 24],
      [155, 37],
    ])
  })

  it('returns a footballer with no nationality rather than hiding him', async () => {
    // He is simply not schedulable — that is the scheduling check's business.
    const career = await getFootballerCareer(FOOTBALLER_IDS.incomplete)

    expect(career?.nationality).toBeNull()
    expect(career?.playerClubs).toHaveLength(2)
  })

  it('keeps a passage whose matches and goals are missing', async () => {
    const career = await getFootballerCareer(FOOTBALLER_IDS.incomplete)
    const nantes = career?.playerClubs.find((p) => p.clubName === 'FC Nantes')

    expect(nantes).toMatchObject({ matches: null, goals: null })
  })

  it('orders a loan before the parent contract it overlaps', async () => {
    const career = await getFootballerCareer(FOOTBALLER_IDS.loan)

    expect(career?.playerClubs.map((p) => [p.clubName, p.isLoan])).toEqual([
      ['Stade de Reims', true],
      ['Olympique lyonnais', false],
    ])
  })

  it('puts a spell still in progress last', async () => {
    const career = await getFootballerCareer(FOOTBALLER_IDS.untypedReserve)

    expect(career?.playerClubs.map((p) => [p.clubName, p.endYear])).toEqual([
      ['FC Barcelone C', 2020],
      ['Levante UD', null],
    ])
  })

  it('shows an untyped reserve team as an ordinary club', async () => {
    // Expected behaviour, not a bug: the source does not type it, so it enters
    // the catalogue and an admin removes it by hand.
    const career = await getFootballerCareer(FOOTBALLER_IDS.untypedReserve)

    expect(career?.playerClubs[0]).toMatchObject({
      clubId: CLUB_IDS.barcelonaC,
      clubName: 'FC Barcelone C',
      isLoan: false,
    })
  })

  it('shows a duplicated passage twice, exactly like a genuine second spell', async () => {
    // Nothing here can tell the two apart. De-duplication happens at import.
    const career = await getFootballerCareer(FOOTBALLER_IDS.duplicatePassage)

    expect(career?.playerClubs.map((p) => p.clubName)).toEqual([
      'Stade rennais',
      'Stade rennais',
    ])
  })

  it('orders two identical passages the same way on every read', async () => {
    // The sequence of clubs is part of the enigma: it must not shuffle between
    // two page loads. `id` is the final tie-breaker.
    const first = await getFootballerCareer(FOOTBALLER_IDS.duplicatePassage)
    const second = await getFootballerCareer(FOOTBALLER_IDS.duplicatePassage)

    expect(first?.playerClubs.map((p) => p.id)).toEqual([
      PASSAGE_IDS.duplicateFirst,
      PASSAGE_IDS.duplicateSecond,
    ])
    expect(second?.playerClubs.map((p) => p.id)).toEqual(
      first?.playerClubs.map((p) => p.id),
    )
  })

  it('returns an empty career for a footballer nobody has curated yet', async () => {
    // "Curated" is not a status: it is the fact of having passages.
    const [inserted] = await db
      .insert(footballers)
      .values({ name: 'Anonyme Non Curé', sitelinks: 0 })
      .returning({ id: footballers.id })

    const career = await getFootballerCareer(inserted!.id)

    expect(career).not.toBeNull()
    expect(career?.playerClubs).toEqual([])
  })
})
