/**
 * The catalogue fixture: five footballers, one per shape the source actually
 * produces. Every ticket that needs catalogue data seeds from here rather than
 * inventing its own rows, so the awkward cases stay in front of us.
 *
 * The shapes come from the measurements in `docs/research/wikidata-coverage.md`:
 *
 * | Profile           | What it is                                                        |
 * |-------------------|-------------------------------------------------------------------|
 * | `complete`        | Curated and schedulable: nationality, matches and goals everywhere |
 * | `incomplete`      | No nationality, and a passage with no matches and no goals         |
 * | `duplicatePassage`| The same (footballer, club, start year) twice — 6 721 such groups   |
 * | `untypedReserve`  | A reserve team the source does not type as one, plus an open spell |
 * | `loan`            | A loan overlapping the parent contract, both starting the same year |
 *
 * Identifiers are fixed so a test can name a row without a lookup. The
 * defective profiles use invented footballers: they carry no claim about a real
 * person's career.
 *
 * Each of the five also gets his search terms, because a footballer with no term
 * is a state the import cannot produce. Rows aimed specifically at *ranking* a
 * suggestion list live in `search.ts` instead, so this file keeps saying only
 * what it says.
 */
import {
  clubs,
  footballerNames,
  footballers,
  nationalities,
  nationalityFlags,
  playerClubs,
} from '@/server/db/schema'
import type { Db } from '@/server/db/client'

/** Fixed, readable identifiers. The leading digit says which table a row is in. */
const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`

export const NATIONALITY_IDS = {
  fr: uuid('1001'),
  es: uuid('1002'),
} as const

export const CLUB_IDS = {
  cannes: uuid('2001'),
  bordeaux: uuid('2002'),
  juventus: uuid('2003'),
  realMadrid: uuid('2004'),
  rennes: uuid('2005'),
  lyon: uuid('2006'),
  reims: uuid('2007'),
  barcelonaC: uuid('2008'),
  levante: uuid('2009'),
  nantes: uuid('2010'),
} as const

export const FOOTBALLER_IDS = {
  complete: uuid('3001'),
  incomplete: uuid('3002'),
  duplicatePassage: uuid('3003'),
  untypedReserve: uuid('3004'),
  loan: uuid('3005'),
} as const

export const PASSAGE_IDS = {
  completeCannes: uuid('4001'),
  completeBordeaux: uuid('4002'),
  completeJuventus: uuid('4003'),
  completeRealMadrid: uuid('4004'),
  incompleteNantes: uuid('4005'),
  incompleteRennes: uuid('4006'),
  duplicateFirst: uuid('4007'),
  duplicateSecond: uuid('4008'),
  reserveBarcelonaC: uuid('4009'),
  reserveLevante: uuid('4010'),
  loanContractLyon: uuid('4011'),
  loanReims: uuid('4012'),
} as const

/**
 * The real rendering of `fr.svg` by `scripts/flags.ts`, 88 bytes of lossless
 * WebP, and its real SHA-256.
 *
 * Real rather than invented because the key **is** the hash: a made-up pair
 * would let a bug that stores the wrong address pass every test in the suite.
 * It is also why the bytes are worth their line of base64 — a `bytea` round
 * trip that mangles them is exactly what this catches.
 */
export const FRANCE_FLAG_KEY = 'f44557152d018d2baa4e873d4aca445a1e8fb2dd89fe8c71f8aca899ec7e7c30'

const FRANCE_FLAG_BYTES = Buffer.from(
  'UklGRlAAAABXRUJQVlA4TEQAAAAvv8AjACdAkG2zzZ/51yDItpnK/K0G8gtIiLLAZcvNf/w3BTDboJiRJGgUZlgWYf29+r9HRP8noOkSHtPvv/ff+29EAw==',
  'base64',
)

const NATIONALITY_FLAG_ROWS = [
  {
    key: FRANCE_FLAG_KEY,
    bytes: FRANCE_FLAG_BYTES,
    contentType: 'image/webp',
    byteSize: FRANCE_FLAG_BYTES.byteLength,
    sourceFile: 'flag-icons/fr.svg',
    license: 'flag-icons (MIT)',
  },
]

/**
 * Two nationalities, and deliberately only one flag: a nationality the seed has
 * not reached yet is the normal state of a freshly imported row, and a test
 * that only ever saw dressed rows would not notice the day `flag_key` stopped
 * being nullable in practice.
 */
const NATIONALITY_ROWS = [
  { id: NATIONALITY_IDS.fr, code: 'FR', frName: 'France', enName: 'France', flagKey: FRANCE_FLAG_KEY },
  { id: NATIONALITY_IDS.es, code: 'ES', frName: 'Espagne', enName: 'Spain', flagKey: null },
]

/**
 * The Wikidata ids are the real ones — checked against the source, player
 * counts and all. They have to be: the career import matches a club on
 * `wikidata_qid`, so an invented id would make it create a second "AS Cannes"
 * beside this one and the test would pass while the catalogue doubled.
 */
const CLUB_ROWS = [
  { id: CLUB_IDS.cannes, wikidataQid: 'Q298267', frName: 'AS Cannes', enName: 'AS Cannes' },
  { id: CLUB_IDS.bordeaux, wikidataQid: 'Q172476', frName: 'Girondins de Bordeaux', enName: 'FC Girondins de Bordeaux' },
  { id: CLUB_IDS.juventus, wikidataQid: 'Q1422', frName: 'Juventus', enName: 'Juventus FC' },
  { id: CLUB_IDS.realMadrid, wikidataQid: 'Q8682', frName: 'Real Madrid', enName: 'Real Madrid CF' },
  { id: CLUB_IDS.rennes, wikidataQid: 'Q19509', frName: 'Stade rennais', enName: 'Stade Rennais FC' },
  { id: CLUB_IDS.lyon, wikidataQid: 'Q704', frName: 'Olympique lyonnais', enName: 'Olympique Lyonnais' },
  { id: CLUB_IDS.reims, wikidataQid: 'Q208228', frName: 'Stade de Reims', enName: 'Stade de Reims' },
  // Not typed as a reserve team in the source, and the label heuristic is the
  // only signal: it enters the catalogue and an admin removes it by hand.
  { id: CLUB_IDS.barcelonaC, wikidataQid: 'Q2346842', frName: 'FC Barcelone C', enName: 'FC Barcelona C' },
  { id: CLUB_IDS.levante, wikidataQid: 'Q8823', frName: 'Levante UD', enName: 'Levante UD' },
  { id: CLUB_IDS.nantes, wikidataQid: 'Q192071', frName: 'FC Nantes', enName: 'FC Nantes' },
]

const FOOTBALLER_ROWS = [
  {
    id: FOOTBALLER_IDS.complete,
    wikidataQid: 'Q1835',
    name: 'Zinedine Zidane',
    wikiFrUrl: 'https://fr.wikipedia.org/wiki/Zinedine_Zidane',
    wikiEnUrl: 'https://en.wikipedia.org/wiki/Zinedine_Zidane',
    sitelinks: 148,
    nationalityId: NATIONALITY_IDS.fr,
  },
  {
    // No nationality: hint 3 would be empty, so this one is not schedulable.
    id: FOOTBALLER_IDS.incomplete,
    wikidataQid: 'Q900000001',
    name: 'Lucien Farge',
    wikiFrUrl: 'https://fr.wikipedia.org/wiki/Lucien_Farge',
    wikiEnUrl: null,
    sitelinks: 3,
    nationalityId: null,
  },
  {
    id: FOOTBALLER_IDS.duplicatePassage,
    wikidataQid: 'Q900000002',
    name: 'Yannick Perreau',
    wikiFrUrl: null,
    wikiEnUrl: null,
    sitelinks: 7,
    nationalityId: NATIONALITY_IDS.fr,
  },
  {
    id: FOOTBALLER_IDS.untypedReserve,
    wikidataQid: 'Q900000003',
    name: 'Íñigo Sarasola',
    wikiFrUrl: null,
    wikiEnUrl: 'https://en.wikipedia.org/wiki/I%C3%B1igo_Sarasola',
    sitelinks: 5,
    nationalityId: NATIONALITY_IDS.es,
  },
  {
    id: FOOTBALLER_IDS.loan,
    wikidataQid: 'Q900000004',
    name: 'Théo Balland',
    wikiFrUrl: null,
    wikiEnUrl: null,
    sitelinks: 11,
    nationalityId: NATIONALITY_IDS.fr,
  },
]

const PASSAGE_ROWS = [
  // complete — every passage has its league matches and goals.
  { id: PASSAGE_IDS.completeCannes, footballerId: FOOTBALLER_IDS.complete, clubId: CLUB_IDS.cannes, isLoan: false, startYear: 1988, endYear: 1992, matches: 61, goals: 6 },
  { id: PASSAGE_IDS.completeBordeaux, footballerId: FOOTBALLER_IDS.complete, clubId: CLUB_IDS.bordeaux, isLoan: false, startYear: 1992, endYear: 1996, matches: 139, goals: 28 },
  { id: PASSAGE_IDS.completeJuventus, footballerId: FOOTBALLER_IDS.complete, clubId: CLUB_IDS.juventus, isLoan: false, startYear: 1996, endYear: 2001, matches: 151, goals: 24 },
  { id: PASSAGE_IDS.completeRealMadrid, footballerId: FOOTBALLER_IDS.complete, clubId: CLUB_IDS.realMadrid, isLoan: false, startYear: 2001, endYear: 2006, matches: 155, goals: 37 },

  // incomplete — the Nantes passage has neither matches nor goals.
  { id: PASSAGE_IDS.incompleteNantes, footballerId: FOOTBALLER_IDS.incomplete, clubId: CLUB_IDS.nantes, isLoan: false, startYear: 2009, endYear: 2013, matches: null, goals: null },
  { id: PASSAGE_IDS.incompleteRennes, footballerId: FOOTBALLER_IDS.incomplete, clubId: CLUB_IDS.rennes, isLoan: false, startYear: 2013, endYear: 2016, matches: 74, goals: 9 },

  // duplicatePassage — same footballer, same club, same start year, twice. The
  // second row is the worse-qualified declaration the import has to drop; it is
  // indistinguishable from a genuine second spell once it is in the catalogue.
  { id: PASSAGE_IDS.duplicateFirst, footballerId: FOOTBALLER_IDS.duplicatePassage, clubId: CLUB_IDS.rennes, isLoan: false, startYear: 2012, endYear: 2015, matches: 68, goals: 4 },
  { id: PASSAGE_IDS.duplicateSecond, footballerId: FOOTBALLER_IDS.duplicatePassage, clubId: CLUB_IDS.rennes, isLoan: false, startYear: 2012, endYear: 2015, matches: null, goals: null },

  // untypedReserve — a reserve team wearing senior clothes, then an open spell.
  { id: PASSAGE_IDS.reserveBarcelonaC, footballerId: FOOTBALLER_IDS.untypedReserve, clubId: CLUB_IDS.barcelonaC, isLoan: false, startYear: 2018, endYear: 2020, matches: 41, goals: 3 },
  { id: PASSAGE_IDS.reserveLevante, footballerId: FOOTBALLER_IDS.untypedReserve, clubId: CLUB_IDS.levante, isLoan: false, startYear: 2020, endYear: null, matches: 52, goals: 7 },

  // loan — both passages start in 2015. The loan is the shorter one and comes
  // first; only the years can change that order, never a drag & drop.
  { id: PASSAGE_IDS.loanContractLyon, footballerId: FOOTBALLER_IDS.loan, clubId: CLUB_IDS.lyon, isLoan: false, startYear: 2015, endYear: 2019, matches: 88, goals: 12 },
  { id: PASSAGE_IDS.loanReims, footballerId: FOOTBALLER_IDS.loan, clubId: CLUB_IDS.reims, isLoan: true, startYear: 2015, endYear: 2016, matches: 27, goals: 5 },
]

/**
 * Search terms. Every footballer of the referential has at least his canonical
 * term, so a fixture without these rows would model a state the import cannot
 * produce.
 *
 * The terms are written out already normalised rather than run through
 * `normalizeSearchTerm`. That is the point: the query normalises its input with
 * that function, so a normalisation that drifted would stop matching these
 * literals and the search tests would say so.
 *
 * Each name also carries its words after the first, as the import derives them:
 * the prefix index is anchored at the start of a term, so a surname is not
 * typeable on its own without them.
 */
const NAME_ROWS = [
  { footballerId: FOOTBALLER_IDS.complete, term: 'zinedine zidane', isCanonical: true },
  // `zidane` is both the second word of the name and an alias in its own right.
  // One row: that is what the unique index is for.
  // The aliases Wikidata actually ships for Q1835 — the surname among them,
  // which is what makes "Zidane" and a typo of it reach him at all.
  { footballerId: FOOTBALLER_IDS.complete, term: 'zidane', isCanonical: false },
  { footballerId: FOOTBALLER_IDS.complete, term: 'zizou', isCanonical: false },
  { footballerId: FOOTBALLER_IDS.complete, term: 'zinedine yazid zidane', isCanonical: false },
  { footballerId: FOOTBALLER_IDS.complete, term: 'yazid', isCanonical: false },

  { footballerId: FOOTBALLER_IDS.incomplete, term: 'lucien farge', isCanonical: true },
  { footballerId: FOOTBALLER_IDS.incomplete, term: 'farge', isCanonical: false },
  { footballerId: FOOTBALLER_IDS.duplicatePassage, term: 'yannick perreau', isCanonical: true },
  { footballerId: FOOTBALLER_IDS.duplicatePassage, term: 'perreau', isCanonical: false },
  { footballerId: FOOTBALLER_IDS.untypedReserve, term: 'inigo sarasola', isCanonical: true },
  { footballerId: FOOTBALLER_IDS.untypedReserve, term: 'sarasola', isCanonical: false },
  { footballerId: FOOTBALLER_IDS.loan, term: 'theo balland', isCanonical: true },
  { footballerId: FOOTBALLER_IDS.loan, term: 'balland', isCanonical: false },
]

/**
 * Inserts the whole fixture. Cheap enough to call from `beforeEach`; a test that
 * wants an empty catalogue simply does not call it.
 */
export async function seedCatalogue(executor: Db): Promise<void> {
  // Flags before nationalities: `flag_key` is a foreign key at them.
  await executor.insert(nationalityFlags).values(NATIONALITY_FLAG_ROWS)
  await executor.insert(nationalities).values(NATIONALITY_ROWS)
  await executor.insert(clubs).values(CLUB_ROWS)
  await executor.insert(footballers).values(FOOTBALLER_ROWS)
  await executor.insert(playerClubs).values(PASSAGE_ROWS)
  await executor.insert(footballerNames).values(NAME_ROWS)
}
