import { beforeEach, describe, expect, it } from 'vitest'

import { clubs, footballers, jobRuns, playerClubs } from '@/server/db/schema'
import { ClubNotFoundError } from '@/server/services/club.service'
import {
  FootballerNotFoundError,
  PassageNotFoundError,
  addPassage,
  deletePassage,
  getCurationDossier,
  listNationalities,
  setFootballerNationality,
  updatePassage,
} from '@/server/services/curation.service'
import { CAREER_IMPORT_JOB } from '@/server/services/job-runs.service'

import { db, onlyRow } from '@test/setup/db'
import {
  CLUB_IDS,
  FOOTBALLER_IDS,
  NATIONALITY_IDS,
  PASSAGE_IDS,
  seedCatalogue,
} from '@test/fixtures/catalogue'

/**
 * The curation seam: the screen the admin uses every day, called the way the
 * screen calls it, against a real Postgres.
 *
 * The screen itself is not tested (specs: "l'admin au-delà de ses services"),
 * and the admin gate is not here either — it is a guard rail of its own, in
 * `test/architecture/admin-guard.test.ts`.
 */

const UNKNOWN_ID = '00000000-0000-4000-8000-000000009999'

describe('getCurationDossier', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('returns nothing for a footballer who is not in the referential', async () => {
    expect(await getCurationDossier(UNKNOWN_ID)).toBeNull()
  })

  it('shows a curated parcours in career order, with what the admin needs to check it', async () => {
    const dossier = await getCurationDossier(FOOTBALLER_IDS.complete)

    expect(dossier).toMatchObject({
      name: 'Zinedine Zidane',
      wikidataQid: 'Q1835',
      // The link opened on every curation: the only guard against a parcours
      // that is complete and false by omission.
      wikiFrUrl: 'https://fr.wikipedia.org/wiki/Zinedine_Zidane',
    })
    expect(dossier?.nationality).toMatchObject({ code: 'FR', frName: 'France' })
    expect(dossier?.passages.map((p) => p.clubName)).toEqual([
      'AS Cannes',
      'Girondins de Bordeaux',
      'Juventus',
      'Real Madrid',
    ])
  })

  it('flags nothing on a parcours the source got right', async () => {
    const dossier = await getCurationDossier(FOOTBALLER_IDS.complete)

    expect(dossier?.passages.flatMap((p) => p.flags)).toEqual([])
  })

  it('pre-flags a reserve team by its label, and never removes it', async () => {
    // The measured weak point: the source types "FC Barcelone C" as an ordinary
    // senior club. Reading the dossier must leave the row where it is — the
    // flag is for the admin's eye, and he is the one who deletes.
    const first = await getCurationDossier(FOOTBALLER_IDS.untypedReserve)
    expect(first?.passages[0]).toMatchObject({
      clubName: 'FC Barcelone C',
      flags: ['likely-reserve'],
    })

    const rows = await db.select({ id: playerClubs.id }).from(playerClubs)
    const second = await getCurationDossier(FOOTBALLER_IDS.untypedReserve)

    expect(second?.passages.map((p) => p.id)).toEqual(first?.passages.map((p) => p.id))
    expect(rows.map((r) => r.id)).toContain(PASSAGE_IDS.reserveBarcelonaC)
  })

  it('pre-flags a reserve team whose French name lost the marker its English one keeps', async () => {
    // The signal was measured on English labels, and `clubs.en_name` exists in
    // the model as the admin's fallback. Reading only the French name would
    // let this club through.
    const club = onlyRow(
      await db
        .insert(clubs)
        .values({ frName: 'Bayern Munich espoirs', enName: 'FC Bayern Munich II' })
        .returning({ id: clubs.id }),
    )

    await addPassage(FOOTBALLER_IDS.incomplete, {
      clubId: club.id,
      isLoan: false,
      startYear: 2006,
      endYear: 2008,
      matches: 30,
      goals: 2,
    })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.incomplete)
    expect(dossier?.passages[0]).toMatchObject({
      clubName: 'Bayern Munich espoirs',
      flags: ['likely-reserve'],
    })
  })

  it('flags both passages of an overlap', async () => {
    const dossier = await getCurationDossier(FOOTBALLER_IDS.loan)

    expect(dossier?.passages.map((p) => [p.clubName, p.flags])).toEqual([
      ['Stade de Reims', ['overlap']],
      ['Olympique lyonnais', ['overlap']],
    ])
  })

  it('flags a passage the source duplicated as an overlap', async () => {
    // Nothing can tell it from a genuine second spell; the overlap alert is the
    // only thing that puts it under the admin's eye.
    const dossier = await getCurationDossier(FOOTBALLER_IDS.duplicatePassage)

    expect(dossier?.passages.map((p) => p.flags)).toEqual([['overlap'], ['overlap', 'missing-figures']])
  })

  it('flags the passage whose matches and goals are missing', async () => {
    const dossier = await getCurationDossier(FOOTBALLER_IDS.incomplete)

    expect(dossier?.passages.map((p) => [p.clubName, p.flags])).toEqual([
      ['FC Nantes', ['missing-figures']],
      ['Stade rennais', []],
    ])
  })

  it('shows a footballer nobody has curated yet, with an empty parcours', async () => {
    // "Curé" is not a status: it is the fact of having passages. So this is a
    // dossier to open, not a missing one.
    const inserted = onlyRow(
      await db
        .insert(footballers)
        .values({ name: 'Anonyme Non Curé', sitelinks: 0 })
        .returning({ id: footballers.id }),
    )

    const dossier = await getCurationDossier(inserted.id)

    expect(dossier).not.toBeNull()
    expect(dossier?.passages).toEqual([])
    expect(dossier?.wikidataQid).toBeNull()
  })

  it('has no import trace when none ever ran', async () => {
    expect((await getCurationDossier(FOOTBALLER_IDS.complete))?.lastImport).toBeNull()
  })

  it('shows the last import of this footballer, and only his', async () => {
    await db.insert(jobRuns).values([
      {
        job: CAREER_IMPORT_JOB,
        target: 'Q1835',
        startedAt: new Date('2026-09-01T10:00:00Z'),
        finishedAt: new Date('2026-09-01T10:00:05Z'),
        items: 3,
        errors: 0,
      },
      {
        job: CAREER_IMPORT_JOB,
        target: 'Q1835',
        startedAt: new Date('2026-09-08T10:00:00Z'),
        finishedAt: new Date('2026-09-08T10:00:07Z'),
        items: 4,
        errors: 0,
      },
      {
        job: CAREER_IMPORT_JOB,
        target: 'Q900000004',
        startedAt: new Date('2026-09-09T10:00:00Z'),
        finishedAt: new Date('2026-09-09T10:00:02Z'),
        items: 2,
        errors: 0,
      },
    ])

    expect((await getCurationDossier(FOOTBALLER_IDS.complete))?.lastImport).toMatchObject({
      startedAt: new Date('2026-09-08T10:00:00Z'),
      passagesWritten: 4,
      failed: false,
    })
  })

  it('shows a refused import, with the reason', async () => {
    // The run worth reading: it wrote nothing, so the catalogue says nothing
    // about it.
    await db.insert(jobRuns).values({
      job: CAREER_IMPORT_JOB,
      target: 'Q1835',
      startedAt: new Date('2026-09-08T10:00:00Z'),
      finishedAt: new Date('2026-09-08T10:00:01Z'),
      items: 0,
      errors: 1,
      lastError: 'Q1835 has no senior club passage in Wikidata',
    })

    expect((await getCurationDossier(FOOTBALLER_IDS.complete))?.lastImport).toMatchObject({
      failed: true,
      lastError: 'Q1835 has no senior club passage in Wikidata',
    })
  })
})

describe('addPassage', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('adds a passage, and the parcours puts it where its years say', async () => {
    // The hole the source leaves: Cantona's Marseille years are simply absent
    // from Wikidata, and typing them in is the whole job of this screen.
    await addPassage(FOOTBALLER_IDS.complete, {
      clubId: CLUB_IDS.nantes,
      isLoan: false,
      startYear: 1986,
      endYear: 1988,
      matches: 30,
      goals: 4,
    })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.complete)
    expect(dossier?.passages.map((p) => p.clubName)).toEqual([
      'FC Nantes',
      'AS Cannes',
      'Girondins de Bordeaux',
      'Juventus',
      'Real Madrid',
    ])
  })

  it('accepts a passage whose figures are not known yet', async () => {
    await addPassage(FOOTBALLER_IDS.complete, {
      clubId: CLUB_IDS.nantes,
      isLoan: false,
      startYear: 1986,
      endYear: 1988,
      matches: null,
      goals: null,
    })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.complete)
    expect(dossier?.passages[0]?.flags).toEqual(['missing-figures'])
  })

  it('accepts a second passage at a club already in the parcours', async () => {
    // A club crossed twice is two passages: the model says so, and the enigma
    // shows the club twice.
    await addPassage(FOOTBALLER_IDS.complete, {
      clubId: CLUB_IDS.juventus,
      isLoan: false,
      startYear: 2006,
      endYear: 2008,
      matches: 40,
      goals: 5,
    })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.complete)
    expect(dossier?.passages.filter((p) => p.clubName === 'Juventus')).toHaveLength(2)
  })

  it('refuses a footballer who does not exist', async () => {
    await expect(
      addPassage(UNKNOWN_ID, {
        clubId: CLUB_IDS.nantes,
        isLoan: false,
        startYear: 2010,
        endYear: 2012,
        matches: null,
        goals: null,
      }),
    ).rejects.toBeInstanceOf(FootballerNotFoundError)
  })

  it('refuses a club that does not exist', async () => {
    await expect(
      addPassage(FOOTBALLER_IDS.complete, {
        clubId: UNKNOWN_ID,
        isLoan: false,
        startYear: 2010,
        endYear: 2012,
        matches: null,
        goals: null,
      }),
    ).rejects.toBeInstanceOf(ClubNotFoundError)
  })
})

describe('updatePassage', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('fills in the matches and goals the source did not have', async () => {
    await updatePassage(PASSAGE_IDS.incompleteNantes, {
      clubId: CLUB_IDS.nantes,
      isLoan: false,
      startYear: 2009,
      endYear: 2013,
      matches: 96,
      goals: 12,
    })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.incomplete)
    expect(dossier?.passages[0]).toMatchObject({ matches: 96, goals: 12, flags: [] })
  })

  it('annotates a passage as a loan', async () => {
    await updatePassage(PASSAGE_IDS.incompleteRennes, {
      clubId: CLUB_IDS.rennes,
      isLoan: true,
      startYear: 2013,
      endYear: 2016,
      matches: 74,
      goals: 9,
    })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.incomplete)
    expect(dossier?.passages.find((p) => p.clubName === 'Stade rennais')?.isLoan).toBe(true)
  })

  it('reorders the parcours by adjusting a year, the only way there is', async () => {
    // No drag & drop, and no ordering column: the order is a consequence of the
    // years, so correcting it means correcting a year.
    await updatePassage(PASSAGE_IDS.completeRealMadrid, {
      clubId: CLUB_IDS.realMadrid,
      isLoan: false,
      startYear: 1986,
      endYear: 1988,
      matches: 155,
      goals: 37,
    })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.complete)
    expect(dossier?.passages[0]?.clubName).toBe('Real Madrid')
  })

  it('moves a passage to another club', async () => {
    await updatePassage(PASSAGE_IDS.incompleteNantes, {
      clubId: CLUB_IDS.lyon,
      isLoan: false,
      startYear: 2009,
      endYear: 2013,
      matches: 96,
      goals: 12,
    })

    const dossier = await getCurationDossier(FOOTBALLER_IDS.incomplete)
    expect(dossier?.passages.map((p) => p.clubName)).toEqual([
      'Olympique lyonnais',
      'Stade rennais',
    ])
  })

  it('leaves the footballer it belongs to alone', async () => {
    await updatePassage(PASSAGE_IDS.incompleteNantes, {
      clubId: CLUB_IDS.nantes,
      isLoan: false,
      startYear: 2009,
      endYear: 2013,
      matches: 96,
      goals: 12,
    })

    expect((await getCurationDossier(FOOTBALLER_IDS.incomplete))?.passages).toHaveLength(2)
  })

  it('refuses a passage that does not exist', async () => {
    await expect(
      updatePassage(UNKNOWN_ID, {
        clubId: CLUB_IDS.nantes,
        isLoan: false,
        startYear: 2009,
        endYear: 2013,
        matches: null,
        goals: null,
      }),
    ).rejects.toBeInstanceOf(PassageNotFoundError)
  })

  it('refuses a club that does not exist', async () => {
    await expect(
      updatePassage(PASSAGE_IDS.incompleteNantes, {
        clubId: UNKNOWN_ID,
        isLoan: false,
        startYear: 2009,
        endYear: 2013,
        matches: null,
        goals: null,
      }),
    ).rejects.toBeInstanceOf(ClubNotFoundError)
  })
})

describe('deletePassage', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('removes the reserve team the admin decided was one', async () => {
    await deletePassage(PASSAGE_IDS.reserveBarcelonaC)

    const dossier = await getCurationDossier(FOOTBALLER_IDS.untypedReserve)
    expect(dossier?.passages.map((p) => p.clubName)).toEqual(['Levante UD'])
  })

  it('leaves the club in the catalogue', async () => {
    // A club is shared: deleting a passage must not take it away from every
    // other footballer who played there.
    await deletePassage(PASSAGE_IDS.reserveBarcelonaC)

    const remaining = await db.select({ id: clubs.id }).from(clubs)
    expect(remaining.map((c) => c.id)).toContain(CLUB_IDS.barcelonaC)
  })

  it('refuses a passage that does not exist', async () => {
    await expect(deletePassage(UNKNOWN_ID)).rejects.toBeInstanceOf(PassageNotFoundError)
  })
})

describe('setFootballerNationality', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('assigns the one sporting nationality a footballer has', async () => {
    await setFootballerNationality(FOOTBALLER_IDS.incomplete, NATIONALITY_IDS.fr)

    const dossier = await getCurationDossier(FOOTBALLER_IDS.incomplete)
    expect(dossier?.nationality).toMatchObject({ code: 'FR' })
  })

  it('replaces a nationality the import chose wrong', async () => {
    await setFootballerNationality(FOOTBALLER_IDS.complete, NATIONALITY_IDS.es)

    const dossier = await getCurationDossier(FOOTBALLER_IDS.complete)
    expect(dossier?.nationality).toMatchObject({ code: 'ES' })
  })

  it('clears a nationality that should never have been there', async () => {
    await setFootballerNationality(FOOTBALLER_IDS.complete, null)

    expect((await getCurationDossier(FOOTBALLER_IDS.complete))?.nationality).toBeNull()
  })

  it('refuses a footballer who does not exist', async () => {
    await expect(
      setFootballerNationality(UNKNOWN_ID, NATIONALITY_IDS.fr),
    ).rejects.toBeInstanceOf(FootballerNotFoundError)
  })
})

describe('listNationalities', () => {
  it('lists what curation can choose from, in French alphabetical order', async () => {
    await seedCatalogue(db)

    expect((await listNationalities()).map((n) => n.code)).toEqual(['ES', 'FR'])
  })

  it('is empty before any import has created one', async () => {
    expect(await listNationalities()).toEqual([])
  })
})
