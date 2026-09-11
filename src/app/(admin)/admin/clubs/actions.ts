'use server'

import { refresh } from 'next/cache'

import { z } from 'zod'

import { requireAdmin } from '@/server/services/admin-auth.service'
import { mergeClubs, renameClub, searchClubs } from '@/server/services/club.service'
import {
  clearClubCrest,
  extractClubCrests,
  setClubCrest,
} from '@/server/services/crest.service'
import { adminActionFailed, adminActionOk, fileField, firstZodMessage, textField } from '@/shared/admin'
import { ClubNames, MergeClubsInput } from '@/shared/club'
import type { ClubActionState, ClubOption } from '@/shared/club'

import { explainServiceError } from '../service-errors'

/**
 * The club adapters: parse, call the service, answer.
 *
 * Every one of them opens with `await requireAdmin()`. Not belt-and-braces — a
 * Server Action is reachable by a direct POST whatever the page around it does,
 * so this call *is* the access control, and
 * `test/architecture/admin-guard.test.ts` fails the build if a new export here
 * forgets it.
 *
 * The club search lives here rather than beside the curation actions because
 * clubs are what it is about: the passage picker on the curation screen imports
 * this one, so there is a single door and not two that drift.
 */

const ok = adminActionOk
const failed = adminActionFailed
const explain = explainServiceError

/**
 * The club id every form carries in a hidden field.
 *
 * Parsed, not trusted: a Server Action is a public POST whatever the page
 * around it does (`docs/stack-technique.md` §4), and an id that is not a uuid
 * would otherwise reach Postgres as a `22P02` error boundary instead of a
 * sentence next to the form.
 */
function clubIdField(form: FormData): string | null {
  const parsed = z.uuid().safeParse(textField(form, 'clubId'))
  return parsed.success ? parsed.data : null
}

const NOT_A_CLUB = 'Identifiant de club absent ou invalide.'

/**
 * The club picker's data source, for the fiche's search and for the passage
 * picker on the curation screen.
 *
 * A Server Action rather than a route handler: it is admin-only, so there is
 * nothing to cache and nothing to expose publicly, and going through the action
 * keeps the guard on it.
 */
export async function searchClubsAction(query: string): Promise<ClubOption[]> {
  await requireAdmin()

  return await searchClubs(query)
}

/**
 * Corrects a club's names — and the case it exists for is a club Wikidata names
 * in no language, stored under its `Q123456` and, until this ticket, impossible
 * to rename.
 */
export async function renameClubAction(
  _previous: ClubActionState,
  form: FormData,
): Promise<ClubActionState> {
  await requireAdmin()

  const clubId = clubIdField(form)
  if (clubId === null) return failed(NOT_A_CLUB)

  const enName = textField(form, 'enName').trim()
  const parsed = ClubNames.safeParse({
    frName: textField(form, 'frName'),
    // Empty is "we do not know it", which is a fact. The empty string is not.
    enName: enName === '' ? null : enName,
  })
  if (!parsed.success) return failed(firstZodMessage(parsed.error))

  try {
    await renameClub(clubId, parsed.data)
  } catch (error) {
    return failed(explain(error))
  }

  refresh()
  return ok('Noms enregistrés. Ils changent pour tous les footballeurs passés par ce club.')
}

/**
 * Uploads a crest by hand, replacing whatever was there.
 *
 * The rattrapage the extraction needs: the main image of an article is not
 * always a crest — London Caledonians answers a team photograph from 1894 — and
 * this is where that gets corrected.
 */
export async function uploadCrestAction(
  _previous: ClubActionState,
  form: FormData,
): Promise<ClubActionState> {
  await requireAdmin()

  const clubId = clubIdField(form)
  if (clubId === null) return failed(NOT_A_CLUB)

  const file = fileField(form, 'crest')
  if (file === null) return failed('Choisissez un fichier image.')

  try {
    const key = await setClubCrest(clubId, {
      bytes: new Uint8Array(await file.arrayBuffer()),
      contentType: file.type,
      sourceFile: file.name,
      sourceUrl: null,
      // Null is the marker of a hand upload, and what tells the fiche that this
      // crest is curated rather than extracted.
      sourceWiki: null,
      license: null,
    })
    refresh()
    return ok(`Blason enregistré (${key.slice(0, 12)}…).`)
  } catch (error) {
    return failed(explain(error))
  }
}

/**
 * Goes and fetches this club's crest from Wikipedia.
 *
 * Refuses nothing and replaces nothing: the extraction only ever looks at
 * clubs with no crest, so this is a no-op on a club that already has one. The
 * button is hidden in that case, and the service is what makes it true.
 */
export async function extractCrestAction(
  _previous: ClubActionState,
  form: FormData,
): Promise<ClubActionState> {
  await requireAdmin()

  const clubId = clubIdField(form)
  if (clubId === null) return failed(NOT_A_CLUB)

  const report = await extractClubCrests({ clubIds: [clubId] })
  refresh()

  if (report.fetched > 0) return ok('Blason récupéré depuis Wikipédia.')
  if (report.errors > 0) return failed(`Échec : ${report.lastError ?? 'raison inconnue'}`)
  if (report.scanned === 0) {
    return failed(
      'Rien à chercher : ce club a déjà un blason, ou il n’a pas d’identifiant Wikidata.',
    )
  }
  // A crest arrived and the club had gained one meanwhile — another tab, or a
  // career import in flight. Saying "Wikipédia n'a pas d'image" here would be
  // the one thing that is not true.
  if (report.skipped > 0) return ok('Ce club a déjà un blason.')
  return failed('Wikipédia n’a pas d’image principale pour ce club. Téléversez-en une.')
}

/** Takes the crest off this club. The bytes stay: another club may point at them. */
export async function removeCrestAction(
  _previous: ClubActionState,
  form: FormData,
): Promise<ClubActionState> {
  await requireAdmin()

  const clubId = clubIdField(form)
  if (clubId === null) return failed(NOT_A_CLUB)

  try {
    await clearClubCrest(clubId)
  } catch (error) {
    return failed(explain(error))
  }

  refresh()
  return ok('Blason retiré.')
}

/**
 * Merges a duplicate into this club.
 *
 * The duplicate the catalogue creates on purpose: a club typed in by hand has
 * no Wikidata id, so the day the import meets the real one it inserts a second
 * row rather than renaming the first under every footballer at once.
 */
export async function mergeClubsAction(
  _previous: ClubActionState,
  form: FormData,
): Promise<ClubActionState> {
  await requireAdmin()

  const parsed = MergeClubsInput.safeParse({
    keepId: textField(form, 'keepId'),
    mergedId: textField(form, 'mergedId'),
  })
  if (!parsed.success) return failed(firstZodMessage(parsed.error))

  try {
    const report = await mergeClubs(parsed.data)
    refresh()
    return ok(
      `Fusion faite : ${report.passagesMoved} passage(s) repris` +
        `${report.adopted.wikidataQid ? ', identifiant Wikidata adopté' : ''}.`,
    )
  } catch (error) {
    return failed(explain(error))
  }
}
