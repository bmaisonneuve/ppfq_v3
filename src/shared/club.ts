/**
 * The club's isomorphic layer: what the admin sees of a club, and what he is
 * allowed to send back.
 *
 * A club is shared by every footballer who played there, which is what makes
 * this its own file rather than a corner of `shared/curation.ts`: renaming one,
 * merging two or replacing a crest touches every parcours at once, where
 * curation touches one footballer. The club picker's own types live here too —
 * the picker is about clubs, and a second declaration on the curation side is
 * how two screens start disagreeing about what a club option is.
 */
import { z } from 'zod'

import { IDLE_ADMIN_ACTION } from './admin'
import type { AdminAction, AdminActionState } from './admin'

/** A club as the admin picks it when adding a passage. */
export type ClubOption = {
  id: string
  frName: string
  enName: string | null
}

/** Two characters, like the typeahead: below that a club search returns noise. */
export const MIN_CLUB_QUERY_LENGTH = 2

/** The club picker's data source, handed to a presentational component as a prop. */
export type ClubSearchAction = (query: string) => Promise<ClubOption[]>

/** A club created by hand, for the club the source simply does not have. */
export const NewClubInput = z.object({
  frName: z.string().trim().min(1).max(120),
  enName: z.string().trim().min(1).max(120).nullable(),
})

export type NewClubInput = z.infer<typeof NewClubInput>

/**
 * The two names of a club, as the fiche edits them.
 *
 * Editable at all is the point of the ticket: `clubs` used to be write-once, so
 * a club the source names in **no** language — inserted under its Wikidata id,
 * `Q123456`, by the career import — could never be renamed. The same shape as
 * `NewClubInput` on purpose: creating a club and correcting one are the same
 * two fields, and a rule that held on one and not the other would be a bug
 * waiting for the first admin who used the other door.
 */
export const ClubNames = NewClubInput

export type ClubNames = z.infer<typeof ClubNames>

/**
 * Merging a duplicate into the club that survives.
 *
 * The duplicate is real and the code announced it before this ticket existed: a
 * club created by hand carries no Wikidata id, so the day the import meets the
 * same club it inserts a **second** row rather than adopting the first. That is
 * deliberate — a silent adoption would rename a club under every footballer at
 * once — and it is only bearable because the two rows can be merged again.
 *
 * Both ids are required and must differ. A club merged into itself would delete
 * the row it had just moved every passage onto.
 */
export const MergeClubsInput = z
  .object({
    /** The club that survives, and the one every passage ends up on. */
    keepId: z.uuid(),
    /** The duplicate, deleted once its passages have moved. */
    mergedId: z.uuid(),
  })
  .refine(({ keepId, mergedId }) => keepId !== mergedId, {
    error: 'Un club ne peut pas être fusionné avec lui-même.',
    path: ['mergedId'],
  })

export type MergeClubsInput = z.infer<typeof MergeClubsInput>

/** Where a crest came from, as the fiche shows it so a wrong pick is visible. */
export type CrestProvenance = {
  /** The content address — the crest's identity, and its URL. */
  key: string
  byteSize: number
  /** `Logo_Manchester_United_FC.svg`, or the file an admin uploaded. */
  sourceFile: string | null
  sourceUrl: string | null
  /** `fr`, `en`, or null when an admin uploaded it himself. */
  sourceWiki: string | null
  license: string | null
}

/**
 * Everything the club's fiche shows, read from the catalogue on every call.
 *
 * Like the curation dossier, it is a read of the tables and nothing else: there
 * is no club status to set, and `passageCount` is a count and not a column.
 */
export type ClubDossier = {
  id: string
  frName: string
  enName: string | null
  /** Null for a club created by hand — and the reason a duplicate can exist. */
  wikidataQid: string | null
  /** Null until a crest is uploaded or extracted. */
  crest: CrestProvenance | null
  /** How many passages point at this club — what a merge would move. */
  passageCount: number
  /** The last crest extraction that ran for this club, if one ever did. */
  lastCrestRun: CrestRunTrace | null
}

/**
 * What `job_runs` kept of the last crest extraction for this club.
 *
 * Worth showing even — especially — when it failed: a refused or lost download
 * writes nothing to the catalogue, so the club simply has no crest and this row
 * is the only place the reason survives. The same shape, and the same reason,
 * as the import trace on a footballer's dossier.
 */
export type CrestRunTrace = {
  startedAt: Date
  /** Null means the run never reported back. */
  finishedAt: Date | null
  /** Crests written by that run. */
  fetched: number | null
  failed: boolean
  lastError: string | null
}

/**
 * The stable, content-addressed URL a crest is served at.
 *
 * The key **is** the SHA-256 of the bytes, so this URL identifies exactly those
 * bytes and can be cached for ever. Replacing a club's crest writes different
 * bytes, therefore a different key, therefore a different URL: there is nothing
 * to invalidate, which is the whole reason the address is the content.
 *
 * One definition, because the page that renders an `<img>` and the route that
 * answers it have to agree, and because the day the bytes move to a bucket this
 * is the single line that changes.
 */
export function crestUrl(key: string): string {
  return `/api/crests/${key}`
}

/** A SHA-256 in lower-case hex — what the read path accepts, and nothing else. */
export const CREST_KEY_PATTERN = /^[0-9a-f]{64}$/

/**
 * What an admin may upload, and it is deliberately **raster only**.
 *
 * No `image/svg+xml`: an SVG is executable markup, and this one would be served
 * from the site's own origin. The extraction never produces one either — a
 * thumbnail asked of the Wikimedia thumbnailer comes back rendered as PNG,
 * which is what makes "no image processing dependency" true and what makes this
 * restriction cost nothing.
 */
export const ALLOWED_CREST_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]

/**
 * A ceiling on an uploaded crest — and on what `ingest/wikipedia.ts` will read
 * off the wire, which is the same number on purpose. Measured: a Wikipedia
 * thumbnail of a crest is a few tens of kilobytes, so this is a guard against a
 * photograph dropped in by mistake, not a budget.
 */
export const MAX_CREST_BYTES = 2 * 1024 * 1024

/**
 * What a club form gets back — the admin's one answer shape, under the name
 * this screen calls it, exactly as `shared/curation.ts` does for curation.
 */
export type ClubActionState = AdminActionState

export const IDLE_CLUB_ACTION: ClubActionState = IDLE_ADMIN_ACTION

/** The signature every club Server Action has, for the presentational layer. */
export type ClubAction = AdminAction
