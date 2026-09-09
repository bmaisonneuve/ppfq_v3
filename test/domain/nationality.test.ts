import { describe, expect, it } from 'vitest'

import { selectNationality } from '@/server/ingest/nationality'
import type { WikidataCountry } from '@/server/ingest/nationality'
import { fetchWikidataFootballer } from '@/server/ingest/wikidata-career'

import { RECORDED, recordedRunner } from '@test/fixtures/wikidata'
import type { RecordedItem } from '@test/fixtures/wikidata'

/**
 * Which country becomes the nationality — and, as often, why none does.
 *
 * The rule refuses rather than guesses, because hint 3 lands in the middle of a
 * game: a footballer an admin still has to finish is a footballer who is not
 * schedulable, while a wrong flag is a broken enigma.
 */
const country = (overrides: Partial<WikidataCountry> = {}): WikidataCountry => ({
  qid: 'Q142',
  kind: 'sport',
  alpha2: 'FR',
  subdivision: null,
  alpha3: 'FRA',
  frName: 'France',
  enName: 'France',
  ...overrides,
})

const nationalityOf = async (qid: RecordedItem) => {
  const footballer = await fetchWikidataFootballer(qid, recordedRunner(qid))
  return selectNationality(footballer.countries)
}

describe('selectNationality', () => {
  it('takes the sporting country', () => {
    expect(selectNationality([country()])).toEqual({
      nationality: { qid: 'Q142', code: 'FR', frName: 'France', enName: 'France' },
      refusal: null,
    })
  })

  it('prefers the sporting country over the citizenships', () => {
    const choice = selectNationality([
      country({ qid: 'Q29', kind: 'citizenship', alpha2: 'ES', frName: 'Espagne' }),
      country({ qid: 'Q38', kind: 'citizenship', alpha2: 'IT', frName: 'Italie' }),
      country({ qid: 'Q414', kind: 'sport', alpha2: 'AR', frName: 'Argentine' }),
    ])

    expect(choice.nationality?.code).toBe('AR')
  })

  it('takes a lone citizenship when nothing says anything about sport', () => {
    const choice = selectNationality([country({ kind: 'citizenship' })])

    expect(choice.nationality?.code).toBe('FR')
  })

  it('does not collapse two citizenships into a guess', () => {
    // A binational with no P1532 is exactly the case a machine cannot settle,
    // and the game shows one nationality. So: nothing, and an admin decides.
    const choice = selectNationality([
      country({ qid: 'Q29', kind: 'citizenship', alpha2: 'ES' }),
      country({ qid: 'Q142', kind: 'citizenship', alpha2: 'FR' }),
    ])

    expect(choice).toEqual({ nationality: null, refusal: 'ambiguous' })
  })

  it('refuses two sporting countries as well', () => {
    const choice = selectNationality([
      country({ qid: 'Q142', alpha2: 'FR' }),
      country({ qid: 'Q1041', alpha2: 'SN' }),
    ])

    expect(choice.refusal).toBe('ambiguous')
  })

  it('is not confused by the same country arriving as both', () => {
    // The identity query asks for P1532 and P27 in one UNION, so anyone whose
    // citizenship is his sporting country comes back twice — which is most
    // footballers, and must not read as an ambiguity.
    const choice = selectNationality([
      country({ kind: 'sport' }),
      country({ kind: 'citizenship' }),
    ])

    expect(choice.nationality?.code).toBe('FR')
  })

  it('falls back to the subdivision code, which is what England has', () => {
    // The reason the sporting country comes first at all: an English
    // footballer is `P27` United Kingdom and `P1532` England, and England
    // carries no ISO 3166-1 code — only `GB-ENG`.
    const choice = selectNationality([
      country({
        qid: 'Q21',
        alpha2: null,
        subdivision: 'GB-ENG',
        alpha3: null,
        frName: 'Angleterre',
        enName: 'England',
      }),
    ])

    expect(choice.nationality).toEqual({
      qid: 'Q21',
      code: 'GB-ENG',
      frName: 'Angleterre',
      enName: 'England',
    })
  })

  it('falls back to the alpha-3 code, which is what Yugoslavia has', () => {
    // And these are exactly the players a retro grid wants.
    const choice = selectNationality([
      country({ qid: 'Q83286', alpha2: null, subdivision: null, alpha3: 'YUG' }),
    ])

    expect(choice.nationality?.code).toBe('YUG')
  })

  it('refuses a country with no code at all', () => {
    const choice = selectNationality([
      country({ alpha2: null, subdivision: null, alpha3: null }),
    ])

    expect(choice).toEqual({ nationality: null, refusal: 'no-code' })
  })

  it('refuses a country with no name, and takes the English one otherwise', () => {
    expect(selectNationality([country({ frName: null, enName: null })])).toEqual({
      nationality: null,
      refusal: 'unnamed',
    })
    expect(
      selectNationality([country({ frName: null, enName: 'France' })]).nationality?.frName,
    ).toBe('France')
  })

  it('refuses when the source names no country', () => {
    expect(selectNationality([])).toEqual({ nationality: null, refusal: 'missing' })
  })
})

describe('on the recorded footballers', () => {
  it('gives Messi Argentina rather than one of his three citizenships', async () => {
    expect((await nationalityOf(RECORDED.messi)).nationality).toMatchObject({
      code: 'AR',
      frName: 'Argentine',
    })
  })

  it('gives Beckham England rather than the United Kingdom', async () => {
    expect((await nationalityOf(RECORDED.beckham)).nationality).toMatchObject({
      code: 'GB-ENG',
      frName: 'Angleterre',
    })
  })

  it('gives Zidane France, named in French', async () => {
    expect((await nationalityOf(RECORDED.zidane)).nationality).toMatchObject({
      code: 'FR',
      frName: 'France',
    })
  })
})
