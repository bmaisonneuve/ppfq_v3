import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import { importReferential } from '../../scripts/referential.ts'
import type { ReferentialImportReport } from '../../scripts/referential.ts'

import { pool } from '@test/setup/db'

/**
 * The referential import: 382 703 footballers and 225 886 aliases from `.data/`
 * into the two tables the typeahead reads.
 *
 * It is tooling rather than a service — it runs under plain Node, from a CLI,
 * like the migrations (see the header of `scripts/referential.ts`) — so its
 * tests sit in `test/database/` next to the migration test rather than on the
 * service seam.
 *
 * Everything here runs on CSV files written to a temp directory. Small ones, but
 * shaped like the real extract: the quoted field with a comma in it, the two
 * spellings of one accented name, the homonyms, the nickname.
 *
 * Nothing here calls a service — that is what `test/database/` means. The one
 * thing that has to be checked *across* the two halves, that the import and the
 * typeahead agree on what a term is, is checked from the service seam in
 * `test/services/search.service.test.ts`.
 */
const HEADERS = {
  footballers: 'qid,name,lang,sex,wiki_fr,wiki_en,sitelinks,teams',
  aliases: 'qid,alias',
}

let directory: string

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ppfq-referential-'))
})

/** Writes the two CSVs and imports them, exactly as the CLI would. */
async function importCsv(options: {
  footballers: string[]
  aliases?: string[]
}): Promise<ReferentialImportReport> {
  const footballersCsv = join(directory, 'footballers.csv')
  const aliasesCsv = join(directory, 'footballer_aliases.csv')

  await writeFile(footballersCsv, `${[HEADERS.footballers, ...options.footballers].join('\n')}\n`)
  await writeFile(
    aliasesCsv,
    `${[HEADERS.aliases, ...(options.aliases ?? [])].join('\n')}\n`,
  )

  return await importReferential({
    connectionString: databaseUrl(),
    footballersCsv,
    aliasesCsv,
  })
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set for the test run.')
  return url
}

async function footballerRows() {
  const { rows } = await pool.query<{
    wikidata_qid: string
    name: string
    sitelinks: number
    wiki_fr_url: string | null
  }>(
    `SELECT wikidata_qid, name, sitelinks, wiki_fr_url FROM footballers ORDER BY name, wikidata_qid`,
  )
  return rows
}

async function termRows() {
  const { rows } = await pool.query<{
    name: string
    term: string
    is_canonical: boolean
  }>(
    `SELECT f.name, n.term, n.is_canonical
     FROM footballer_names n JOIN footballers f ON f.id = n.footballer_id
     ORDER BY f.name, n.term`,
  )
  return rows
}

// Zidane as the extract really has him: the French Wikipedia URL carries the
// accent, and the aliases carry both spellings, the surname and the nickname.
const ZIDANE =
  'Q1835,Zinedine Zidane,mul,m,https://fr.wikipedia.org/wiki/Zinédine_Zidane,https://en.wikipedia.org/wiki/Zinedine_Zidane,145,9'
const ZIDANE_ALIASES = [
  'Q1835,Zinédine Zidane',
  'Q1835,Zidane',
  'Q1835,Zizou',
  'Q1835,Zinedine Zidane',
]

describe('importReferential', () => {
  it('brings a footballer in with his canonical name and his aliases', async () => {
    const report = await importCsv({ footballers: [ZIDANE], aliases: ZIDANE_ALIASES })

    expect(await footballerRows()).toEqual([
      {
        wikidata_qid: 'Q1835',
        name: 'Zinedine Zidane',
        sitelinks: 145,
        wiki_fr_url: 'https://fr.wikipedia.org/wiki/Zinédine_Zidane',
      },
    ])
    expect(await termRows()).toEqual([
      // `zidane` arrives twice over — as an alias and as the second word of the
      // canonical name — and is one row.
      { name: 'Zinedine Zidane', term: 'zidane', is_canonical: false },
      { name: 'Zinedine Zidane', term: 'zinedine zidane', is_canonical: true },
      { name: 'Zinedine Zidane', term: 'zizou', is_canonical: false },
    ])
    expect(report).toMatchObject({ footballersRead: 1, footballersKept: 1, homonymsDropped: 0 })
  })

  it('collapses the two spellings of one accented name onto a single term', async () => {
    // "Zinédine Zidane" and "Zinedine Zidane" both normalise to the same term.
    // Four aliases went in; three rows come out, and the one that equals the
    // canonical name stays canonical.
    await importCsv({ footballers: [ZIDANE], aliases: ZIDANE_ALIASES })

    const terms = (await termRows()).map((r) => r.term)

    expect(terms).toEqual(['zidane', 'zinedine zidane', 'zizou'])
  })

  it('reads a quoted field with a comma inside it', async () => {
    // Javier Hernández's French URL is `..._(football,_1988)`, quoted in the
    // CSV. A parser that split on every comma would shift every later column.
    await importCsv({
      footballers: [
        'Q165125,Javier Hernández,mul,m,"https://fr.wikipedia.org/wiki/Javier_Hernández_(football,_1988)",https://en.wikipedia.org/wiki/Javier_Hernández,69,10',
      ],
      aliases: ['Q165125,Chicharito'],
    })

    expect(await footballerRows()).toEqual([
      {
        wikidata_qid: 'Q165125',
        name: 'Javier Hernández',
        sitelinks: 69,
        wiki_fr_url: 'https://fr.wikipedia.org/wiki/Javier_Hernández_(football,_1988)',
      },
    ])
  })

  it('keeps only the most notorious of two homonyms, and drops the other entirely', async () => {
    // 13 042 of the 382 703 footballers of the extract are homonyms that do not
    // enter. Recovering a notable one is a manual insert
    // (docs/modele-donnees.md §3).
    const report = await importCsv({
      footballers: [
        'Q100,Marc Dupont,mul,m,,,42,5',
        'Q200,Marc Dupont,mul,m,,,3,2',
        'Q300,Autre Nom,mul,m,,,1,1',
      ],
      aliases: ['Q100,Dupontos', 'Q200,Duponti'],
    })

    expect(await footballerRows()).toEqual([
      { wikidata_qid: 'Q300', name: 'Autre Nom', sitelinks: 1, wiki_fr_url: null },
      { wikidata_qid: 'Q100', name: 'Marc Dupont', sitelinks: 42, wiki_fr_url: null },
    ])
    // The loser's alias goes with him: nothing points at a footballer who is
    // not in the referential. `nom` and `dupont` are the second words of the two
    // names, indexed so a surname can be typed on its own.
    expect((await termRows()).map((r) => r.term)).toEqual([
      'autre nom',
      'nom',
      'dupont',
      'dupontos',
      'marc dupont',
    ])
    expect(report).toMatchObject({
      footballersRead: 3,
      footballersKept: 2,
      homonymsDropped: 1,
    })
  })

  it('breaks a tie between homonyms on the lower Wikidata number, so the winner never changes', async () => {
    await importCsv({
      footballers: ['Q900,Marc Dupont,mul,m,,,7,5', 'Q800,Marc Dupont,mul,m,,,7,5'],
    })

    expect((await footballerRows()).map((r) => r.wikidata_qid)).toEqual(['Q800'])
  })

  it('changes nothing when it is run a second time', async () => {
    // The acceptance criterion: re-running duplicates nothing.
    await importCsv({ footballers: [ZIDANE], aliases: ZIDANE_ALIASES })
    const afterFirst = await termRows()

    const report = await importCsv({ footballers: [ZIDANE], aliases: ZIDANE_ALIASES })

    expect(await termRows()).toEqual(afterFirst)
    expect(await footballerRows()).toHaveLength(1)
    expect(report).toMatchObject({ footballersKept: 1 })
  })

  it('updates a footballer whose notoriety or name moved rather than inserting a second one', async () => {
    await importCsv({ footballers: [ZIDANE] })

    await importCsv({
      footballers: ['Q1835,Zinedine Yazid Zidane,mul,m,,,150,9'],
    })

    expect(await footballerRows()).toEqual([
      {
        wikidata_qid: 'Q1835',
        name: 'Zinedine Yazid Zidane',
        sitelinks: 150,
        wiki_fr_url: null,
      },
    ])
    // The old term stays: nothing here deletes, and a name a player might still
    // type is not worth losing. Re-importing does not accumulate duplicates.
    expect((await termRows()).map((r) => r.term)).toEqual([
      'yazid',
      'zidane',
      'zinedine yazid zidane',
      'zinedine zidane',
    ])
  })

  it('indexes each word after the first, so a surname is typeable on its own', async () => {
    // The prefix index is anchored at the start of a term, so without these
    // rows `papin` reaches Jean-Pierre Papin only if Wikidata ships "Papin" as
    // an alias — which it does for 28 % of the notorious multi-word footballers
    // of the real extract.
    await importCsv({
      footballers: ['Q170392,Jean-Pierre Papin,mul,m,,,42,6'],
      aliases: ['Q170392,JPP'],
    })

    expect((await termRows()).map((r) => [r.term, r.is_canonical])).toEqual([
      ['jean pierre papin', true],
      ['jpp', false],
      // The first word is absent on purpose: `jean%` already matches the whole
      // name by prefix.
      ['papin', false],
      ['pierre', false],
    ])
  })

  it('keeps a word that is also an alias canonical-free but single', async () => {
    // Zidane arrives twice, once as the second word of his name and once as an
    // alias in its own right. One row.
    await importCsv({ footballers: [ZIDANE], aliases: ['Q1835,Zidane'] })

    const zidane = (await termRows()).filter((r) => r.term === 'zidane')

    expect(zidane).toEqual([
      { name: 'Zinedine Zidane', term: 'zidane', is_canonical: false },
    ])
  })

  it('leaves a name with whoever already holds it when notoriety shifts', async () => {
    // Nothing here deletes and `name` carries no unique constraint, so an
    // inserted new winner would sit *beside* the old one and the suggestions
    // would show the same name twice. The incumbent keeps it instead — and a
    // career an admin curated for an hour is not cascaded away.
    await importCsv({
      footballers: ['Q100,Marc Dupont,mul,m,,,42,5', 'Q200,Marc Dupont,mul,m,,,3,2'],
    })

    const report = await importCsv({
      footballers: ['Q100,Marc Dupont,mul,m,,,3,5', 'Q200,Marc Dupont,mul,m,,,42,2'],
    })

    expect(await footballerRows()).toEqual([
      { wikidata_qid: 'Q100', name: 'Marc Dupont', sitelinks: 3, wiki_fr_url: null },
    ])
    expect(report).toMatchObject({ footballersKept: 1, homonymsDropped: 1 })
  })

  it('skips an alias with nothing searchable in it', async () => {
    await importCsv({ footballers: [ZIDANE], aliases: ['Q1835,!!!', 'Q1835,   '] })

    // Only the name and its second word, nothing from the two junk aliases.
    expect((await termRows()).map((r) => r.term)).toEqual(['zidane', 'zinedine zidane'])
  })

  it('ignores an alias pointing at a footballer who is not in the extract', async () => {
    await importCsv({ footballers: [ZIDANE], aliases: ['Q999999,Fantôme'] })

    expect((await termRows()).map((r) => r.term)).toEqual(['zidane', 'zinedine zidane'])
  })

  it('counts what it did', async () => {
    const report = await importCsv({
      footballers: ['Q100,Marc Dupont,mul,m,,,42,5', 'Q200,Marc Dupont,mul,m,,,3,2'],
      aliases: ['Q100,Dupont', 'Q100,Dupont', 'Q200,Perdu'],
    })

    expect(report).toEqual({
      footballersRead: 2,
      footballersKept: 1,
      homonymsDropped: 1,
      aliasesRead: 3,
      termsWritten: 2,
    })
  })
})
