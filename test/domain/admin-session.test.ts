import { describe, expect, it } from 'vitest'

import {
  matchesSharedSecret,
  mintAdminSession,
  verifyAdminSession,
} from '@/server/auth/admin-session'

/**
 * The admin cookie, as a pure rule: a secret, an expiry, a signature.
 *
 * Pure because it takes its secret as an argument rather than reading the
 * environment — which is what lets the interesting cases (a wrong secret, a
 * tampered expiry, no secret at all) be a matrix here instead of an
 * environment-juggling integration test.
 */

const SECRET = 'a-secret-of-a-perfectly-ordinary-length-for-hmac'
const OTHER_SECRET = 'another-secret-entirely-but-just-as-long-as-that'
const NOW = Date.UTC(2026, 8, 9, 12, 0, 0)
const HOUR = 60 * 60 * 1000

describe('mintAdminSession / verifyAdminSession', () => {
  it('accepts a session it minted itself', () => {
    const token = mintAdminSession(SECRET, NOW + HOUR)

    expect(verifyAdminSession(SECRET, token, NOW)).toBe(true)
  })

  it('refuses a session that has expired', () => {
    const token = mintAdminSession(SECRET, NOW + HOUR)

    expect(verifyAdminSession(SECRET, token, NOW + HOUR + 1)).toBe(false)
  })

  it('refuses a session signed with another secret', () => {
    // Rotating the secret is therefore how every session is revoked at once.
    const token = mintAdminSession(OTHER_SECRET, NOW + HOUR)

    expect(verifyAdminSession(SECRET, token, NOW)).toBe(false)
  })

  it('refuses an expiry pushed forward by hand', () => {
    // The whole point of signing the expiry: it is in the cookie, so the holder
    // can read it and would otherwise simply edit it.
    const token = mintAdminSession(SECRET, NOW + HOUR)
    const [, signature = ''] = token.split('.')
    const forged = `${NOW + 100 * HOUR}.${signature}`

    expect(verifyAdminSession(SECRET, forged, NOW)).toBe(false)
  })

  it('refuses a signature that has been touched', () => {
    const token = mintAdminSession(SECRET, NOW + HOUR)
    const [expiry = '', signature = ''] = token.split('.')
    const flipped = `${signature.slice(0, -1)}${signature.endsWith('a') ? 'b' : 'a'}`

    expect(verifyAdminSession(SECRET, `${expiry}.${flipped}`, NOW)).toBe(false)
  })

  it.each([
    ['nothing at all', undefined],
    ['an empty string', ''],
    ['a value with no signature', String(NOW + HOUR)],
    ['a non-numeric expiry', 'soon.deadbeef'],
    ['plain garbage', 'not-a-token'],
    ['too many parts', `${NOW + HOUR}.aaa.bbb`],
  ])('refuses %s', (_label, token) => {
    expect(verifyAdminSession(SECRET, token, NOW)).toBe(false)
  })

  it('refuses everything when there is no secret', () => {
    // A back-office that opens because a variable is missing from the
    // environment is worse than one that never opens: the failure is silent and
    // it is on the side that lets people in.
    expect(verifyAdminSession('', mintAdminSession(SECRET, NOW + HOUR), NOW)).toBe(false)
    expect(verifyAdminSession('', mintAdminSession('', NOW + HOUR), NOW)).toBe(false)
  })
})

describe('matchesSharedSecret', () => {
  it('accepts the exact secret', () => {
    expect(matchesSharedSecret('correct horse battery staple', 'correct horse battery staple')).toBe(true)
  })

  it.each([
    ['a different secret of the same length', 'correct horse battery stapla'],
    ['a prefix', 'correct horse'],
    ['a longer string that starts the same way', 'correct horse battery staple!'],
    ['the empty string', ''],
  ])('refuses %s', (_label, given) => {
    expect(matchesSharedSecret('correct horse battery staple', given)).toBe(false)
  })

  it('refuses everything when no secret is configured', () => {
    expect(matchesSharedSecret('', '')).toBe(false)
    expect(matchesSharedSecret('', 'anything')).toBe(false)
  })
})
