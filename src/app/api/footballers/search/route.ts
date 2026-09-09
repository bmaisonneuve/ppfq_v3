import type { NextRequest } from 'next/server'
import { z } from 'zod'

import { searchFootballers } from '@/server/services/search.service'
import { MAX_QUERY_LENGTH } from '@/shared/search'
import type { SearchResponse } from '@/shared/search'

/**
 * The typeahead endpoint.
 *
 * A Route Handler rather than a Server Action because it needs an HTTP contract:
 * a cacheable GET with the query in the URL, so Cloudflare can absorb the common
 * prefixes (docs/stack-technique.md §4, §10). It is also the most-hit endpoint
 * of the site, ~35 requests per player against ~13 for the game itself.
 *
 * An adapter, like every door into the server: parse, call the service, answer.
 * The ranking, the two-character floor and the typo rescue all live in the
 * service, where they are tested.
 */

/**
 * The referential only moves when an admin runs an import, so a stale
 * suggestion list is a non-event — while a cache hit on `zid` is a request the
 * origin never sees at midnight.
 */
const CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600'

/**
 * What the endpoint accepts: a query string, and nothing else. How many
 * suggestions come back is the service's business — a public knob would be one
 * more cache key and one more thing to validate, for no caller.
 *
 * The schema stays here rather than in `shared/`: nothing else parses this
 * query string, and a Zod schema in a module the client typeahead imports would
 * ship the validator in the game bundle.
 *
 * The length cap is a load guard — nothing longer than the longest canonical
 * name can match anything.
 */
const SearchQuery = z.object({
  q: z.string().min(1).max(MAX_QUERY_LENGTH),
})

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams
  const parsed = SearchQuery.safeParse({ q: params.get('q') ?? undefined })

  // A missing or oversized `q` is a caller bug, and saying so beats answering
  // an empty list that looks like "no such footballer". A `q` that is merely
  // too short is a player mid-word: that one the service answers with nothing.
  if (!parsed.success) {
    return Response.json({ error: 'Invalid search query.' }, { status: 400 })
  }

  const suggestions = await searchFootballers({ query: parsed.data.q })

  return Response.json({ suggestions } satisfies SearchResponse, {
    headers: { 'Cache-Control': CACHE_CONTROL },
  })
}
