/**
 * The curation screen's isomorphic layer: what the admin sees, and what he is
 * allowed to send back.
 *
 * Curation is where a parcours stops being what Wikidata says and becomes what
 * the game shows. There is deliberately **no verification status** here — no
 * `verified_at`, no "curated" boolean: "curé" stays the fact of having passages
 * (`CONTEXT.md`, `docs/modele-donnees.md` §10). What this module carries is the
 * work left to do, recomputed on every read, never stored.
 */
import { z } from 'zod'

import { IDLE_ADMIN_ACTION } from './admin'
import type { AdminAction, AdminActionState } from './admin'
import type { Nationality, PlayerClub } from './career'

/**
 * A reading aid on one passage. None of these is a rejection: the catalogue
 * holds the row either way, and the admin decides.
 *
 * - `likely-reserve` — the club's label looks like a reserve team. The source
 *   types reserves as ordinary senior clubs, so the label is all there is, and
 *   it is wrong often enough (`docs/research/wikidata-coverage.md` §4.3) that
 *   nothing may ever be removed on its strength alone.
 * - `overlap` — this passage shares years with another. Legitimate for a loan
 *   sitting inside its parent contract, and the one case where the order of the
 *   parcours is genuinely ambiguous.
 * - `missing-figures` — no matches or no goals, so hint 4 or 5 would be empty.
 *   The footballer is simply not schedulable yet (#6 is what refuses him).
 */
export type PassageFlag = 'likely-reserve' | 'overlap' | 'missing-figures'

/**
 * A passage as curation reads it: the game's row, plus the two things about the
 * club that only the back-office looks at.
 *
 * The English name is here for one reason, and it is measured: the reserve-team
 * signal of `docs/research/wikidata-coverage.md` §4.3 was measured on **English**
 * labels, and a French name can lose the marker the English one carries. The
 * model keeps `clubs.en_name` precisely as the admin's fallback.
 *
 * The crest key is here for the other half of the same job. The main image of a
 * Wikipedia article is not always a crest — London Caledonians FC answers with
 * a team photograph from 1894 — and the parcours is where the admin has the
 * clubs in front of him anyway. It is deliberately **not** on `PlayerClub`: the
 * grid is prerendered and cached whole (ADR-0008), and putting images into it
 * is a game decision, not a consequence of this one.
 */
export type CuratedPassage = PlayerClub & {
  clubEnName: string | null
  /** The club's crest, by content address. Null when it has none yet. */
  clubCrestKey: string | null
}

/** One passage as the curation screen shows it: the row, plus what to look at. */
export type FlaggedPassage = CuratedPassage & { flags: PassageFlag[] }

/**
 * Everything the curation screen shows for one footballer.
 *
 * It is a read of the catalogue and nothing else — no snapshot, no derived
 * table. Re-reading after an edit is the whole refresh mechanism.
 */
export type CurationDossier = {
  footballerId: string
  name: string
  /** Null when the footballer was entered by hand: no import to re-run. */
  wikidataQid: string | null
  /** Opened on every curation — the only guard against a parcours false by omission. */
  wikiFrUrl: string | null
  wikiEnUrl: string | null
  nationality: Nationality | null
  /** In career order, `(start_year, end_year, id)`. */
  passages: FlaggedPassage[]
  /** The last career import for this footballer, if one ever ran. */
  lastImport: CurationImportTrace | null
}

/** What `job_runs` kept of the last import, as the screen shows it. */
export type CurationImportTrace = {
  startedAt: Date
  /** Null means the run never reported back. */
  finishedAt: Date | null
  passagesWritten: number | null
  failed: boolean
  lastError: string | null
}

/**
 * The form's year range — a **typo guard**, and deliberately not a rule about
 * football.
 *
 * It is wider than the model's `start_year >= 1880`, and that is the point:
 * 1880 is a *scheduling* predicate (`docs/modele-donnees.md` §4, refused by #6),
 * not a fact about what may be stored. Enforcing it here would make a passage
 * the source shipped at 1875 impossible to edit at all — the admin could not
 * even fix its matches without first moving its year — while the referential is
 * supposed to stay exhaustive and the footballer merely unschedulable.
 *
 * What these bounds catch is `195` for `1950` and `20255` for `2025`, and they
 * keep an `integer` column from being handed something it cannot hold. Both are
 * exported because the number inputs carry the same values: two ranges that
 * drift apart are a field the browser accepts and the server refuses.
 */
export const EARLIEST_FORM_YEAR = 1850
export const LATEST_FORM_YEAR = new Date().getUTCFullYear() + 5

/**
 * A cap on matches and goals, for the same reason as the year ceiling: a typo
 * guard, not a rule about football. The record is nowhere near it.
 */
export const MAX_COUNT = 2_000

const Year = z
  .number()
  .int()
  .min(EARLIEST_FORM_YEAR, { error: `Année trop ancienne (avant ${EARLIEST_FORM_YEAR}).` })
  .max(LATEST_FORM_YEAR, { error: `Année trop lointaine (après ${LATEST_FORM_YEAR}).` })

/**
 * A count of league matches or league goals. Nullable: an empty field is the
 * honest answer while the admin has not found the figure, and the model wants
 * it null rather than zero — zero is a real, different fact.
 */
const Count = z
  .number()
  .int()
  .min(0, { error: 'Un nombre de matchs ou de buts ne peut pas être négatif.' })
  .max(MAX_COUNT, { error: `Nombre trop grand (plus de ${MAX_COUNT}).` })
  .nullable()

/**
 * What a passage form may send.
 *
 * One rule beyond the shapes: a passage may not end before it begins. That is
 * also one of the model's three scheduling predicates, and enforcing it here
 * takes nothing away from #6 — the 181 cases the model counts come from the
 * *source*, which this form is not. It simply refuses to create new ones out of
 * a human's typo, in the one place where the two numbers are typed together.
 *
 * The other two predicates are deliberately **not** enforced. `goals <= matches`
 * is violated by 2 989 passages of the source and an admin may be transcribing
 * exactly that. `start_year >= 1880` would make an older passage uneditable —
 * see `EARLIEST_FORM_YEAR`. Both belong at scheduling, where the model puts
 * them: a footballer with doubtful figures stays a valid suggestion and becomes
 * only unschedulable.
 */
export const PassageInput = z
  .object({
    clubId: z.uuid(),
    isLoan: z.boolean(),
    startYear: Year,
    /** Null = career in progress. */
    endYear: Year.nullable(),
    matches: Count,
    goals: Count,
  })
  .refine(({ startYear, endYear }) => endYear === null || endYear >= startYear, {
    error: 'La fin d’un passage ne peut pas précéder son début.',
    path: ['endYear'],
  })

export type PassageInput = z.infer<typeof PassageInput>

/**
 * What a curation form gets back — the admin's one answer shape, under the name
 * this screen calls it.
 *
 * Every admin edit answers alike so one small component renders every outcome,
 * and so an action can say *why* it refused — "ce club n'existe plus", "la fin
 * précède le début" — instead of throwing an error boundary over a screen the
 * admin was halfway through filling in. The shape itself is in `shared/admin.ts`
 * because scheduling wants exactly the same one, and two identical
 * declarations are how two screens start disagreeing.
 */
export type CurationActionState = AdminActionState

export const IDLE_CURATION_ACTION: CurationActionState = IDLE_ADMIN_ACTION

/**
 * The signature every curation Server Action has, so the presentational layer
 * can take one as a prop without importing anything from `server/`.
 */
export type CurationAction = AdminAction
