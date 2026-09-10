import { describe, expect, it } from 'vitest'

import {
  PLAYER_COOKIE,
  PLAYER_COOKIE_MAX_AGE_SECONDS,
  isPlayerCookieId,
  mintPlayerCookieId,
  playerCookieOptions,
} from '@/server/auth/player-cookie'

/**
 * The anonymous identity, and the promise attached to it.
 *
 * The cookie is **strictly necessary** to the service asked for — finding your
 * partie again — which is what buys the site the absence of a consent banner
 * (ADR-0003, `docs/modele-donnees.md` §10). That is not a claim one makes in a
 * privacy policy and forgets in the code: it holds only as long as the cookie
 * carries an opaque identifier, nothing else, for no longer than 13 months.
 *
 * So the policy is a value with a test rather than an options object inlined at
 * the one place that sets it, the same trade as `admin-session.ts`: every
 * interesting case is a pure assertion instead of an HTTP response to inspect.
 */
const THIRTEEN_MONTHS_IN_DAYS = 396

describe('the anonymous identity cookie', () => {
  it('lasts 13 months, and never longer', () => {
    // 13 months is a **ceiling**, so the rounding goes down: 396 days is
    // 13 calendar months of the shortest possible shape, and a span that
    // happens to contain a 29 February is 397. Being a day short of the cap is
    // correct; being a day over it is not.
    expect(PLAYER_COOKIE_MAX_AGE_SECONDS).toBe(THIRTEEN_MONTHS_IN_DAYS * 24 * 60 * 60)
  })

  it('is set by a max age rather than by a fixed date, which is what makes it rolling', () => {
    // « 13 mois glissants »: the lifetime restarts on every answer that carries
    // the cookie back, so a joueur who plays every week never loses his
    // progression, and one who never comes back is purged with his row.
    const options = playerCookieOptions(true)

    expect(options.maxAge).toBe(PLAYER_COOKIE_MAX_AGE_SECONDS)
    expect(options).not.toHaveProperty('expires')
  })

  it('is out of reach of any script, and scoped to the whole site', () => {
    const options = playerCookieOptions(true)

    // `httpOnly`, because the client has no use for the value: the identity
    // never travels to the browser's own code, so an injected script cannot
    // read it and hijack a progression.
    expect(options.httpOnly).toBe(true)
    // `lax` and not `strict`: the cookie has to survive arriving from a link in
    // a mail or on social media, which is the main way a daily game is opened.
    expect(options.sameSite).toBe('lax')
    expect(options.path).toBe('/')
  })

  it('is secure in production, and not in development', () => {
    // A secure cookie is simply never sent back over the plain HTTP of
    // `next dev`, so the identity would be lost on every request and no partie
    // would ever be found again — locally only, which is the worst place for a
    // difference nobody can see.
    expect(playerCookieOptions(true).secure).toBe(true)
    expect(playerCookieOptions(false).secure).toBe(false)
  })

  it('mints an identity that is an UUID, and a different one every time', () => {
    const minted = Array.from({ length: 100 }, mintPlayerCookieId)

    for (const id of minted) expect(isPlayerCookieId(id)).toBe(true)
    expect(new Set(minted).size).toBe(minted.length)
  })

  describe('reading what a browser presents', () => {
    it('accepts an UUID', () => {
      expect(isPlayerCookieId('0b5d3e3c-1e3a-4a4f-9b6f-2f1f3c4d5e6f')).toBe(true)
    })

    it('accepts one written in upper case', () => {
      // Nothing in this codebase writes one, but a value that round-trips
      // through a tool that upper-cases it is still the same identity, and
      // refusing it would silently hand the joueur a new one.
      expect(isPlayerCookieId('0B5D3E3C-1E3A-4A4F-9B6F-2F1F3C4D5E6F')).toBe(true)
    })

    it('refuses anything that is not one', () => {
      // The value comes from the client and reaches a `text` column and a
      // unique index. Refusing everything but an UUID is what keeps the column
      // bounded and the identity unguessable; a refused value is not an error,
      // it is a joueur who gets a fresh identity.
      for (const value of [
        null,
        undefined,
        '',
        ' ',
        'not-an-uuid',
        '0b5d3e3c1e3a4a4f9b6f2f1f3c4d5e6f',
        '0b5d3e3c-1e3a-4a4f-9b6f-2f1f3c4d5e6',
        '0b5d3e3c-1e3a-4a4f-9b6f-2f1f3c4d5e6f ',
        "0b5d3e3c-1e3a-4a4f-9b6f-2f1f3c4d5e6f'; DROP TABLE players; --",
        'x'.repeat(10_000),
      ]) {
        expect(isPlayerCookieId(value)).toBe(false)
      }
    })
  })

  it('is named once, and the name says whose it is', () => {
    expect(PLAYER_COOKIE).toBe('ppfq_player')
  })
})
