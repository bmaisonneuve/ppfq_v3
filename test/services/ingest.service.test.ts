import { beforeEach, describe, expect, it } from 'vitest'

import { clubs, footballerNames, footballers, nationalities, playerClubs } from '@/server/db/schema'
import { getFootballerCareer } from '@/server/services/catalogue.service'
import {
  EmptyCareerError,
  NotAFootballerError,
  UnnamedFootballerError,
  importFootballerCareer,
} from '@/server/services/ingest.service'
import {
  CAREER_IMPORT_JOB,
  CLUB_CREST_JOB,
  listRecentJobRuns,
} from '@/server/services/job-runs.service'
import { searchFootballers } from '@/server/services/search.service'
import { eq } from 'drizzle-orm'

import { db } from '@test/setup/db'
import { FOOTBALLER_IDS, seedCatalogue } from '@test/fixtures/catalogue'
import { ONE_PIXEL_PNG, fakeWikipedia } from '@test/fixtures/crest'
import {
  RECORDED,
  careerRow,
  identityRow,
  recordedRunner,
  wikidataRunner,
} from '@test/fixtures/wikidata'

/**
 * The career import against a real Postgres, with the endpoint replayed from
 * the recordings in `test/fixtures/wikidata/`.
 *
 * The service is called exactly the way the back-office will call it — one
 * footballer, one call — and what is checked is the state of the catalogue
 * afterwards, never the queries it went through. The live counterpart of these
 * tests, the one that really talks to Wikidata, is `test/live/`.
 */
/**
 * The import, with both sources replaced.
 *
 * The crest source matters as much as the SPARQL one: an import fetches the
 * crests of the clubs it creates, so a test that left it at its default would
 * go to fr.wikipedia for every club of every career. This one answers for
 * nothing, which is the shape of a club whose article has no image — the case
 * the extraction is built around.
 */
const silentCrests = () => {
  const wikipedia = fakeWikipedia({})
  return { fetchJson: wikipedia.fetchJson, fetchImage: wikipedia.fetchImage }
}

const importCareer = async (qid: string, runQuery: ReturnType<typeof wikidataRunner>) =>
  await importFootballerCareer({ qid, runQuery, crestSource: silentCrests() })

const careerOf = async (footballerId: string) => await getFootballerCareer(footballerId)

const footballerByQid = async (qid: string) => {
  const [row] = await db.select().from(footballers).where(eq(footballers.wikidataQid, qid))
  return row
}

describe('a footballer already in the search referential', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('replaces his parcours and leaves the referential’s columns alone', async () => {
    const report = await importCareer(
      RECORDED.zidane,
      recordedRunner(RECORDED.zidane),
    )

    expect(report).toMatchObject({
      qid: 'Q1835',
      footballerId: FOOTBALLER_IDS.complete,
      name: 'Zinedine Zidane',
      footballerCreated: false,
      statementsRead: 9,
      passagesWritten: 4,
      // All four clubs are already in the catalogue, matched on their Wikidata id.
      clubsCreated: 0,
      nationality: { code: 'FR', frName: 'France' },
      nationalityRefusal: null,
    })
    expect(report.skipped.nationalTeam).toBe(5)

    const footballer = await footballerByQid('Q1835')
    // `name` and `sitelinks` belong to the referential import: the source says
    // 145 sitelinks today and the row keeps the 148 it was loaded with.
    expect(footballer).toMatchObject({ name: 'Zinedine Zidane', sitelinks: 148 })
  })

  it('reuses the clubs the catalogue already has, with their curated names', async () => {
    await importCareer(RECORDED.zidane, recordedRunner(RECORDED.zidane))

    const career = await careerOf(FOOTBALLER_IDS.complete)

    // "Juventus", not "Juventus FC": a club's French name is what the game
    // displays and the import does not walk over it.
    expect(career?.playerClubs.map((p) => p.clubName)).toEqual([
      'AS Cannes',
      'Girondins de Bordeaux',
      'Juventus',
      'Real Madrid',
    ])
    expect(await db.select().from(clubs)).toHaveLength(10)
  })

  it('writes the years, the league matches and the league goals', async () => {
    await importCareer(RECORDED.zidane, recordedRunner(RECORDED.zidane))

    const career = await careerOf(FOOTBALLER_IDS.complete)

    expect(
      career?.playerClubs.map((p) => [p.startYear, p.endYear, p.matches, p.goals]),
    ).toEqual([
      [1989, 1992, 61, 6],
      [1992, 1996, 139, 28],
      [1996, 2001, 151, 24],
      [2001, 2006, 155, 37],
    ])
  })

  it('leaves a nationality row exactly as curation left it', async () => {
    await importCareer(RECORDED.zidane, recordedRunner(RECORDED.zidane))

    const [france] = await db.select().from(nationalities).where(eq(nationalities.code, 'FR'))

    // The flag key and the French name are curated; the import only ever
    // creates a nationality it does not find.
    expect(france).toMatchObject({ frName: 'France', flagS3Key: 'flags/fr.svg' })
    expect(await db.select().from(nationalities)).toHaveLength(2)
  })

  it('never clears a nationality the source no longer names', async () => {
    // The England case, in reverse: an admin's correction has to survive the
    // next import, so a missing country leaves the column alone.
    const report = await importCareer(
      'Q1835',
      wikidataRunner({
        identity: [identityRow({ country: undefined, countryKind: undefined })],
        career: [careerRow()],
      }),
    )

    expect(report.nationality).toBeNull()
    expect(report.nationalityRefusal).toBe('missing')

    const career = await careerOf(FOOTBALLER_IDS.complete)
    expect(career?.nationality?.code).toBe('FR')
  })

  it('reports an ambiguous nationality rather than picking one', async () => {
    const report = await importCareer(
      'Q900000002',
      wikidataRunner({
        identity: [
          identityRow({
            countryKind: 'citizenship',
            country: 'http://www.wikidata.org/entity/Q142',
            alpha2: 'FR',
          }),
          identityRow({
            countryKind: 'citizenship',
            country: 'http://www.wikidata.org/entity/Q1041',
            alpha2: 'SN',
            countryFr: 'Sénégal',
          }),
        ],
        career: [careerRow()],
      }),
    )

    expect(report.nationalityRefusal).toBe('ambiguous')
    expect(await db.select().from(nationalities)).toHaveLength(2)
  })
})

describe('a footballer the referential does not have', () => {
  it('creates him, with the terms that make him findable', async () => {
    // The manual homonym recovery of the model: the referential drops 13 042
    // footballers who share a name with someone more notorious, and importing
    // one by his Wikidata id is how he gets in. Without his search terms he
    // would be a footballer nobody can type, and so nobody can guess.
    const report = await importCareer(RECORDED.cantona, recordedRunner(RECORDED.cantona))

    expect(report).toMatchObject({
      name: 'Éric Cantona',
      footballerCreated: true,
      passagesWritten: 7,
      clubsCreated: 7,
      nationality: { code: 'FR', frName: 'France' },
    })

    const terms = await db
      .select({ term: footballerNames.term, isCanonical: footballerNames.isCanonical })
      .from(footballerNames)
      .orderBy(footballerNames.term)

    expect(terms).toEqual([
      { term: 'cantona', isCanonical: false },
      { term: 'eric cantona', isCanonical: true },
    ])
    expect(await searchFootballers({ query: 'cantona' })).toEqual([
      { footballerId: report.footballerId, name: 'Éric Cantona' },
    ])
  })

  it('writes the parcours in order, loans annotated, and the hole left open', async () => {
    // The case the ticket names: Marseille 1988-1991 is absent from the source,
    // so his three loans hang off nothing and the gap is visible in the
    // catalogue. Nothing invents a club to close it.
    const report = await importCareer(RECORDED.cantona, recordedRunner(RECORDED.cantona))
    const career = await careerOf(report.footballerId)

    expect(career?.playerClubs.map((p) => [p.clubName, p.startYear, p.isLoan])).toEqual([
      ['AJ Auxerre', 1983, false],
      ['FC Martigues', 1985, true],
      ['Girondins de Bordeaux', 1989, true],
      ['Montpellier Hérault SC', 1989, true],
      ['Nîmes Olympique', 1991, false],
      ['Leeds United', 1992, false],
      ['Manchester United FC', 1992, false],
    ])
    expect(career?.playerClubs.some((p) => p.clubName.includes('Marseille'))).toBe(false)
  })

  it('creates the nationality of an English footballer under its subdivision code', async () => {
    // No ISO 3166-1 code exists for England, and `P27` would make Beckham
    // British. `GB-ENG` is what the column holds.
    const report = await importCareer(RECORDED.beckham, recordedRunner(RECORDED.beckham))

    expect(report.nationality).toEqual({ code: 'GB-ENG', frName: 'Angleterre' })
    const career = await careerOf(report.footballerId)
    expect(career?.nationality).toMatchObject({ code: 'GB-ENG', frName: 'Angleterre' })
  })

  it('keeps the same club twice when the source says two spells', async () => {
    const report = await importCareer(RECORDED.beckham, recordedRunner(RECORDED.beckham))
    const career = await careerOf(report.footballerId)

    const milan = career?.playerClubs.filter((p) => p.clubName === 'AC Milan')
    expect(milan?.map((p) => [p.startYear, p.isLoan])).toEqual([
      [2009, true],
      [2010, true],
    ])
  })

  it('stores a passage with no statistics as a passage with no statistics', async () => {
    // Half of this career carries no figures, which makes the footballer
    // unschedulable and nothing worse. The check happens at scheduling time.
    const report = await importCareer(RECORDED.leipertz, recordedRunner(RECORDED.leipertz))
    const career = await careerOf(report.footballerId)

    expect(career?.playerClubs.map((p) => [p.clubName, p.matches, p.goals])).toEqual([
      ['Alemannia Aix-la-Chapelle', 8, 7],
      ['FC Schalke 04', 0, 0],
      // An untyped reserve team, in the catalogue as an ordinary club.
      ['FC Schalke 04 II', 35, 20],
      ['1. FC Heidenheim 1846', null, null],
      ['FC Ingolstadt 04', null, null],
      ['1. FC Heidenheim 1846', null, null],
    ])
  })

  it('merges a duplicated passage into one, keeping the documented declaration', async () => {
    // The only cleanup curation cannot make up for: two rows for one club look
    // exactly like a genuine second spell.
    const report = await importCareer(
      'Q900000009',
      wikidataRunner({
        identity: [identityRow()],
        career: [
          careerRow({ statement: 'thin', matches: undefined, goals: undefined, end: undefined }),
          careerRow({ statement: 'full' }),
        ],
      }),
    )
    const career = await careerOf(report.footballerId)

    expect(report).toMatchObject({ statementsRead: 2, passagesWritten: 1 })
    expect(report.skipped.duplicate).toBe(1)
    expect(career?.playerClubs).toHaveLength(1)
    expect(career?.playerClubs[0]).toMatchObject({ matches: 151, goals: 24, endYear: 2001 })
  })

  it('reports a passage the source contradicts, and stores it anyway', async () => {
    // 2 989 passages in the source score more than they play. The referential
    // stays exhaustive; the model blocks these at scheduling time.
    const report = await importCareer(
      'Q900000010',
      wikidataRunner({
        identity: [identityRow()],
        career: [careerRow({ matches: '5.0', goals: '8.0' })],
      }),
    )
    const career = await careerOf(report.footballerId)

    expect(report.anomalies).toEqual([
      { clubQid: 'Q1422', startYear: 1996, reason: 'goals-above-matches' },
    ])
    expect(career?.playerClubs[0]).toMatchObject({ matches: 5, goals: 8 })
  })

  it('names a club the source names in no language after its Wikidata id', async () => {
    // Visibly wrong and trivially fixable, where a blank name looks broken.
    const report = await importCareer(
      'Q900000011',
      wikidataRunner({
        identity: [identityRow()],
        career: [careerRow({ clubFr: undefined, clubEn: undefined })],
      }),
    )
    const career = await careerOf(report.footballerId)

    expect(career?.playerClubs[0]?.clubName).toBe('Q1422')
  })
})

describe('what the import refuses to write', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
  })

  it('refuses an item that is not a footballer', async () => {
    // Q42816 is an Italian commune with 48 sitelinks — one of the four ids the
    // original brief called a footballer.
    await expect(
      importCareer(RECORDED.commune, recordedRunner(RECORDED.commune)),
    ).rejects.toThrow(NotAFootballerError)

    expect(await footballerByQid('Q42816')).toBeUndefined()
  })

  it('refuses to create a footballer the source cannot name', async () => {
    // Q615's labels carry no language tag in the endpoint's index, so neither
    // French nor English comes back. He is in the referential in real life;
    // here he is not, and a nameless row would be findable by nobody.
    await expect(
      importCareer(RECORDED.messi, recordedRunner(RECORDED.messi)),
    ).rejects.toThrow(UnnamedFootballerError)

    expect(await footballerByQid('Q615')).toBeUndefined()
    // Not even the clubs of the career it had already read.
    expect(await db.select().from(clubs)).toHaveLength(10)
  })

  it('refuses a name no search term can be made of', async () => {
    // A label of pure punctuation normalises to nothing, and an empty term
    // would match every prefix query. Same refusal as no label at all.
    await expect(
      importCareer(
        'Q900000012',
        wikidataRunner({
          identity: [identityRow({ nameFr: '!!!', nameEn: undefined })],
          career: [careerRow()],
        }),
      ),
    ).rejects.toThrow(UnnamedFootballerError)

    expect(await footballerByQid('Q900000012')).toBeUndefined()
  })

  it('refuses a career with no club passage, rather than emptying a curated one', async () => {
    // A thin answer — a snapshot mid-edit, a footballer with only selections —
    // must not wipe a parcours an admin spent an hour on.
    const onlySelections = wikidataRunner({
      identity: [identityRow()],
      career: [careerRow({ isClub: 'true', isNational: 'true' })],
    })

    await expect(importCareer('Q1835', onlySelections)).rejects.toThrow(EmptyCareerError)

    const career = await careerOf(FOOTBALLER_IDS.complete)
    expect(career?.playerClubs).toHaveLength(4)
  })

  it('leaves the catalogue untouched when the endpoint fails halfway', async () => {
    const broken = recordedRunner(RECORDED.zidane, { failOn: 'career' })

    await expect(importCareer('Q1835', broken)).rejects.toThrow(/did not answer/)

    const career = await careerOf(FOOTBALLER_IDS.complete)
    expect(career?.playerClubs).toHaveLength(4)
    expect(career?.playerClubs[0]?.clubName).toBe('AS Cannes')
  })
})

describe('re-running the import', () => {
  it('changes nothing the second time', async () => {
    const first = await importCareer(RECORDED.cantona, recordedRunner(RECORDED.cantona))
    const before = await careerOf(first.footballerId)

    const second = await importCareer(RECORDED.cantona, recordedRunner(RECORDED.cantona))
    const after = await careerOf(second.footballerId)

    expect(second).toMatchObject({
      footballerId: first.footballerId,
      footballerCreated: false,
      passagesWritten: 7,
      // The clubs are already there.
      clubsCreated: 0,
    })
    expect(after?.playerClubs.map((p) => [p.clubName, p.startYear, p.isLoan])).toEqual(
      before?.playerClubs.map((p) => [p.clubName, p.startYear, p.isLoan]),
    )
    expect(await db.select().from(clubs)).toHaveLength(7)
  })

  it('undoes hand curation, which is why it is never automatic', async () => {
    // The consequence the model accepts (§11): the import replaces the
    // parcours, so a reserve team an admin removed comes back — nothing in the
    // source says it is a reserve team. It is a deliberate act on one
    // footballer, and nothing rewrites a career in the night.
    const first = await importCareer(RECORDED.leipertz, recordedRunner(RECORDED.leipertz))
    const reserve = (await careerOf(first.footballerId))?.playerClubs.find(
      (p) => p.clubName === 'FC Schalke 04 II',
    )
    await db.delete(playerClubs).where(eq(playerClubs.id, reserve?.id ?? ''))
    expect((await careerOf(first.footballerId))?.playerClubs).toHaveLength(5)

    await importCareer(RECORDED.leipertz, recordedRunner(RECORDED.leipertz))

    const career = await careerOf(first.footballerId)
    expect(career?.playerClubs.map((p) => p.clubName)).toContain('FC Schalke 04 II')
  })
})

describe('the trace every run leaves', () => {
  it('records what was handled', async () => {
    const report = await importCareer(RECORDED.cantona, recordedRunner(RECORDED.cantona))

    const [run] = await listRecentJobRuns({ job: CAREER_IMPORT_JOB })

    expect(run).toMatchObject({
      id: report.jobRunId,
      job: 'career_import',
      // Which footballer: a row saying "career_import, 7 items" would tell the
      // diagnostic screen nothing.
      target: 'Q170328',
      items: 7,
      errors: 0,
      lastError: null,
    })
    expect(run?.finishedAt).toBeInstanceOf(Date)
  })

  it('records a failed run too, which is the one worth reading', async () => {
    await expect(
      importCareer(RECORDED.commune, recordedRunner(RECORDED.commune)),
    ).rejects.toThrow(NotAFootballerError)

    const [run] = await listRecentJobRuns({ job: CAREER_IMPORT_JOB })

    // Written on the pool and not in the transaction, so the rollback of the
    // work does not take the trace with it.
    expect(run).toMatchObject({ target: 'Q42816', items: 0, errors: 1 })
    expect(run?.finishedAt).toBeInstanceOf(Date)
    // And it says *why*: `errors = 1` alone leaves the diagnostic screen with
    // nothing to show, and a refused import is the run someone comes back to.
    expect(run?.lastError).toMatch(/not a footballer/)
  })

  it('keeps one row per run, newest first', async () => {
    await importCareer(RECORDED.cantona, recordedRunner(RECORDED.cantona))
    await importCareer(RECORDED.beckham, recordedRunner(RECORDED.beckham))

    const runs = await listRecentJobRuns({ job: CAREER_IMPORT_JOB })

    expect(runs.map((run) => run.target)).toEqual(['Q10520', 'Q170328'])
  })

  it('records why a run that never reached the catalogue failed', async () => {
    const broken = recordedRunner(RECORDED.zidane, { failOn: 'career' })

    await expect(importCareer('Q1835', broken)).rejects.toThrow(/did not answer/)

    const [run] = await listRecentJobRuns({ job: CAREER_IMPORT_JOB })
    expect(run?.lastError).toMatch(/did not answer the career query/)
  })

  it('says nothing about a job that never ran', async () => {
    expect(await listRecentJobRuns({ job: 'cache_revalidate' })).toEqual([])
  })
})

describe('the crests of the clubs an import creates', () => {
  /** Manchester United, one of the nine clubs Cantona's import creates. */
  const MANCHESTER_UNITED = 'Q18656'

  const crestSource = () =>
    fakeWikipedia({
      [MANCHESTER_UNITED]: {
        wiki: 'fr',
        article: 'Manchester United Football Club',
        fileName: 'Logo_Manchester_United_FC.svg',
        license: 'marque déposée',
        bytes: ONE_PIXEL_PNG,
      },
    })

  it('fetches them, and says so in the report', async () => {
    const wikipedia = crestSource()

    const report = await importFootballerCareer({
      qid: RECORDED.cantona,
      runQuery: recordedRunner(RECORDED.cantona),
      crestSource: wikipedia,
    })

    expect(report.clubsCreated).toBeGreaterThan(0)
    expect(report.crests).toMatchObject({ fetched: 1, errors: 0 })

    const [united] = await db
      .select()
      .from(clubs)
      .where(eq(clubs.wikidataQid, MANCHESTER_UNITED))
    expect(united?.crestKey).not.toBeNull()
  })

  it('leaves its own trace, separate from the import’s', async () => {
    const wikipedia = crestSource()

    const report = await importFootballerCareer({
      qid: RECORDED.cantona,
      runQuery: recordedRunner(RECORDED.cantona),
      crestSource: wikipedia,
    })

    const runs = await listRecentJobRuns()
    const crestRun = runs.find((run) => run.id === report.crests?.jobRunId)
    expect(crestRun?.job).toBe(CLUB_CREST_JOB)
    // And the import's own row is untouched by it: a crest is not a passage.
    const importRun = runs.find((run) => run.job === CAREER_IMPORT_JOB)
    expect(importRun).toMatchObject({ errors: 0, items: report.passagesWritten })
  })

  it('does not fail the import when a download fails, and keeps the parcours', async () => {
    // The rule the ticket states outright: a half-written parcours is a false
    // enigma, a missing crest is a missing image.
    const wikipedia = fakeWikipedia({
      [MANCHESTER_UNITED]: {
        wiki: 'fr',
        article: 'Manchester United Football Club',
        fileName: 'Logo_Manchester_United_FC.svg',
      },
    })

    const report = await importFootballerCareer({
      qid: RECORDED.cantona,
      runQuery: recordedRunner(RECORDED.cantona),
      crestSource: wikipedia,
    })

    expect(report.passagesWritten).toBeGreaterThan(0)
    expect(report.crests).toMatchObject({ fetched: 0, errors: 1 })
    expect((await careerOf(report.footballerId))?.playerClubs.length).toBe(
      report.passagesWritten,
    )
  })

  it('does not fail the import when the whole source is unreachable', async () => {
    const report = await importFootballerCareer({
      qid: RECORDED.cantona,
      runQuery: recordedRunner(RECORDED.cantona),
      crestSource: {
        fetchJson: async () => {
          await Promise.resolve()
          throw new Error('Wikimedia is gone.')
        },
      },
    })

    expect(report.passagesWritten).toBeGreaterThan(0)
    expect(report.crests).toMatchObject({ fetched: 0, errors: 1 })
  })

  it('asks for nothing when it created no club', async () => {
    // Zidane is seeded with all four of his clubs, so the import creates none
    // and there is nothing to go and fetch.
    await seedCatalogue(db)

    const report = await importCareer(RECORDED.zidane, recordedRunner(RECORDED.zidane))

    expect(report.clubsCreated).toBe(0)
    expect(report.crests).toBeNull()
  })

  it('leaves a club it did not create alone', async () => {
    await seedCatalogue(db)
    // Bordeaux is in the fixture already, so Cantona's import does not create
    // it — and an existing club is never handed to the extraction at all.
    const wikipedia = fakeWikipedia({
      Q172476: {
        wiki: 'fr',
        article: 'Football Club des Girondins de Bordeaux',
        fileName: 'Logo_Girondins.svg',
        bytes: ONE_PIXEL_PNG,
      },
    })

    await importFootballerCareer({
      qid: RECORDED.cantona,
      runQuery: recordedRunner(RECORDED.cantona),
      crestSource: wikipedia,
    })

    const [bordeaux] = await db.select().from(clubs).where(eq(clubs.wikidataQid, 'Q172476'))
    expect(bordeaux?.crestKey).toBeNull()
  })
})
