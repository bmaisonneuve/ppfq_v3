import type { CurationActionState } from '@/shared/curation'

/**
 * What a curation edit answered, in one line next to the thing that was edited.
 *
 * Every action answers the same shape, so a refusal — "ce club n'existe plus",
 * "la fin précède le début" — lands here rather than as an error boundary over
 * a screen the admin was halfway through filling in.
 */
export function ActionStatus({ state }: { state: CurationActionState }) {
  if (state.status === 'idle' || state.message === null) return null

  return (
    <p
      role={state.status === 'error' ? 'alert' : 'status'}
      className={`text-sm ${state.status === 'error' ? 'text-red-700' : 'text-emerald-700'}`}
    >
      {state.message}
    </p>
  )
}
