import { describe, expect, it } from 'vitest'

import { MAX_THEME_LENGTH, ScheduleInput, weekdayIndex } from '@/shared/schedule'

/**
 * The scheduling rules that need neither a career nor a database.
 *
 * The blocking checks live in `server/domain/schedule.ts` and need a real
 * parcours to run against. What is here is everything decidable from the form
 * alone — in particular the one rule the database cannot express: three
 * *different* footballers. The unique index holds "one enigma per position";
 * nothing holds "not the same man twice" but this.
 */

const uuid = (last: string) => `00000000-0000-4000-8000-00000000000${last}`

const input = (over: Record<string, unknown> = {}) => ({
  date: '2026-09-09',
  theme: 'standard',
  footballerIds: [uuid('1'), uuid('2'), uuid('3')],
  ...over,
})

describe('ScheduleInput', () => {
  it('takes a date, a theme and three footballers', () => {
    expect(ScheduleInput.safeParse(input()).success).toBe(true)
  })

  it('refuses the same footballer twice: a grid asking one question twice is not a grid', () => {
    const parsed = ScheduleInput.safeParse(
      input({ footballerIds: [uuid('1'), uuid('1'), uuid('3')] }),
    )

    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toContain('deux positions')
  })

  it('refuses a grid that is not three enigmas', () => {
    expect(ScheduleInput.safeParse(input({ footballerIds: [uuid('1')] })).success).toBe(false)
  })

  it('refuses a position left empty', () => {
    expect(
      ScheduleInput.safeParse(input({ footballerIds: [uuid('1'), '', uuid('3')] })).success,
    ).toBe(false)
  })

  it('refuses a date that is not a day', () => {
    expect(ScheduleInput.safeParse(input({ date: '2026-09' })).success).toBe(false)
    expect(ScheduleInput.safeParse(input({ date: 'demain' })).success).toBe(false)
  })

  it('trims the theme and refuses an empty one', () => {
    expect(ScheduleInput.parse(input({ theme: '  rétro  ' })).theme).toBe('rétro')
    expect(ScheduleInput.safeParse(input({ theme: '   ' })).success).toBe(false)
  })

  it('takes any theme any day: nothing here knows what a theme means', () => {
    // Specs §4: no theme is attached to a day of the week and no automatic
    // check attaches to one. "n’importe quoi" is a legal theme.
    expect(ScheduleInput.safeParse(input({ theme: 'les gauchers de 1987' })).success).toBe(true)
  })

  it('caps the theme, as a typo guard and nothing more', () => {
    expect(ScheduleInput.safeParse(input({ theme: 'a'.repeat(MAX_THEME_LENGTH) })).success).toBe(
      true,
    )
    expect(
      ScheduleInput.safeParse(input({ theme: 'a'.repeat(MAX_THEME_LENGTH + 1) })).success,
    ).toBe(false)
  })
})

describe('weekdayIndex', () => {
  it('puts Monday first, as a French calendar is read', () => {
    // 2026-09-07 is a Monday, 2026-09-13 the Sunday that closes its week.
    expect(weekdayIndex('2026-09-07')).toBe(0)
    expect(weekdayIndex('2026-09-13')).toBe(6)
  })

  it('is the offset the month view leaves empty before its first day', () => {
    // 1 September 2026 is a Tuesday: one empty square before it.
    expect(weekdayIndex('2026-09-01')).toBe(1)
  })
})
