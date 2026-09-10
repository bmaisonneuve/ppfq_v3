'use server'

import { refresh } from 'next/cache'

import { requireAdmin } from '@/server/services/admin-auth.service'
import { FootballerNotFoundError } from '@/server/services/curation.service'
import { NotSchedulableError, scheduleGrid } from '@/server/services/schedule.service'
import {
  adminActionFailed,
  adminActionOk,
  firstZodMessage,
  textField,
  textFields,
} from '@/shared/admin'
import { POSITIONS, POSITION_LABELS, ScheduleInput } from '@/shared/schedule'
import type { Position, ScheduleActionState } from '@/shared/schedule'

/**
 * The scheduling adapter: parse, call the service, answer.
 *
 * It opens with `await requireAdmin()`, like every other admin action. Not
 * belt-and-braces — a Server Action is reachable by a direct POST whatever the
 * page around it does, so this call *is* the access control, and
 * `test/architecture/admin-guard.test.ts` fails the build if a new export here
 * forgets it.
 *
 * The refusal comes back as a sentence rather than an error boundary, and here
 * that is the feature and not a convenience: the message names every footballer
 * and every missing field, so the admin knows which dossier to open before he
 * leaves the screen.
 */

export async function scheduleGridAction(
  _previous: ScheduleActionState,
  form: FormData,
): Promise<ScheduleActionState> {
  await requireAdmin()

  // Three hidden fields of the same name, in position order: index 0 is the
  // échauffement, index 2 the légende. `getAll` keeps document order, which is
  // the order the pickers are rendered in.
  const footballerIds = textFields(form, 'footballerId')

  // Named before the schema sees them, because the schema cannot: to Zod an
  // empty string is one invalid item among three, and "choisissez un
  // footballeur" leaves the admin looking for which of the three is blank. The
  // fields are submitted empty rather than omitted precisely so this can be
  // answered.
  const empty = POSITIONS.filter((position, index) => footballerIds[index] === '')
  if (empty.length > 0) return adminActionFailed(missingPositions(empty))

  const parsed = ScheduleInput.safeParse({
    date: textField(form, 'date'),
    theme: textField(form, 'theme'),
    footballerIds,
  })
  if (!parsed.success) return adminActionFailed(firstZodMessage(parsed.error))

  try {
    await scheduleGrid(parsed.data)
  } catch (error) {
    return adminActionFailed(explain(error))
  }

  refresh()
  return adminActionOk(`Grille du ${parsed.data.date} programmée : ${parsed.data.theme}.`)
}

/** "Aucun footballeur pour : 2. titulaire, 3. légende." */
function missingPositions(positions: readonly Position[]): string {
  const named = positions.map((position) => `${position}. ${POSITION_LABELS[position]}`)
  return `Aucun footballeur pour : ${named.join(', ')}.`
}


/**
 * Service refusals in the admin's words.
 *
 * `NotSchedulableError` already carries the sentence, footballer by footballer,
 * and it is deliberately passed through untouched: shortening it here would
 * throw away the one thing that makes the refusal actionable.
 */
function explain(error: unknown): string {
  if (error instanceof NotSchedulableError) return error.message
  if (error instanceof FootballerNotFoundError) {
    return 'Ce footballeur n’est plus dans le référentiel : il a peut-être été supprimé.'
  }
  return error instanceof Error ? error.message : String(error)
}
