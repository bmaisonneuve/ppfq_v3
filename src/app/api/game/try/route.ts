import { z } from 'zod'

import { PERSONAL_HEADERS, jsonBody } from '../personal-request'

import { TryRefusedError, submitTry } from '@/server/services/play.service'
import { currentPlayerId } from '@/server/services/player.service'
import { CHALLENGE_DATE_PATTERN, POSITIONS } from '@/shared/schedule'
import type { EnigmaPlay } from '@/shared/play'

/**
 * L'essai : le joueur propose un footballeur, ou passe son tour.
 *
 * ## Why this is a Route Handler and not a Server Action
 *
 * `docs/stack-technique.md` §4 files the essai under « écriture depuis l'UI »
 * and therefore under Server Action. It does not hold here, and ADR-0012 is
 * where the reasoning is written down rather than in this header. In short:
 * calling a Server Action from a client component refreshes the route it was
 * called from, and the route it would be called from is la grille du jour —
 * prerendered, served whole from a shared cache, and opened by 20 000 people in
 * five minutes (ADR-0008). Thirteen essais a joueur would be thirteen RSC
 * payloads fetched for a value the client already has in its hands.
 *
 * The second reason is the one that decides it even without the first: this
 * request has to queue behind `POST /api/game/state`. A first visitor carries
 * no cookie, so **every** request in flight without one creates a joueur, and
 * an essai racing the request that opens the enigma would make two `players`
 * rows and lose one of them (ADR-0009). One client, one queue, one identity —
 * and a Server Action sits outside that queue by construction.
 *
 * ## What it answers
 *
 * An `EnigmaPlay`, which is exactly what the state route answers. The three
 * forms the specs ask for are its three statuses — `in_progress` faux, `solved`
 * trouvé, `failed` la sixième erreur — and there is no fourth, because the
 * input is a selection in a list and « pas un footballeur » cannot happen
 * (specs §10). The hints it carries are the tiers the erreurs have paid for and
 * never one more; the name of the footballer is there only once the partie is
 * over. Both of those are `server/domain/`, not here.
 *
 * An adapter, like every door into the server: parse, call the service, answer.
 *
 * ## What is not here
 *
 * A rate limit, for the reasons the state route gives (`docs/stack-technique.md`
 * §10, #16). The game itself has nothing to defend: the answer never leaves
 * before the end, the service refuses the seventh essai, and « quelqu'un qui
 * rotate son cookie d'identité anonyme ne pénalise que lui » (§4).
 */

/**
 * What the client may send: which grid, which enigma, and whom it proposes.
 *
 * `footballerId` is **nullable rather than optional, and null is « passer »**.
 * Optional would make a forgotten field a skipped turn, and a skipped turn
 * costs an essai: a client bug would silently spend one. Saying nobody has to
 * be said.
 *
 * The identifier is validated as a UUID and nothing more. It is not checked
 * against the referential — an essai is a selection in the suggestion list, and
 * a footballer who is not in the catalogue is simply not the answer, which is
 * the same outcome as any other wrong proposition.
 *
 * The schema stays here rather than in `shared/`: nothing else parses this
 * body, and a Zod validator in a module the game imports would ship in the game
 * bundle. Same call as the typeahead's and the state route's.
 */
const TryRequest = z.object({
  date: z.string().regex(CHALLENGE_DATE_PATTERN),
  position: z.literal(POSITIONS),
  footballerId: z.uuid().nullable(),
})

export async function POST(request: Request): Promise<Response> {
  const parsed = TryRequest.safeParse(await jsonBody(request))
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid try request.' },
      { status: 400, headers: PERSONAL_HEADERS },
    )
  }

  // Before the service, and in this order, exactly as the state route does it:
  // everything below needs a joueur, and the cookie is written on the way out.
  const playerId = await currentPlayerId()

  try {
    const play = await submitTry({ playerId, ...parsed.data })

    return Response.json(play satisfies EnigmaPlay, { headers: PERSONAL_HEADERS })
  } catch (error) {
    if (error instanceof TryRefusedError) {
      // 409: the essai is well-formed and the partie is not in a state to take
      // it — the seventh essai, an enigma never opened, a grid that has turned.
      // The client re-reads the state rather than guessing which of the three.
      return Response.json({ error: error.reason }, { status: 409, headers: PERSONAL_HEADERS })
    }
    throw error
  }
}
