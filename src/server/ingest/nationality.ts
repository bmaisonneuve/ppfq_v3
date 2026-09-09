import 'server-only'

/**
 * Which of a footballer's countries is *the* nationality — a pure rule, and a
 * rule that refuses rather than guesses.
 *
 * The game shows one nationality, even for a dual national (specs §9), and it
 * shows it as hint 3 in the middle of a game: a wrong flag is worse than a
 * footballer an admin still has to finish curating. So the choice is made only
 * when the source is unambiguous, and every refusal is named in the report.
 *
 * Two properties, in this order:
 *
 * - **`P1532`, "country for sport"** — the sporting nationality itself. It is
 *   what settles Messi (three citizenships, Argentina for sport) and what makes
 *   an English footballer English rather than British: David Beckham is `P27`
 *   United Kingdom and `P1532` England.
 * - **`P27`, citizenship**, and only when there is exactly one. Two
 *   citizenships and no sporting country is precisely the case a machine cannot
 *   settle.
 *
 * ## The code, and why it is not always ISO 3166-1 alpha-2
 *
 * `nationalities.code` is documented as alpha-2 (`P297`), and for a country
 * that is what it holds. Two families of football nationalities have none:
 *
 * - the four UK nations, which are the whole point of the distinction above —
 *   England, Scotland, Wales and Northern Ireland carry only an ISO 3166-2
 *   subdivision code (`P300`: `GB-ENG`, `GB-SCT`, `GB-WLS`, `GB-NIR`);
 * - the countries that no longer exist, and whose players are exactly the ones
 *   a retro grid wants — Yugoslavia, Czechoslovakia and the USSR keep an
 *   alpha-3 (`P298`: `YUG`, `CSK`, `SUN`) and nothing shorter.
 *
 * Hence the chain alpha-2 → subdivision → alpha-3, and a refusal when even that
 * finds nothing. The column stays a unique natural key either way; what it does
 * not stay is strictly alpha-2, and `docs/modele-donnees.md` §3 says so.
 */

/** A country as `P1532` or `P27` gives it, with the codes it happens to carry. */
export type WikidataCountry = {
  qid: string
  /** Which property named it. `sport` wins over `citizenship`. */
  kind: 'sport' | 'citizenship'
  /** `P297`, ISO 3166-1 alpha-2. */
  alpha2: string | null
  /** `P300`, ISO 3166-2 — the only code England has. */
  subdivision: string | null
  /** `P298`, ISO 3166-1 alpha-3 — the only code Yugoslavia has. */
  alpha3: string | null
  frName: string | null
  enName: string | null
}

/** Ready to become a `nationalities` row. */
export type SelectedNationality = {
  qid: string
  code: string
  frName: string
  enName: string | null
}

/**
 * Why no nationality was chosen. Each of these leaves the footballer's current
 * nationality alone and lands in the import's report: he is simply not
 * schedulable until an admin picks one.
 */
export type NationalityRefusal =
  /** The source names no country at all. */
  | 'missing'
  /** Several sporting countries, or several citizenships and no sporting one. */
  | 'ambiguous'
  /** A country with no ISO code of any of the three kinds. */
  | 'no-code'
  /** A country with neither a French nor an English label. */
  | 'unnamed'

/** Exactly one of the two fields is set. */
export type NationalityChoice = {
  nationality: SelectedNationality | null
  refusal: NationalityRefusal | null
}

export function selectNationality(
  countries: readonly WikidataCountry[],
): NationalityChoice {
  // The identity query asks for both properties in one UNION, so the same
  // country arrives twice for anyone whose citizenship *is* his sporting
  // country. Collapsing on the qid first is what keeps that from reading as an
  // ambiguity.
  const sporting = distinctQids(countries.filter((c) => c.kind === 'sport'))
  const citizenships = distinctQids(countries.filter((c) => c.kind === 'citizenship'))
  const candidates = sporting.length > 0 ? sporting : citizenships

  if (candidates.length === 0) return refuse('missing')
  if (candidates.length > 1) return refuse('ambiguous')

  const country = candidates[0] as WikidataCountry
  const code = country.alpha2 ?? country.subdivision ?? country.alpha3
  if (code === null) return refuse('no-code')

  const frName = country.frName ?? country.enName
  if (frName === null) return refuse('unnamed')

  return {
    nationality: { qid: country.qid, code, frName, enName: country.enName },
    refusal: null,
  }
}

function distinctQids(countries: readonly WikidataCountry[]): WikidataCountry[] {
  return [...new Map(countries.map((country) => [country.qid, country])).values()]
}

function refuse(refusal: NationalityRefusal): NationalityChoice {
  return { nationality: null, refusal }
}
