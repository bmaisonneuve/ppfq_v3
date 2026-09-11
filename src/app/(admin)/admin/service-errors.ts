import {
  ClubMergeError,
  ClubNotFoundError,
} from '@/server/services/club.service'
import { InvalidCrestError } from '@/server/services/crest.service'
import {
  FootballerNotFoundError,
  PassageNotFoundError,
} from '@/server/services/curation.service'

/**
 * A service refusal, in the admin's words.
 *
 * One table for every admin screen, and that is the whole reason the file
 * exists: `ClubNotFoundError` is raised by a passage form *and* by a club
 * fiche, and two adapters each writing their own sentence for it is how the
 * same refusal starts reading two different ways.
 *
 * Not a `'use server'` module and not an action: it is a lookup, it touches
 * nothing, and it is called by the adapters after the guard has already run.
 *
 * Anything unrecognised falls through to the raw message rather than to a
 * generic "une erreur est survenue" — the admin is the only user, and the
 * message a service wrote is more use to him than a reassuring nothing.
 */
export function explainServiceError(error: unknown): string {
  if (error instanceof ClubNotFoundError) {
    return 'Ce club n’existe plus dans le catalogue.'
  }
  if (error instanceof ClubMergeError) return error.message
  if (error instanceof InvalidCrestError) return `Image refusée : ${error.message}`
  if (error instanceof PassageNotFoundError) {
    return 'Ce passage n’existe plus : il a peut-être été supprimé dans un autre onglet.'
  }
  if (error instanceof FootballerNotFoundError) {
    return 'Ce footballeur n’est pas dans le référentiel.'
  }

  return error instanceof Error ? error.message : String(error)
}
