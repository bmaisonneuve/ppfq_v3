import type { AdminActionState } from '@/shared/admin'

/**
 * What an admin edit answered, in one line next to the thing that was edited.
 *
 * Every admin action answers the same shape, so a refusal — "ce club n'existe
 * plus", "la fin précède le début", or the whole scheduling refusal footballer
 * by footballer — lands here rather than as an error boundary over a screen the
 * admin was halfway through filling in.
 */
export function ActionStatus({ state }: Readonly<{ state: AdminActionState }>) {
  if (state.status === 'idle' || state.message === null) return null

  return (
    <p
      role={state.status === 'error' ? 'alert' : 'status'}
      className={state.status === 'error' ? 'status-error' : 'status-ok'}
    >
      {state.message}
    </p>
  )
}
