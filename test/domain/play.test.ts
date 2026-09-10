import { describe, expect, it } from 'vitest'

import { readPlayStatus } from '@/server/domain/play'
import type { PlayMode, PlayStatus } from '@/shared/play'

/**
 * « Une partie non terminée avant le changement de grille compte comme un
 * échec » — and the whole subject of this file is the four words the model adds
 * to that sentence: **par règle de lecture**
 * (`docs/modele-donnees.md` §4).
 *
 * Nothing writes `failed` at midnight. A job that did would run at the exact
 * minute of the traffic peak, over every partie left open by every joueur of
 * the day, to compute something a comparison of two dates already knows. So the
 * row keeps saying `in_progress` for as long as it exists, and this function is
 * what turns it into a failure the moment the grid has turned.
 *
 * The consequence a player sees: la grille du jour is not picked up again the
 * next day. It becomes archive (specs §7), and the archive does not count.
 */
const play = (over: {
  status?: PlayStatus
  mode?: PlayMode
  gridDate?: string
} = {}) => ({
  status: 'in_progress' as PlayStatus,
  mode: 'daily' as PlayMode,
  gridDate: '2026-09-09',
  ...over,
})

describe('readPlayStatus', () => {
  it('leaves an open partie open while its grid is still the grid of the day', () => {
    expect(readPlayStatus(play(), '2026-09-09')).toBe('in_progress')
  })

  it('reads an open partie as a failure once the grid is no longer the day’s', () => {
    expect(readPlayStatus(play(), '2026-09-10')).toBe('failed')
  })

  it('reads it as a failure however long ago the grid was', () => {
    // A joueur back after a month finds his failures, not a month of parties
    // waiting to be finished.
    expect(readPlayStatus(play({ gridDate: '2026-08-09' }), '2026-09-10')).toBe('failed')
  })

  it('never contradicts a partie that is already finished', () => {
    // A solved partie stays solved for ever. This is the reason the rule is
    // written on the stored status rather than on the date alone: everything
    // ever solved is on a grid that is no longer the grid of the day.
    expect(readPlayStatus(play({ status: 'solved' }), '2027-01-01')).toBe('solved')
    expect(readPlayStatus(play({ status: 'failed' }), '2027-01-01')).toBe('failed')
  })

  it('never fails an archive partie by the clock', () => {
    // An archive partie is played on a grid that is not the day's by
    // definition, and it is playable precisely because it does not count
    // (specs §7). The clock is the daily mode's deadline and nothing else.
    expect(readPlayStatus(play({ mode: 'archive' }), '2026-09-10')).toBe('in_progress')
  })

  it('reads a daily partie on a date that is not today as a failure, in both directions', () => {
    // A `daily` partie is only ever created on the grid of the day, so a grid
    // in the future is unreachable — and the rule answers it the same way
    // rather than carrying a special case: a partie one cannot have opened
    // cannot be in progress.
    expect(readPlayStatus(play({ gridDate: '2026-09-11' }), '2026-09-10')).toBe('failed')
  })
})
