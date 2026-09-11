'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'

import { requireAdmin } from '@/server/services/admin-auth.service'
import { createClub } from '@/server/services/club.service'
import {
  addPassage,
  deletePassage,
  setFootballerNationality,
  updatePassage,
} from '@/server/services/curation.service'
import { importFootballerCareer } from '@/server/services/ingest.service'
import type { CareerImportReport } from '@/server/services/ingest.service'
import { adminActionFailed, adminActionOk, firstZodMessage, textField } from '@/shared/admin'
import { NewClubInput } from '@/shared/club'
import { PassageInput } from '@/shared/curation'
import type { CurationActionState } from '@/shared/curation'

import { explainServiceError } from '../../service-errors'

/**
 * The curation adapters: parse, call the service, answer.
 *
 * Every one of them opens with `await requireAdmin()`. Not belt-and-braces — a
 * Server Action is reachable by a direct POST whatever the page around it does,
 * so this call *is* the access control. `test/architecture/admin-guard.test.ts`
 * fails the build if a new export here forgets it.
 *
 * They all answer the same `CurationActionState` so a refusal lands as a
 * sentence next to the field, rather than as an error boundary over a screen
 * the admin was halfway through filling in. Then `refresh()` re-renders the
 * page from the catalogue: nothing here returns the new state, because the
 * dossier is a read of the tables and re-reading it is the whole refresh.
 */

// The two answers, and the reading of a Zod error, are the same on every admin
// screen: they live in `shared/admin.ts` so scheduling and curation cannot
// drift apart on what a refusal looks like.
const ok = adminActionOk
const failed = adminActionFailed
const firstMessage = firstZodMessage
// One table of refusals for every admin screen: `ClubNotFoundError` is raised
// by a passage form and by a club fiche alike, and two adapters each writing
// their own sentence is how one refusal starts reading two different ways.
const explain = explainServiceError

/** `FormData` gives strings; an untouched number field gives the empty one. */
const optionalNumber = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : Number(value)))
  .pipe(z.number().int().nullable())

const PassageForm = z.object({
  clubId: z.string(),
  isLoan: z
    .string()
    .nullish()
    .transform((value) => value === 'on' || value === 'true'),
  startYear: z.string().trim().transform(Number),
  endYear: optionalNumber,
  matches: optionalNumber,
  goals: optionalNumber,
})

/**
 * Reads a passage form into the shape the service takes.
 *
 * Two schemas rather than one: this one turns strings into values, and
 * `PassageInput` decides what is a legal passage. The second is in `shared/`
 * because it is the rule; the first is here because it is the shape of an HTML
 * form and concerns nobody else.
 */
function readPassageForm(form: FormData) {
  const shaped = PassageForm.safeParse({
    clubId: form.get('clubId') ?? '',
    isLoan: form.get('isLoan'),
    startYear: form.get('startYear') ?? '',
    endYear: form.get('endYear') ?? '',
    matches: form.get('matches') ?? '',
    goals: form.get('goals') ?? '',
  })

  if (!shaped.success) return null
  return PassageInput.safeParse(shaped.data)
}

export async function addPassageAction(
  _previous: CurationActionState,
  form: FormData,
): Promise<CurationActionState> {
  await requireAdmin()

  const footballerId = textField(form, 'footballerId')
  const parsed = readPassageForm(form)
  if (parsed === null) return failed('Passage invalide : vérifiez le club et les années.')
  if (!parsed.success) return failed(firstMessage(parsed.error))

  try {
    await addPassage(footballerId, parsed.data)
  } catch (error) {
    return failed(explain(error))
  }

  refresh()
  return ok('Passage ajouté.')
}

export async function updatePassageAction(
  _previous: CurationActionState,
  form: FormData,
): Promise<CurationActionState> {
  await requireAdmin()

  const passageId = textField(form, 'passageId')
  const parsed = readPassageForm(form)
  if (parsed === null) return failed('Passage invalide : vérifiez le club et les années.')
  if (!parsed.success) return failed(firstMessage(parsed.error))

  try {
    await updatePassage(passageId, parsed.data)
  } catch (error) {
    return failed(explain(error))
  }

  refresh()
  return ok('Passage enregistré.')
}

/**
 * Deletes a passage — the reserve team the admin recognised, or a spell the
 * source invented. Nothing else in the codebase deletes one, and in particular
 * the reserve heuristic never does: it flags, a human decides.
 */
export async function deletePassageAction(
  _previous: CurationActionState,
  form: FormData,
): Promise<CurationActionState> {
  await requireAdmin()

  try {
    await deletePassage(textField(form, 'passageId'))
  } catch (error) {
    return failed(explain(error))
  }

  refresh()
  return ok('Passage supprimé.')
}

export async function setNationalityAction(
  _previous: CurationActionState,
  form: FormData,
): Promise<CurationActionState> {
  await requireAdmin()

  const footballerId = textField(form, 'footballerId')
  const raw = textField(form, 'nationalityId')
  // The empty option is "aucune", not a missing field: the admin has to be able
  // to take back a nationality he typed wrong, which no import ever does.
  const nationalityId = raw === '' ? null : raw

  try {
    await setFootballerNationality(footballerId, nationalityId)
  } catch (error) {
    return failed(explain(error))
  }

  refresh()
  return ok(nationalityId === null ? 'Nationalité retirée.' : 'Nationalité enregistrée.')
}

/** Creates the club the source simply does not have, so a passage can point at it. */
export async function createClubAction(
  _previous: CurationActionState,
  form: FormData,
): Promise<CurationActionState> {
  await requireAdmin()

  const enName = textField(form, 'enName').trim()
  const parsed = NewClubInput.safeParse({
    frName: textField(form, 'frName'),
    enName: enName === '' ? null : enName,
  })
  if (!parsed.success) return failed('Nom de club invalide.')

  const created = await createClub(parsed.data)

  refresh()
  return ok(`Club « ${created.frName} » créé. Il est maintenant proposé à la recherche.`)
}

/**
 * Re-runs the Wikidata import for this footballer.
 *
 * Called directly rather than queued: a footballer is two SPARQL queries
 * waiting on I/O, which justifies neither a job nor a worker
 * (`docs/stack-technique.md` §7).
 *
 * What the admin has to know, and what the screen says next to the button: the
 * import **replaces** the parcours (ADR-0005). A reserve team removed by hand
 * comes back, because nothing in the source says it is one.
 */
export async function reimportCareerAction(
  _previous: CurationActionState,
  form: FormData,
): Promise<CurationActionState> {
  await requireAdmin()

  const qid = textField(form, 'qid')
  if (!/^Q\d+$/.test(qid)) return failed('Identifiant Wikidata absent ou invalide.')

  try {
    const report = await importFootballerCareer({ qid })
    refresh()
    const created = report.clubsCreated > 0 ? `, ${report.clubsCreated} club(s) créé(s)` : ''
    // The crests are a separate run with a separate trace, and what did *not*
    // arrive is said out loud too: a club whose image is missing is a fiche to
    // open, not a parcours to redo, and silence would read as "there was none".
    return ok(
      `Import terminé : ${report.passagesWritten} passage(s) écrit(s)${created}${crestOutcome(report.crests)}.`,
    )
  } catch (error) {
    // The refusals of ADR-0005 land here — not a footballer, no club passage,
    // unnamed footballer — and each of them wrote nothing. The trace in
    // `job_runs` is the other half of the answer, and the dossier shows it.
    refresh()
    return failed(`Import refusé : ${explain(error)}`)
  }
}


/**
 * What the crest run that followed the import came to.
 *
 * Failures and leftovers are named rather than folded into the count: the crest
 * pass runs on a budget inside this very request, so "3 blasons" out of eight
 * clubs is a normal outcome that the admin has to be able to act on — the
 * catch-up command, or the club's own fiche.
 */
function crestOutcome(crests: CareerImportReport['crests']): string {
  if (crests === null) return ''

  const left = [
    `${crests.fetched} blason(s)`,
    crests.errors > 0 ? `${crests.errors} en échec` : null,
    crests.skipped > 0 ? `${crests.skipped} à reprendre` : null,
  ].filter((part) => part !== null)

  return `, ${left.join(', ')}`
}
