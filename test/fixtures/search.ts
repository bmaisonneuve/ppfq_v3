/**
 * Search-only footballers, on top of the catalogue fixture.
 *
 * `test/fixtures/catalogue.ts` carries one footballer per *shape the source
 * produces*, which is what a curation or scheduling test needs. Ranking a
 * suggestion list needs something else: several footballers matching the same
 * few letters, with notoriety and alphabet pulling in opposite directions. Those
 * rows live here so the catalogue fixture keeps saying only what it says.
 *
 * None of these three is curated — no passages, no nationality. That is the
 * point: the referential covers far more footballers than the ones that can be
 * played, so a suggestion reveals nothing (specs §3).
 *
 * | Footballer          | What it is for                                          |
 * |---------------------|---------------------------------------------------------|
 * | `hernandez`         | An alias — `Chicharito` must find "Javier Hernández"    |
 * | `zidaneNamesake`    | Notoriety against the alphabet: he sorts *before* Zidane |
 * | `zidanNamesake`     | Same notoriety as the namesake, so the tie must be stable |
 * | `papin`             | A surname typed on its own, against an obscure namesake |
 * | `papinNamesake`     | The namesake whose term *starts* with that surname      |
 */
import { footballerNames, footballers } from '@/server/db/schema'
import type { Db } from '@/server/db/client'

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`

export const SEARCH_FOOTBALLER_IDS = {
  hernandez: uuid('3006'),
  zidaneNamesake: uuid('3007'),
  zidanNamesake: uuid('3008'),
  papin: uuid('3009'),
  papinNamesake: uuid('3010'),
} as const

const FOOTBALLER_ROWS = [
  {
    id: SEARCH_FOOTBALLER_IDS.hernandez,
    wikidataQid: 'Q165125',
    name: 'Javier Hernández',
    wikiFrUrl: 'https://fr.wikipedia.org/wiki/Javier_Hernández_(football,_1988)',
    wikiEnUrl: 'https://en.wikipedia.org/wiki/Javier_Hernández',
    sitelinks: 69,
    nationalityId: null,
  },
  {
    // Real footballer, and the reason the ranking rule is worth testing: he
    // comes *first* alphabetically and 139 sitelinks behind Zidane.
    id: SEARCH_FOOTBALLER_IDS.zidaneNamesake,
    wikidataQid: 'Q108528154',
    name: 'Zidane Iqbal',
    wikiFrUrl: null,
    wikiEnUrl: null,
    sitelinks: 6,
    nationalityId: null,
  },
  {
    // Invented, and deliberately on the same notoriety as the namesake: with
    // sitelinks tied, something else has to make the order repeatable.
    id: SEARCH_FOOTBALLER_IDS.zidanNamesake,
    wikidataQid: 'Q900000005',
    name: 'Zidan Ferreira',
    wikiFrUrl: null,
    wikiEnUrl: null,
    sitelinks: 6,
    nationalityId: null,
  },
  {
    // Wikidata ships him no "Papin" alias, unlike Zidane — which is the case
    // for 72 % of the notorious multi-word footballers of the real extract.
    id: SEARCH_FOOTBALLER_IDS.papin,
    wikidataQid: 'Q170392',
    name: 'Jean-Pierre Papin',
    wikiFrUrl: null,
    wikiEnUrl: null,
    sitelinks: 42,
    nationalityId: null,
  },
  {
    // Invented, and the reason the case is nasty: *his* term starts with
    // "papin", so a prefix query for the surname finds him and stops there.
    id: SEARCH_FOOTBALLER_IDS.papinNamesake,
    wikidataQid: 'Q900000006',
    name: 'Papin Sarr',
    wikiFrUrl: null,
    wikiEnUrl: null,
    sitelinks: 2,
    nationalityId: null,
  },
]

/**
 * Terms, written out already normalised — see the note in the catalogue
 * fixture.
 *
 * "Chicharito" is his canonical label in the real extract; here he is the other
 * way round, canonical name plus nickname alias, which is the shape the
 * acceptance criterion describes and the one the display rule has to survive.
 */
const NAME_ROWS = [
  { footballerId: SEARCH_FOOTBALLER_IDS.hernandez, term: 'javier hernandez', isCanonical: true },
  { footballerId: SEARCH_FOOTBALLER_IDS.hernandez, term: 'chicharito', isCanonical: false },
  {
    footballerId: SEARCH_FOOTBALLER_IDS.hernandez,
    term: 'javier hernandez balcazar',
    isCanonical: false,
  },

  { footballerId: SEARCH_FOOTBALLER_IDS.zidaneNamesake, term: 'zidane iqbal', isCanonical: true },
  { footballerId: SEARCH_FOOTBALLER_IDS.zidanNamesake, term: 'zidan ferreira', isCanonical: true },

  // Papin has no nickname; what makes his surname reachable is the word term
  // the import derives from the name itself. Written out here the way the
  // import writes it — words after the first, never canonical.
  { footballerId: SEARCH_FOOTBALLER_IDS.papin, term: 'jean pierre papin', isCanonical: true },
  { footballerId: SEARCH_FOOTBALLER_IDS.papin, term: 'pierre', isCanonical: false },
  { footballerId: SEARCH_FOOTBALLER_IDS.papin, term: 'papin', isCanonical: false },
  { footballerId: SEARCH_FOOTBALLER_IDS.papinNamesake, term: 'papin sarr', isCanonical: true },
  { footballerId: SEARCH_FOOTBALLER_IDS.papinNamesake, term: 'sarr', isCanonical: false },
]

/** Call after `seedCatalogue`: it adds to the referential, it does not replace it. */
export async function seedSearchReferential(executor: Db): Promise<void> {
  await executor.insert(footballers).values(FOOTBALLER_ROWS)
  await executor.insert(footballerNames).values(NAME_ROWS)
}
