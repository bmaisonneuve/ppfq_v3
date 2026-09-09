/**
 * The search referential's isomorphic layer: what a search term *is*.
 *
 * It lives in `shared/` rather than in `server/domain/` because three callers
 * need the exact same normalisation and only one of them is the server:
 *
 * - the query path (`server/services/search.service.ts`),
 * - the referential import (`scripts/referential.ts`), which runs under plain
 *   Node and would throw on `import 'server-only'`,
 * - the client typeahead, which holds the same two-character floor.
 *
 * Normalisation is the contract between the import and the query: a term is
 * stored normalised and a query is normalised the same way. Any disagreement
 * between the two sides is a footballer nobody can find, which is why the rule
 * is one function tested as a matrix (`test/shared/search-term.test.ts`).
 *
 * Deliberately free of Zod, unlike most of `shared/`: the client typeahead
 * imports this module, and the schema for the endpoint's query string — which
 * nothing but that endpoint parses — would put the whole validator in the game
 * bundle. It lives in the route handler instead.
 */
/**
 * The floor, held by the client *and* the server.
 *
 * Not comfort: a load lever. Moving to search-with-selection multiplies request
 * volume by ~3.5 and makes the typeahead the most-hit endpoint of the site
 * (docs/stack-technique.md §10).
 */
export const MIN_SEARCH_LENGTH = 2

/** Client-side debounce, for the same reason. */
export const SEARCH_DEBOUNCE_MS = 250

export const DEFAULT_SUGGESTION_LIMIT = 10
export const MAX_SUGGESTION_LIMIT = 20

/** The longest canonical name in the extract is 52 characters. */
export const MAX_QUERY_LENGTH = 60

/**
 * Latin letters NFD does not decompose, because the diacritic is *part of the
 * letter* rather than a mark on top of one. Without this a Danish or Polish
 * footballer is unreachable by anyone typing on an ordinary keyboard.
 */
const FOLDED_LETTERS: Record<string, string> = {
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ł: 'l',
  æ: 'ae',
  œ: 'oe',
  ß: 'ss',
  þ: 'th',
  ı: 'i',
  ħ: 'h',
  ŧ: 't',
  ŋ: 'n',
  ə: 'e',
}

const FOLDED_LETTERS_PATTERN = new RegExp(`[${Object.keys(FOLDED_LETTERS).join('')}]`, 'g')

/** Apostrophes and dots close up: "N'Golo" is typed `ngolo`, not `n golo`. */
const CLOSING_PUNCTUATION = /['’ʼ`´.]/g

/** The Latin combining diacritics NFD produces, stripped after decomposition. */
const COMBINING_MARKS = /[\u0300-\u036f]/g

/**
 * The canonical form of anything searchable: lower case, unaccented, one space
 * between words.
 *
 * Everything that is not a letter or a digit becomes a word break, so a
 * normalised term carries no `%`, `_` or `\` — which is what makes it safe to
 * interpolate into a `LIKE` pattern without escaping. A letter this function
 * does not know how to fold is *kept* rather than dropped: a term that
 * normalised to nothing would be a footballer no query could reach.
 */
export function normalizeSearchTerm(input: string): string {
  return input
    .normalize('NFD')
    .toLowerCase()
    .replace(COMBINING_MARKS, '')
    .replace(FOLDED_LETTERS_PATTERN, (letter) => FOLDED_LETTERS[letter] ?? letter)
    .replace(CLOSING_PUNCTUATION, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/**
 * One suggestion. It carries the *canonical* name and never the alias that
 * matched: `Chicharito` finds Javier Hernández and the list says "Javier
 * Hernández" (specs §3, issue #3).
 *
 * The id is what an essai is made of — a guess is a `footballerId`, never free
 * text — so this is also the shape the guess adapter consumes (#9).
 */
export type FootballerSuggestion = {
  footballerId: string
  name: string
}

/** The body of `GET /api/footballers/search`, as the client typeahead reads it. */
export type SearchResponse = {
  suggestions: FootballerSuggestion[]
}

/** A row of `footballer_names`, before it has an id or a footballer. */
export type SearchTerm = {
  term: string
  /** True only for the name itself, and only when it is the canonical one. */
  isCanonical: boolean
}

/**
 * Every term a name has to be indexed under: the whole name, then each of its
 * words after the first.
 *
 * Without the word terms a surname is not typeable on its own — the prefix
 * index is anchored at the start of a term, so `papin` reaches "Jean-Pierre
 * Papin" only if Wikidata happens to ship "Papin" as an alias, which it does
 * for 28 % of the multi-word footballers notorious enough to be scheduled. The
 * first word needs no row of its own: a prefix of the whole term already
 * matches it.
 *
 * A word term is never displayed and is never canonical, exactly like an alias.
 *
 * One definition for two callers — the referential import in `scripts/` and the
 * career import, which creates the footballers the referential dropped as
 * homonyms. A footballer inserted without these rows is a footballer the
 * typeahead cannot reach, so he cannot be guessed either.
 *
 * A name that normalises to nothing yields no term at all: an empty term would
 * match every prefix query.
 */
export function nameSearchTerms(name: string, isCanonical: boolean): SearchTerm[] {
  const term = normalizeSearchTerm(name)
  if (term === '') return []

  const [, ...tail] = term.split(' ')

  return [
    { term, isCanonical },
    ...tail.map((word) => ({ term: word, isCanonical: false })),
  ]
}
