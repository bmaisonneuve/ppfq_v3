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
 *
 * Il n'a pas de surface à lui (`.panel`) : il est monté dans la fenêtre du
 * calendrier, qui est déjà blanche, et qui le titre du jour qu'il programme
 * (`schedule-screen.tsx`). Un panneau dans un panneau aurait fait deux bords
 * blancs l'un dans l'autre.
 */
export function ScheduleForm({
  date,
  grid,
  themes,
  scheduleAction,
}: Readonly<{
  /** The day the calendar has selected. Not editable here — see above. */
  date: string
  /** What is already programmed on that date; the form starts from it. */
  grid: ScheduledGrid | null
  themes: readonly string[]
  scheduleAction: ScheduleAction
}>) {
  const [state, submit, pending] = useActionState(scheduleAction, IDLE_SCHEDULE_ACTION)
  const themeListId = useId()

  return (
    <form action={submit} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="date" value={date} />

      {/* Pleine largeur sur un téléphone, et sa largeur de champ au-delà : un
          `w-72` posé en dur déborde la gouttière d'un écran de 360 px. */}
      <label className="flex w-full flex-col gap-1 sm:w-auto">
        <span className="field-label">Thème</span>
        <input
          type="text"
          name="theme"
          list={themeListId}
          defaultValue={grid?.theme ?? DEFAULT_THEME}
          maxLength={MAX_THEME_LENGTH}
          required
          className="field sm:w-72"
        />
        <datalist id={themeListId}>
          {themes.map((theme) => (
            <option key={theme} value={theme} />
          ))}
        </datalist>
      </label>

      {/* Une grille, et non un `flex-wrap` : les trois positions sont trois
          colonnes de même largeur tant qu'il y a la place, et **une seule**
          dès qu'il n'y en a plus. Enroulées, elles tombaient deux sur une
          ligne et la légende toute seule dessous — ce qui casse l'ordre de
          difficulté que la position *est* (CONTEXT.md), et qui donne deux
          largeurs de champ de recherche dans le même formulaire.

          La bascule est en `lg:` et pas en `sm:` : la fenêtre plafonne à
          768 px, donc trois colonnes ne respirent qu'à partir de là. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
          className="btn w-full sm:w-auto"
        >
          {submitLabel(pending, grid !== null)}
        </button>
        {grid === null ? null : (
          <p className="hint">
            Ce jour a déjà une grille. Enregistrer la remplace entièrement.
          </p>
        )}
      </div>

      <ActionStatus state={state} />

      <p className="hint">
        Les contrôles sont bloquants : sans matchs, sans buts ou sans nationalité, un
        palier d’indices tomberait vide au milieu d’une partie. Ils ne disent rien de
        l’exactitude du parcours — ça, c’est l’écran de curation.
      </p>
    </form>
  )
}

/** Scheduling a bare day and replacing a grid are not the same promise. */
function submitLabel(pending: boolean, hasGrid: boolean): string {
  if (pending) return 'Programmation…'
  return hasGrid ? 'Remplacer la grille' : 'Programmer'
}
