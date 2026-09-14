import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { pendingClaims, players } from '@/server/db/schema'
import { rememberClaim } from '@/server/services/progress-claim.service'
import { resolvePlayer } from '@/server/services/player.service'

import { db } from '@test/setup/db'
import { ACCOUNTS, ACCOUNT_EMAILS, ACCOUNT_IDS, seedAccounts } from '@test/fixtures/accounts'
import { PLAYER_COOKIE_IDS, PLAYER_IDS, seedPlayers } from '@test/fixtures/players'

/**
 * La reprise de progression : ce que les specs §6 promettent en une phrase — la
 * progression déjà réalisée sans compte est reprise à l'inscription — et ce que
 * l'ADR-0003 réduit à un `UPDATE players SET auth_user_id`.
 *
 * Ce qui est vérifié ici est donc surtout ce qui **ne bouge pas** : aucune
 * ligne n'est créée, aucune n'est supprimée, et les parties ne changent pas de
 * propriétaire. C'est précisément ce que le plugin `anonymous` de Better Auth
 * aurait fait de travers, et la raison pour laquelle il a été écarté.
 *
 * Les cas, et il y en a un par navigateur possible :
 *
 * | Où l'on se connecte                | Ce que la reprise doit trouver          |
 * |------------------------------------|------------------------------------------|
 * | l'onglet où l'on jouait            | le joueur du cookie présenté             |
 * | un autre navigateur, cookie absent | le joueur inscrit dans `pending_claims`  |
 * | un appareil déjà connecté une fois | le joueur que le compte a déjà           |
 * | nulle part, jamais joué            | un joueur neuf, et c'est tout            |
 */
const IN_TEN_MINUTES = () => new Date(Date.now() + 10 * 60 * 1000)

const rowOf = async (playerId: string) => {
  const found = await db.select().from(players).where(eq(players.id, playerId))
  const row = found[0]
  if (row === undefined) throw new Error(`Aucune ligne players pour ${playerId}.`)
  return row
}

const claims = async () => await db.select().from(pendingClaims)
const allPlayers = async () => await db.select().from(players)

beforeEach(async () => {
  await seedPlayers(db)
  await seedAccounts(db)
})

describe('rememberClaim', () => {
  it('records which joueur an address is playing as, while the cookie is still there', async () => {
    await rememberClaim(ACCOUNT_EMAILS.mine, PLAYER_IDS.mine, IN_TEN_MINUTES())

    expect(await claims()).toMatchObject([
      { email: ACCOUNT_EMAILS.mine, playerId: PLAYER_IDS.mine },
    ])
  })

  it('does not pile up a row per request: asking for a second code pushes the first back', async () => {
    const soon = new Date(Date.now() + 60 * 1000)
    await rememberClaim(ACCOUNT_EMAILS.mine, PLAYER_IDS.mine, soon)
    await rememberClaim(ACCOUNT_EMAILS.mine, PLAYER_IDS.mine, IN_TEN_MINUTES())

    const rows = await claims()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.expiresAt.getTime()).toBeGreaterThan(soon.getTime())
  })

  it('keeps one row per joueur, because two browsers may both be waiting', async () => {
    await rememberClaim(ACCOUNT_EMAILS.mine, PLAYER_IDS.mine, IN_TEN_MINUTES())
    await rememberClaim(ACCOUNT_EMAILS.mine, PLAYER_IDS.other, IN_TEN_MINUTES())

    expect(await claims()).toHaveLength(2)
  })
})

describe('resolvePlayer, for somebody who has just signed in', () => {
  it('takes over the joueur his cookie names, without creating a row', async () => {
    const identity = await resolvePlayer(PLAYER_COOKIE_IDS.mine, ACCOUNTS.mine)

    expect(identity.playerId).toBe(PLAYER_IDS.mine)
    expect((await rowOf(PLAYER_IDS.mine)).authUserId).toBe(ACCOUNT_IDS.mine)
    expect(await allPlayers()).toHaveLength(2)
  })

  it('takes over the joueur the claim names when the link opened elsewhere', async () => {
    // Le cas qui justifie `pending_claims` : le lien s'ouvre dans le navigateur
    // du client mail, qui ne porte pas le cookie du jeu.
    await rememberClaim(ACCOUNT_EMAILS.mine, PLAYER_IDS.mine, IN_TEN_MINUTES())

    const identity = await resolvePlayer(null, ACCOUNTS.mine)

    expect(identity.playerId).toBe(PLAYER_IDS.mine)
    // Et le navigateur repart avec le cookie de ce joueur-là : sans cela il
    // continuerait à jouer sous l'identité anonyme qu'il vient de se créer.
    expect(identity.cookieId).toBe(PLAYER_COOKIE_IDS.mine)
    expect(await allPlayers()).toHaveLength(2)
  })

  it('prefers the claim to the cookie of the browser the link opened in', async () => {
    // Ce navigateur-là a sa propre identité anonyme, et ce n'est pas celle qui
    // portait la partie. L'association a été écrite dans l'onglet du jeu : elle
    // dit la bonne.
    await rememberClaim(ACCOUNT_EMAILS.mine, PLAYER_IDS.mine, IN_TEN_MINUTES())

    const identity = await resolvePlayer(PLAYER_COOKIE_IDS.other, ACCOUNTS.mine)

    expect(identity.playerId).toBe(PLAYER_IDS.mine)
    expect((await rowOf(PLAYER_IDS.other)).authUserId).toBeNull()
  })

  it('ignores a claim that has expired, rather than reviving a stale association', async () => {
    await db.insert(pendingClaims).values({
      email: ACCOUNT_EMAILS.mine,
      playerId: PLAYER_IDS.other,
      expiresAt: new Date(Date.now() - 1_000),
    })

    const identity = await resolvePlayer(PLAYER_COOKIE_IDS.mine, ACCOUNTS.mine)

    expect(identity.playerId).toBe(PLAYER_IDS.mine)
  })

  it('ignores a claim left by somebody else’s address', async () => {
    await rememberClaim(ACCOUNT_EMAILS.other, PLAYER_IDS.other, IN_TEN_MINUTES())

    expect((await resolvePlayer(null, ACCOUNTS.mine)).playerId).not.toBe(PLAYER_IDS.other)
  })

  it('never steals a joueur another account already holds', async () => {
    await db
      .update(players)
      .set({ authUserId: ACCOUNT_IDS.other })
      .where(eq(players.id, PLAYER_IDS.mine))

    const identity = await resolvePlayer(PLAYER_COOKIE_IDS.mine, ACCOUNTS.mine)

    expect(identity.playerId).not.toBe(PLAYER_IDS.mine)
    expect((await rowOf(PLAYER_IDS.mine)).authUserId).toBe(ACCOUNT_IDS.other)
  })

  it('gives a joueur to an account that signs in having never played', async () => {
    const identity = await resolvePlayer(null, ACCOUNTS.mine)

    expect((await rowOf(identity.playerId)).authUserId).toBe(ACCOUNT_IDS.mine)
    expect(await allPlayers()).toHaveLength(3)
  })

  describe('replayed', () => {
    it('duplicates nothing and destroys nothing', async () => {
      // « La reprise est idempotente » est un critère du ticket, et c'est
      // aussi ce qui la rend sûre à faire sur *chaque* requête personnelle
      // plutôt qu'une fois au callback.
      const first = await resolvePlayer(PLAYER_COOKIE_IDS.mine, ACCOUNTS.mine)
      const second = await resolvePlayer(PLAYER_COOKIE_IDS.mine, ACCOUNTS.mine)
      const third = await resolvePlayer(null, ACCOUNTS.mine)

      expect(second).toEqual(first)
      expect(third).toEqual(first)
      expect(await allPlayers()).toHaveLength(2)
    })

    it('brings a joueur back to his account when he arrives with another cookie', async () => {
      // Un cookie effacé, un autre navigateur, un appareil de plus : la session
      // est la vérité, et l'identité anonyme se réaligne dessus.
      await resolvePlayer(PLAYER_COOKIE_IDS.mine, ACCOUNTS.mine)

      const elsewhere = await resolvePlayer(null, ACCOUNTS.mine)

      expect(elsewhere.playerId).toBe(PLAYER_IDS.mine)
      expect(elsewhere.cookieId).toBe(PLAYER_COOKIE_IDS.mine)
    })

    it('leaves the claims behind it, so nothing re-reads a spent association', async () => {
      await rememberClaim(ACCOUNT_EMAILS.mine, PLAYER_IDS.mine, IN_TEN_MINUTES())

      await resolvePlayer(null, ACCOUNTS.mine)

      expect(await claims()).toEqual([])
    })
  })

  it('makes one joueur out of a burst of simultaneous first requests', async () => {
    // Une page qui lance ses trois requêtes personnelles juste après une
    // connexion. L'index unique sur `auth_user_id` est l'arbitre ; les perdants
    // relisent la ligne qui a gagné.
    const identities = await Promise.all(
      Array.from({ length: 8 }, async () => await resolvePlayer(null, ACCOUNTS.mine)),
    )

    const distinct = new Set(identities.map((identity) => identity.playerId))
    expect(distinct.size).toBe(1)
    expect(await allPlayers()).toHaveLength(3)
  })
})
