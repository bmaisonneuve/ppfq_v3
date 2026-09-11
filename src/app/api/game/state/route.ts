import { z } from 'zod'

import { PERSONAL_HEADERS, jsonBody } from '../personal-request'

import { getDayPlays } from '@/server/services/play.service'
import { currentPlayerId } from '@/server/services/player.service'
import { CHALLENGE_DATE_PATTERN, POSITIONS } from '@/shared/schedule'
import type { DayPlays } from '@/shared/play'

/**
 * L'état personnel: what one joueur owns on one grid, and the door that opens
 * an enigma.
 *
 * ## Why the personal state is a request of its own
 *
 * Because the page it belongs to reads nothing that belongs to a request. That
 * is the central architectural decision of the project (ADR-0008): la grille du
 * jour is prerendered and served whole from a shared cache, which is what
 * absorbs the peak of midnight and — worth as much — is what makes it
 * impossible for one joueur's state to reach another's screen. So the page
 * carries the parcours, and everything personal arrives here, after hydration,
 * over a request that knows who is asking and is cached by nobody.
 *
 * ## Why a Route Handler, and why POST
 *
 * A Route Handler because this needs an HTTP contract
 * (`docs/stack-technique.md` §4): the answer is personal and there is a CDN in
 * front of the origin, so `private, no-store` is not a detail of the
 * implementation, it is the thing that keeps the answer from being handed to
 * somebody else. It also has to set a cookie, which a render cannot do.
 *
 * POST because it **creates**. A partie is born when an enigma is opened
 * (`docs/modele-donnees.md` §4), and a GET that created one would be created by
 * everything that walks the web without being asked: a link prefetch, a
 * crawler, a preview bot. Every one of them would count as a person exposed to
 * the enigma, which is the exact number the difficulty calibration reads (#12).
 * A method nobody follows by accident is the cheapest possible guard.
 *
 * An adapter, like every door into the server: parse, call the service, answer.
 * Which enigma exists, which day it is, whether a partie is already there and
 * what an unfinished one on an old grid means are all `play.service.ts`.
 *
 * ## What is not here
 *
 * A rate limit. This endpoint creates a `players` row for a caller who presents
 * no cookie, so hammering it inflates a table — the same exposure as the
 * typeahead, answered at the edge and not in the application
 * (`docs/stack-technique.md` §10, #16). It is worth saying out loud rather than
 * leaving to be discovered: the game itself has nothing to defend, since
 * « quelqu'un qui rotate son cookie d'identité anonyme ne pénalise que lui ».
 */

/**
 * What the client may send: which grid, and which enigma it is opening.
 *
 * `date` comes from the page the client is holding, which is why it is sent at
 * all rather than assumed: that page may be up to a minute older than the day
 * (ADR-0008), and the server is the one that knows what day it is.
 *
 * `open` is optional, because reading is not opening. A page restoring three
 * folded enigmas must create no partie, and a position outside the three is a
 * caller's bug rather than a joueur's — so it is refused, not ignored.
 *
 * The schema stays here rather than in `shared/`: nothing else parses this
 * body, and a Zod validator in a module the game imports would ship in the game
 * bundle. Same call as the typeahead's.
 */
const StateRequest = z.object({
  date: z.string().regex(CHALLENGE_DATE_PATTERN),
  open: z.literal(POSITIONS).optional(),
})

export async function POST(request: Request): Promise<Response> {
  const parsed = StateRequest.safeParse(await jsonBody(request))
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid game state request.' },
      { status: 400, headers: PERSONAL_HEADERS },
    )
  }

  // Before the service, and in this order: everything below needs a joueur, and
  // a first visitor becomes one here — the cookie is written on the way out,
  // which is the "glissant" of the 13 months it lasts.
  const playerId = await currentPlayerId()

  const day = await getDayPlays({ playerId, date: parsed.data.date, open: parsed.data.open })

  return Response.json(day satisfies DayPlays, { headers: PERSONAL_HEADERS })
}
