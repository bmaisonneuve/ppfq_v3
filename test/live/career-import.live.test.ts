import { describe, expect, it } from 'vitest'

import { footballers } from '@/server/db/schema'
import { getFootballerCareer } from '@/server/services/catalogue.service'
import { importFootballerCareer } from '@/server/services/ingest.service'
import { fetchWikidataFootballer } from '@/server/ingest/wikidata-career'
import { entityId, runSparqlQuery } from '@/server/ingest/sparql'

import { db } from '@test/setup/db'
import { RECORDED, recordedWikidata } from '@test/fixtures/wikidata'

/**
 * The live suite: the real endpoint, the real queries, a real Postgres.
 *
 * `pnpm test:live`. It is **not** part of `pnpm test`, which stays offline and
 * deterministic — a suite that fails when a third-party endpoint is slow is a
 * suite people stop believing. What this one is for is the half the recordings
 * cannot check: that the queries are still valid SPARQL, that QLever still
 * answers them, and that what it answers still has the shape the pipeline
 * reads.
 *
 * So the assertions here are **invariants, not figures**. A number of matches
 * moves the day someone edits Wikidata, and a test that pins it would fail for
 * a reason nobody cares about. What must hold whatever the source says today:
 * FC Barcelona is a club, Argentina is not, a loan is recognised by its value,
 * and a career comes back ordered with its statistics.
 *
 * One test does compare the source with the recordings, deliberately: it is how
 * a stale fixture becomes visible instead of quietly outliving the truth.
 */
const LIVE_TIMEOUT = 60_000

describe('the endpoint answers the pipeline’s own queries', () => {
  it(
    'reads Zidane and writes his parcours into the catalogue',
    async () => {
      const report = await importFootballerCareer({ qid: RECORDED.zidane })

      expect(report).toMatchObject({ qid: 'Q1835', footballerCreated: true })
      // Four clubs is what the source has had for years. Asserting "at least
      // four" leaves room for a fifth to be added without a false alarm, and
      // still fails if the club filter starts dropping real clubs.
      expect(report.passagesWritten).toBeGreaterThanOrEqual(4)
      expect(report.nationality).toEqual({ code: 'FR', frName: 'France' })

      const career = await getFootballerCareer(report.footballerId)
      const clubNames = career?.playerClubs.map((p) => p.clubName) ?? []

      expect(clubNames).toContain('Juventus FC')
      expect(clubNames).toContain('Real Madrid CF')
      // The selections have to be gone, and the trap is that France's national
      // team is itself typed "association football club" on Wikidata.
      expect(clubNames.some((name) => name.startsWith('équipe de France'))).toBe(false)
      // A clean career carries its league figures, which is what hints 4 and 5 read.
      expect(career?.playerClubs.every((p) => p.matches !== null && p.goals !== null)).toBe(
        true,
      )
      // In order, oldest first, and that order is part of the enigma.
      const startYears = career?.playerClubs.map((p) => p.startYear) ?? []
      expect([...startYears]).toEqual([...startYears].sort((a, b) => a - b))
    },
    LIVE_TIMEOUT,
  )

  it(
    'still finds Cantona’s three loans, and still finds no Marseille',
    async () => {
      const report = await importFootballerCareer({ qid: RECORDED.cantona })
      const career = await getFootballerCareer(report.footballerId)

      // A loan is the *value* of the qualifier: Martigues, Bordeaux and
      // Montpellier carry it, and no transfer does.
      expect(career?.playerClubs.filter((p) => p.isLoan)).toHaveLength(3)

      // The documented hole. If this expectation ever fails, Wikidata has
      // gained the Marseille years and the fixtures — and the doc that calls
      // this career "complete and false" — want re-reading. That is a failure
      // worth having.
      expect(career?.playerClubs.some((p) => p.clubName.includes('Marseille'))).toBe(false)
    },
    LIVE_TIMEOUT,
  )

  it(
    'keeps FC Barcelona for Messi and drops Argentina',
    async () => {
      // He is in the search referential in real life and the endpoint gives him
      // no French or English label, so the row comes first — exactly the order
      // the back-office will have.
      const [seeded] = await db
        .insert(footballers)
        .values({ wikidataQid: RECORDED.messi, name: 'Lionel Messi', sitelinks: 225 })
        .returning({ id: footballers.id })

      const report = await importFootballerCareer({ qid: RECORDED.messi })
      const career = await getFootballerCareer(report.footballerId)
      const clubNames = career?.playerClubs.map((p) => p.clubName) ?? []

      expect(report.footballerId).toBe(seeded?.id)
      // The recall half of the club rule: FC Barcelona is not `P31 Q476028`,
      // and a filter on the exact type would lose the most famous club there is.
      expect(clubNames).toContain('FC Barcelone')
      expect(clubNames.some((name) => name.startsWith("équipe d'Argentine"))).toBe(false)
      // His PSG spell carries P1642 = "transfer". It is not a loan.
      const psg = career?.playerClubs.find((p) => p.clubName.includes('Paris Saint-Germain'))
      expect(psg?.isLoan).toBe(false)
    },
    LIVE_TIMEOUT,
  )

  it(
    'refuses to import an item that is not a footballer',
    async () => {
      // Q42816 is an Italian commune. The guard is live too, because this is
      // the mistake a typed-in id actually makes.
      await expect(importFootballerCareer({ qid: RECORDED.commune })).rejects.toThrow(
        /not a footballer/,
      )
    },
    LIVE_TIMEOUT,
  )

  it(
    'answers with the columns the reader expects',
    async () => {
      // The contract with the endpoint, at its narrowest: a statement row
      // carries a statement id, a club, a rank and the two class tests.
      const rows = await runSparqlQuery(
        [
          'PREFIX wd: <http://www.wikidata.org/entity/>',
          'PREFIX p: <http://www.wikidata.org/prop/>',
          'PREFIX ps: <http://www.wikidata.org/prop/statement/>',
          'SELECT ?statement ?club WHERE { wd:Q1835 p:P54 ?statement . ?statement ps:P54 ?club }',
        ].join('\n'),
      )

      expect(rows.length).toBeGreaterThan(4)
      expect(rows[0]?.statement).toMatch(/^http:\/\/www\.wikidata\.org\/entity\/statement\//)
    },
    LIVE_TIMEOUT,
  )
})

describe('the recordings the offline suite runs on', () => {
  it(
    'still describe the same career as the source',
    async () => {
      const live = await fetchWikidataFootballer(RECORDED.zidane, async (query) =>
        await runSparqlQuery(query),
      )
      const recorded = recordedWikidata(RECORDED.zidane)

      const clubsOf = (qids: (string | null)[]) =>
        [...new Set(qids)].sort((a, b) => (a ?? '').localeCompare(b ?? ''))

      expect(clubsOf(live.statements.map((s) => s.clubQid))).toEqual(
        clubsOf(recorded.career.map((row) => entityId(row.club))),
      )
      // Figures are not compared: they move. If this fails, run
      // `pnpm fixtures:wikidata` and read the diff — it is the only place a
      // change in the source becomes visible.
    },
    LIVE_TIMEOUT,
  )
})
