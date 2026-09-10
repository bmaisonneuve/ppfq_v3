import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import { searchFootballers } from '@/server/services/search.service'
import { importReferential } from '../../scripts/referential.ts'

import { db } from '@test/setup/db'
import { FOOTBALLER_IDS, seedCatalogue } from '@test/fixtures/catalogue'
import { SEARCH_FOOTBALLER_IDS, seedSearchReferential } from '@test/fixtures/search'

/**
 * The typeahead is the only input in the game, and the reason a guess is always
 * an existing footballer. These are the acceptance criteria of issue #3, checked
 * where they are entirely observable: the service, against a real Postgres, with
 * the two indexes actually in place.
 */
const names = async (query: string, limit?: number) =>
  (await searchFootballers({ query, limit })).map((s) => s.name)

describe('searchFootballers', () => {
  beforeEach(async () => {
    await seedCatalogue(db)
    await seedSearchReferential(db)
  })

  it('proposes Zinedine Zidane at the top of `zid`', async () => {
    expect(await names('zid')).toEqual([
      'Zinedine Zidane',
      'Zidan Ferreira',
      'Zidane Iqbal',
    ])
  })

  it('finds Javier Hernández from his nickname', async () => {
    // He has no passages and no nationality: the referential covers far more
    // footballers than the ones that can be played, so a suggestion tells the
    // player nothing (specs §3).
    expect(await searchFootballers({ query: 'Chicharito' })).toEqual([
      { footballerId: SEARCH_FOOTBALLER_IDS.hernandez, name: 'Javier Hernández' },
    ])
  })

  it('never shows the alias that matched, only the canonical name', async () => {
    expect(await names('zizou')).toEqual(['Zinedine Zidane'])
  })

  it('returns one suggestion per footballer however many of his terms match', async () => {
    // `zi` matches four of Zidane's terms; he is one suggestion, not four.
    const suggestions = await searchFootballers({ query: 'zi' })
    const zidane = suggestions.filter((s) => s.footballerId === FOOTBALLER_IDS.complete)

    expect(zidane).toEqual([
      { footballerId: FOOTBALLER_IDS.complete, name: 'Zinedine Zidane' },
    ])
  })

  it('ranks by notoriety and never alphabetically', async () => {
    // "Zidane Iqbal" sorts first alphabetically and is 139 sitelinks behind.
    const suggestions = await names('zid')

    expect(suggestions[0]).toBe('Zinedine Zidane')
    expect(suggestions).not.toEqual([...suggestions].sort((a, b) => a.localeCompare(b)))
  })

  it('orders a notoriety tie the same way on every call', async () => {
    // Two footballers on 6 sitelinks: the sequence must not shuffle between two
    // keystrokes, or the player clicks the row that moved.
    const first = await names('zid')
    const second = await names('zid')

    expect(second).toEqual(first)
    expect(first.slice(1)).toEqual(['Zidan Ferreira', 'Zidane Iqbal'])
  })

  it('still finds a common name typed with a typo', async () => {
    // A letter for another, and two letters swapped: both are what a player
    // actually does, and trigrams are what rescues them.
    expect(await names('zidsne')).toContain('Zinedine Zidane')
    expect(await names('zidnae')).toContain('Zinedine Zidane')
    expect(await names('zinedien zidane')).toContain('Zinedine Zidane')
    expect(await names('javier hernadez')).toContain('Javier Hernández')
  })

  it('puts the notorious footballer first among equally good typo matches', async () => {
    // The rescue ranks on similarity to the nearest tenth, then notoriety: a
    // correctly spelled name always has a prefix match, so anything reaching
    // the trigram index is a misspelling — and a misspelling of a famous
    // footballer beats an exact hit on an obscure one.
    expect((await names('zidnae'))[0]).toBe('Zinedine Zidane')
  })

  it('never lets a typo match outrank an exact prefix', async () => {
    // The prefix is the dominant case; the trigram index is a rescue, and a
    // rescue that reorders good results is a regression.
    const suggestions = await names('zidane')

    expect(suggestions.slice(0, 2)).toEqual(['Zinedine Zidane', 'Zidane Iqbal'])
  })

  it('finds a footballer by his surname alone, above an obscure namesake', async () => {
    // The case the trigram rescue cannot save: `papin` prefix-matches "Papin
    // Sarr", so the rescue never fires and Jean-Pierre Papin would be invisible
    // without the word term the import derives from his name. Measured on the
    // real extract, 72 % of the notorious multi-word footballers have no
    // surname alias — this is the general case, not the exception.
    expect(await names('papin')).toEqual(['Jean-Pierre Papin', 'Papin Sarr'])
  })

  it('ignores the accents and the case of the query', async () => {
    expect(await names('ZINÉDINE')).toEqual(['Zinedine Zidane'])
    expect(await names('Javier Hernández')).toEqual(['Javier Hernández'])
  })

  it('answers from two characters', async () => {
    expect(await names('zi')).not.toEqual([])
  })

  it('answers nothing below two characters', async () => {
    // The floor is a load lever, and the server holds it too: the client's
    // debounce is not a security boundary (docs/stack-technique.md §10).
    expect(await names('z')).toEqual([])
    expect(await names('')).toEqual([])
    expect(await names('  ')).toEqual([])
    // Two characters of punctuation normalise to nothing at all.
    expect(await names('!!')).toEqual([])
  })

  it('returns nothing for a name that is not in the referential', async () => {
    expect(await names('kwyjibo')).toEqual([])
  })

  it('honours the limit', async () => {
    expect(await names('zid', 1)).toEqual(['Zinedine Zidane'])
    expect(await names('zid', 2)).toEqual(['Zinedine Zidane', 'Zidan Ferreira'])
  })

  it('treats a query full of LIKE wildcards as the empty query it is', async () => {
    // Normalisation keeps letters and digits only, so `%` never reaches the
    // pattern. A wildcard query that listed the whole referential would be a
    // way to enumerate it.
    expect(await names('%')).toEqual([])
    expect(await names('%%')).toEqual([])
  })
})

/**
 * The same service, on a referential built by the *import* instead of by the
 * fixture.
 *
 * The two halves have to agree on what a term is: one stores it normalised, the
 * other normalises the query before looking for it, and they share a single
 * function to do it (`normalizeSearchTerm`). Nothing but a test that crosses the
 * seam can say the agreement holds — which is why these three behaviours are
 * asserted twice, once on fixture rows and once on imported ones.
 */
describe('searchFootballers, on an imported referential', () => {
  const HEADERS = 'qid,name,lang,sex,wiki_fr,wiki_en,sitelinks,teams'

  beforeEach(async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ppfq-search-'))
    const footballersCsv = join(directory, 'footballers.csv')
    const aliasesCsv = join(directory, 'aliases.csv')

    await writeFile(
      footballersCsv,
      [
        HEADERS,
        // The French URL carries the accent the name does not, exactly as in
        // the extract.
        'Q1835,Zinedine Zidane,mul,m,https://fr.wikipedia.org/wiki/Zinédine_Zidane,,145,9',
        'Q165125,Javier Hernández,mul,m,,,69,10',
        'Q108528154,Zidane Iqbal,mul,m,,,6,2',
      ].join('\n') + '\n',
    )
    await writeFile(
      aliasesCsv,
      ['qid,alias', 'Q1835,Zidane', 'Q1835,Zinédine Zidane', 'Q165125,Chicharito'].join(
        '\n',
      ) + '\n',
    )

    const connectionString = process.env.DATABASE_URL
    if (connectionString === undefined || connectionString === '') {
    throw new Error('DATABASE_URL is not set for the test run.')
  }

    await importReferential({ connectionString, footballersCsv, aliasesCsv })
  })

  it('finds by prefix, by alias, and through a typo', async () => {
    expect(await names('zid')).toEqual(['Zinedine Zidane', 'Zidane Iqbal'])
    expect(await names('Chicharito')).toEqual(['Javier Hernández'])
    expect(await names('zidnae')).toContain('Zinedine Zidane')
  })
})
