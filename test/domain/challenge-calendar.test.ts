import { describe, expect, it } from 'vitest'

import {
  datesInMonth,
  monthOfDate,
  parseChallengeDate,
  parseChallengeMonth,
  previousDate,
  shiftMonth,
  todayInParis,
} from '@/server/domain/challenge-calendar'

/**
 * The Europe/Paris calendar, as a pure rule.
 *
 * A grid date is a `date` and not a timestamp, and the grid of the day is
 * `WHERE date = <today in Paris>` — a lazy computation, never a job
 * (docs/stack-technique.md §4). The whole risk lives in the two hours around
 * midnight, where UTC and Paris disagree about which day it is, so that is what
 * this file is mostly about.
 */

describe('todayInParis', () => {
  it('reads the Paris day, not the UTC one, in winter', () => {
    // 31 December 23:30 UTC is already 1 January in Paris.
    expect(todayInParis(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01')
  })

  it('reads the Paris day, not the UTC one, in summer', () => {
    // Paris is two hours ahead between the last Sundays of March and October.
    expect(todayInParis(new Date('2026-06-30T22:30:00Z'))).toBe('2026-07-01')
  })

  it('stays on the day everywhere else in it', () => {
    expect(todayInParis(new Date('2026-09-09T11:00:00Z'))).toBe('2026-09-09')
  })

  it('pads the month and the day, so dates compare as strings', () => {
    expect(todayInParis(new Date('2026-03-05T12:00:00Z'))).toBe('2026-03-05')
  })
})

describe('datesInMonth', () => {
  it('gives every day of the month, in order', () => {
    const days = datesInMonth('2026-09')

    expect(days).toHaveLength(30)
    expect(days[0]).toBe('2026-09-01')
    expect(days[29]).toBe('2026-09-30')
  })

  it('knows February, leap year included', () => {
    expect(datesInMonth('2026-02')).toHaveLength(28)
    expect(datesInMonth('2028-02')).toHaveLength(29)
  })

  it('gives 31 days to a month that changes hour', () => {
    // 2026-03-29 is 23 hours long in Paris. A calendar built by adding
    // milliseconds would skip a day here; this one counts days.
    const march = datesInMonth('2026-03')

    expect(march).toHaveLength(31)
    expect(march).toContain('2026-03-29')
  })
})

describe('shiftMonth', () => {
  it('walks backwards across a year', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })

  it('walks forwards across a year', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('stays inside a year', () => {
    expect(shiftMonth('2026-09', 1)).toBe('2026-10')
  })
})

describe('previousDate', () => {
  it('recule d’un jour', () => {
    expect(previousDate('2026-09-09')).toBe('2026-09-08')
  })

  it('remonte au mois précédent', () => {
    expect(previousDate('2026-09-01')).toBe('2026-08-31')
  })

  it('remonte à l’année précédente', () => {
    expect(previousDate('2026-01-01')).toBe('2025-12-31')
  })

  it('connaît les années bissextiles', () => {
    expect(previousDate('2028-03-01')).toBe('2028-02-29')
    expect(previousDate('2026-03-01')).toBe('2026-02-28')
  })

  it('traverse le changement d’heure sans perdre ni doubler un jour', () => {
    // Les deux dimanches où une journée de Paris ne fait pas 24 heures. Compter
    // en millisecondes sur une date locale donnerait ici le même jour deux
    // fois — c'est la raison pour laquelle cette fonction existe.
    expect(previousDate('2026-03-29')).toBe('2026-03-28')
    expect(previousDate('2026-10-25')).toBe('2026-10-24')
  })
})

describe('monthOfDate', () => {
  it('is the date without its day', () => {
    expect(monthOfDate('2026-09-09')).toBe('2026-09')
  })
})

describe('parseChallengeMonth', () => {
  it('takes a well-formed month', () => {
    expect(parseChallengeMonth('2026-09', '2026-01')).toBe('2026-09')
  })

  it('falls back rather than throwing: the month comes from a query string', () => {
    expect(parseChallengeMonth('septembre', '2026-01')).toBe('2026-01')
    expect(parseChallengeMonth(undefined, '2026-01')).toBe('2026-01')
    // Well-formed but impossible: a calendar of month 13 would render empty.
    expect(parseChallengeMonth('2026-13', '2026-01')).toBe('2026-01')
  })
})

describe('parseChallengeDate', () => {
  it('takes a real day', () => {
    expect(parseChallengeDate('2026-09-09', '2026-01-01')).toBe('2026-09-09')
    expect(parseChallengeDate('2028-02-29', '2026-01-01')).toBe('2028-02-29')
  })

  it('falls back on anything that is not one', () => {
    expect(parseChallengeDate(undefined, '2026-01-01')).toBe('2026-01-01')
    expect(parseChallengeDate('demain', '2026-01-01')).toBe('2026-01-01')
    // Well-formed and not a day: `Date` would quietly turn it into 2 March, and
    // a form pre-filled with it would refuse for a reason nobody could see.
    expect(parseChallengeDate('2026-02-30', '2026-01-01')).toBe('2026-01-01')
    expect(parseChallengeDate('2026-13-01', '2026-01-01')).toBe('2026-01-01')
  })
})
