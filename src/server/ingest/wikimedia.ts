import 'server-only'

/**
 * What both Wikimedia clients agree on, and must never disagree on.
 *
 * There are two of them — `sparql.ts` for Wikidata's query endpoint,
 * `wikipedia.ts` for the MediaWiki API — and they stay separate because their
 * *readings* are separate: one parses SPARQL results and echoes a 400's body
 * back into the error, the other parses JSON payloads and sniffs an image's
 * content type. What they must not have two of is what follows.
 */

/**
 * Wikimedia's policy asks for a contact in the User-Agent, and an endpoint that
 * sees an anonymous client is entitled to refuse it. The repository is the
 * contact: it outlives any one address.
 *
 * One string, because two would drift and the second one to drift is the one
 * nobody notices until an endpoint starts refusing it.
 */
export const WIKIMEDIA_USER_AGENT = 'PPFQ/1.0 (+https://github.com/bmaisonneuve/ppfq_v3)'

/** Three attempts, ~0.5 s then ~1 s apart. Somebody is waiting for this. */
export const MAX_ATTEMPTS = 3
export const RETRY_BASE_DELAY_MS = 500

/**
 * Retried: the endpoint is busy or briefly broken. Anything else is our bug,
 * and trying again is waste.
 */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 504])

/** The one sleep, overridden in tests so a retry does not really wait. */
export async function sleepFor(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
