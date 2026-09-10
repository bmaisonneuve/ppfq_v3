import 'server-only'

/**
 * The SPARQL gateway: one function that sends a query and gives back rows.
 *
 * It knows about HTTP, timeouts and retries, and nothing about football. What a
 * career *is* lives in `career-statements.ts`, and the queries themselves in
 * `wikidata-career.ts`; this file is the only place that touches the network, so
 * it is also the only thing a test has to replace.
 *
 * ## Why QLever rather than query.wikidata.org
 *
 * The official endpoint cuts off at 60 s and rate-limits hard. QLever answers
 * the same queries in a fraction of a second (measured: 425 ms for a
 * footballer's identity, on a 30 s server-side ceiling) and served every
 * measurement in `docs/research/wikidata-coverage.md` without a single fallback
 * to WDQS. It is a third-party mirror of a Wikidata snapshot, which is the one
 * thing to keep in mind: it can lag the live site by days or weeks. For a
 * catalogue an admin curates by hand, that is not a cost.
 *
 * ## JSON, not CSV
 *
 * `application/sparql-results+json` is asked for rather than `text/csv`, which
 * the extraction script in `scripts/` uses. CSV cannot tell an unbound variable
 * from an empty string — and here the difference is "this passage has no end
 * year" versus "this passage ends in year zero". The JSON form binds only what
 * exists, so a missing qualifier is a missing key.
 */

/**
 * A row of results: the bound variables, by name, as their raw lexical value.
 *
 * The datatype is dropped on purpose. Everything this pipeline reads is a year,
 * a count, a boolean or a URI, and the callers convert with the helpers below —
 * which is where the one surprise lives: QLever returns `pq:P1350` as
 * `xsd:decimal`, so a count of matches arrives as `"28.0"`.
 */
export type SparqlRow = Readonly<Record<string, string | undefined>>

/**
 * The seam. Everything above this file takes a runner rather than reaching for
 * `runSparqlQuery` itself, so a test hands over recorded results and the suite
 * never touches the network.
 */
export type SparqlQueryRunner = (query: string) => Promise<SparqlRow[]>

const DEFAULT_ENDPOINT = 'https://qlever.dev/api/wikidata'

/**
 * Wikimedia's policy asks for a contact in the User-Agent, and an endpoint that
 * sees an anonymous client is entitled to refuse it. The repository is the
 * contact: it outlives any one address.
 */
const USER_AGENT = 'PPFQ/1.0 (+https://github.com/bmaisonneuve/ppfq_v3)'

/**
 * Client-side ceiling, above QLever's own 30 s: a query that hits the server
 * ceiling must come back as its error rather than as our timeout, because the
 * two say different things — "this query is too heavy" against "the network is
 * gone".
 */
const REQUEST_TIMEOUT_MS = 45_000

/** Three attempts, ~0.5 s then ~1.5 s apart. An admin is waiting for this. */
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500

/** Retried: the endpoint is busy or briefly broken. Anything else is our bug. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

/** Raised when the endpoint could not be reached or refused the query. */
export class SparqlError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'SparqlError'
  }
}

/**
 * The shape of `application/sparql-results+json` — only the part that is read.
 */
/**
 * What the endpoint *claims* to answer, not what it is trusted to. Every
 * optional and every `null` here is a case `readBindings` has met: the types
 * are written loose on purpose, so the narrowing below cannot be linted away
 * as unnecessary.
 */
type SparqlBinding = Record<string, { value?: unknown } | undefined> | null

type SparqlResults = {
  results?: { bindings?: SparqlBinding[] }
}

export type SparqlOptions = {
  /** Defaults to `WIKIDATA_SPARQL_ENDPOINT`, then to QLever. */
  endpoint?: string
  timeoutMs?: number
  maxAttempts?: number
  /** Overridden in tests so a retry does not really wait. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Sends one query and returns its rows.
 *
 * `GET` with the query in the URL rather than a `POST` body: it is what QLever
 * documents, and it keeps a failing query copy-pasteable out of a log line.
 */
export async function runSparqlQuery(
  query: string,
  options: SparqlOptions = {},
): Promise<SparqlRow[]> {
  const endpoint =
    options.endpoint ?? process.env.WIKIDATA_SPARQL_ENDPOINT ?? DEFAULT_ENDPOINT
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS
  const sleep =
    options.sleep ??
    (async (ms: number) => {
      await new Promise((resolve) => setTimeout(resolve, ms))
    })
  const url = `${endpoint}?query=${encodeURIComponent(query)}`

  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fetchRows(url, options.timeoutMs ?? REQUEST_TIMEOUT_MS)
    } catch (error) {
      lastError = error
      if (!isRetryable(error) || attempt === maxAttempts) break
      await sleep(RETRY_BASE_DELAY_MS * attempt)
    }
  }

  throw new SparqlError(
    `The SPARQL endpoint at ${endpoint} did not answer: ${String(lastError)}`,
    { cause: lastError },
  )
}

/** Marks the errors `runSparqlQuery` is willing to try again. */
class RetryableSparqlError extends Error {}

function isRetryable(error: unknown): boolean {
  // A network failure or a timeout comes out of `fetch` as a TypeError or an
  // AbortError; both are worth one more try.
  return error instanceof RetryableSparqlError || !(error instanceof SparqlError)
}

async function fetchRows(url: string, timeoutMs: number): Promise<SparqlRow[]> {
  const response = await fetch(url, {
    headers: { Accept: 'application/sparql-results+json', 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    // The body carries the parse error or the "query too heavy" message, and it
    // is the only thing that makes a 400 debuggable. Truncated: QLever answers
    // a syntax error with the whole query echoed back.
    const body = (await response.text().catch(() => '')).slice(0, 500)
    const message = `${response.status} ${response.statusText} — ${body}`
    if (RETRYABLE_STATUSES.has(response.status)) throw new RetryableSparqlError(message)
    throw new SparqlError(message)
  }

  const payload = (await response.json()) as SparqlResults
  return readBindings(payload)
}

/**
 * Turns the results payload into rows. Exported because a test that replays a
 * recorded response needs the same reading, and a reading of its own would be a
 * second contract with the endpoint.
 */
export function readBindings(payload: unknown): SparqlRow[] {
  const bindings = (payload as SparqlResults | null)?.results?.bindings
  if (!Array.isArray(bindings)) {
    throw new SparqlError('The endpoint answered something that is not SPARQL results.')
  }

  return bindings.map((binding) => {
    const row: Record<string, string> = {}
    for (const [variable, cell] of Object.entries(binding ?? {})) {
      // SPARQL JSON always carries the bound value as a string. Anything else
      // is the endpoint breaking its own contract, and stringifying it would
      // put `[object Object]` where a qid belongs.
      if (typeof cell?.value === 'string') row[variable] = cell.value
    }
    return row
  })
}

/** `http://www.wikidata.org/entity/Q1835` → `Q1835`. Also fine on a bare qid. */
export function entityId(uri: string | undefined): string | null {
  if (uri === undefined || uri === '') return null
  const id = uri.slice(uri.lastIndexOf('/') + 1)
  return id === '' ? null : id
}

/**
 * A count or a year, as an integer.
 *
 * `"28.0"` is not a typo in the data: QLever hands `pq:P1350` back as
 * `xsd:decimal`. Truncating rather than rounding, because these are counts —
 * and a value that is not a number at all becomes null rather than `NaN`, which
 * would reach the database as an integer column's worth of trouble.
 */
export function integerValue(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

/** SPARQL booleans arrive as the strings `"true"` / `"false"`. */
export function booleanValue(value: string | undefined): boolean {
  return value === 'true'
}
