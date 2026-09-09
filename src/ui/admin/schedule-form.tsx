'use client'

import { useActionState, useId } from 'react'

import {
  DEFAULT_THEME,
  IDLE_SCHEDULE_ACTION,
  MAX_THEME_LENGTH,
  POSITIONS,
} from '@/shared/schedule'
import type { ScheduleAction, ScheduledGrid } from '@/shared/schedule'

import { ActionStatus } from './action-status'
import { EnigmaPicker } from './enigma-picker'

/**
 * Programmer une journée : une date, un thème, trois footballeurs.
 *
 * That is the whole form, because that is the whole grid (ADR-0001). There is
 * nothing to preview here, nothing to freeze and no hint to pre-compute: what
 * the player will see is read from the catalogue at render time.
 *
 * The theme is free text with the already-used values *offered* — a `datalist`,
 * not a `select`. The distinction is the specs': no theme belongs to a day of
 * the week, no automatic check attaches to one, and nothing verifies that the
 * three careers match what it announces. The admin answers for that, so the
 * field must not pretend to a vocabulary it does not have.
 *
 * Submitting a date that already has a grid **replaces** it. One grid per date
 * is the model, and correcting a day is not a second grid.
 *
 * Which is exactly why the date is a hidden field and not an input: the day is
 * chosen on the calendar, where the admin can see whether it already has a
 * grid. A date box next to the theme would let him submit a day the screen is
 * not showing, and replacement would then destroy three enigmas nobody looked
 * at. One way to choose a day, and it is the one that shows what is there.
 */
export function ScheduleForm({
  date,
  grid,
  themes,
  scheduleAction,
}: {
  /** The day the calendar has selected. Not editable here — see above. */
  date: string
  /** What is already programmed on that date; the form starts from it. */
  grid: ScheduledGrid | null
  themes: readonly string[]
  scheduleAction: ScheduleAction
}) {
  const [state, submit, pending] = useActionState(scheduleAction, IDLE_SCHEDULE_ACTION)
  const themeListId = useId()

  return (
    <form action={submit} className="flex flex-col gap-4 rounded-md border border-neutral-200 bg-white p-4">
      <input type="hidden" name="date" value={date} />

      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col text-xs font-medium text-neutral-600">
          Thème
          <input
            type="text"
            name="theme"
            list={themeListId}
            defaultValue={grid?.theme ?? DEFAULT_THEME}
            maxLength={MAX_THEME_LENGTH}
            required
            className="rounded-md border border-neutral-300 px-2 py-1 text-sm outline-none focus:border-neutral-900"
          />
          <datalist id={themeListId}>
            {themes.map((theme) => (
              <option key={theme} value={theme} />
            ))}
          </datalist>
        </label>
      </div>

      <div className="flex flex-wrap gap-4">
        {POSITIONS.map((position) => (
          <EnigmaPicker
            key={position}
            position={position}
            defaultEnigma={grid?.enigmas.find((e) => e.position === position) ?? null}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? 'Programmation…' : grid === null ? 'Programmer' : 'Remplacer la grille'}
        </button>
        <p className="text-xs text-neutral-500">
          {grid === null
            ? 'Choisissez le jour dans le calendrier ci-dessus.'
            : 'Ce jour a déjà une grille. Enregistrer la remplace entièrement.'}
        </p>
      </div>

      <ActionStatus state={state} />

      <p className="text-xs text-neutral-500">
        Les contrôles sont bloquants : sans matchs, sans buts ou sans nationalité, un
        palier d’indices tomberait vide au milieu d’une partie. Ils ne disent rien de
        l’exactitude du parcours — ça, c’est l’écran de curation.
      </p>
    </form>
  )
}
