import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'

import { isAdminEmail, isAdminUserId } from '@/server/auth/admin-role'
import { users } from '@/server/db/schema'
import { sendSignIn, signInByCode } from '@/server/services/account.service'
import type { RequestContext } from '@/server/services/account.service'

import { db, onlyRow } from '@test/setup/db'
import { clearMailbox, codeIn, mailTo } from '@test/setup/mailbox'

/**
 * Le rôle d'admin, qui est une colonne depuis l'ADR-0015.
 *
 * Le test qui compte est le premier : **aucune inscription ne fabrique un
 * admin**. C'est toute la raison pour laquelle une colonne remplace une
 * variable d'environnement sans rouvrir l'objection de l'ADR-0006 — il n'y a
 * pas d'écran qui accorde le rôle, et il ne doit pas y avoir non plus de chemin
 * qui l'accorde par mégarde. Better Auth insère ses lignes sans connaître cette
 * colonne, donc c'est le défaut de la base qui tient la garantie, et un défaut
 * est exactement le genre de chose qu'une migration future peut perdre sans
 * que personne ne le remarque.
 *
 * La connexion passe par une vraie boîte mail, comme `account.service.test.ts` :
 * on ne peut pas vérifier ce qu'une inscription produit en insérant soi-même la
 * ligne qu'elle aurait produite.
 */
let sequence = 0
function nextAddress(): string {
  sequence += 1
  return `admin-role-${sequence}@example.test`
}

/** Un appelant quelconque : ce fichier ne teste ni la limite ni la reprise. */
let ipSequence = 0
function fromSomewhere(): RequestContext {
  ipSequence += 1
  return {
    request: new Headers({ 'x-forwarded-for': `198.19.${Math.floor(ipSequence / 250)}.${ipSequence % 250}` }),
    presented: null,
  }
}

/** S'inscrit pour de bon — demande, boîte mail, code — et rend le compte créé. */
async function signUp(email: string): Promise<{ id: string; role: string }> {
  await sendSignIn(email, 'code', fromSomewhere())
  const code = codeIn(await mailTo(email))
  const result = await signInByCode(email, code, fromSomewhere())
  expect(result.ok).toBe(true)

  return onlyRow(await db.select().from(users).where(eq(users.email, email)))
}

/** La promotion telle que l'exploitant la fait : un UPDATE, et rien d'autre. */
async function promote(email: string): Promise<void> {
  await db.update(users).set({ role: 'admin' }).where(eq(users.email, email))
}

let EMAIL = ''

beforeEach(async () => {
  EMAIL = nextAddress()
  await clearMailbox()
})

describe('le rôle d’un compte', () => {
  it('est joueur à l’inscription, et il n’y a pas d’autre chemin', async () => {
    const account = await signUp(EMAIL)

    expect(account.role).toBe('player')
    expect(await isAdminEmail(EMAIL)).toBe(false)
    expect(await isAdminUserId(account.id)).toBe(false)
  })

  it('ouvre le back-office une fois la colonne passée à admin', async () => {
    const account = await signUp(EMAIL)
    await promote(EMAIL)

    expect(await isAdminEmail(EMAIL)).toBe(true)
    expect(await isAdminUserId(account.id)).toBe(true)
  })

  it('se retire, et la lecture suivante le dit — rien n’est en cache', async () => {
    const account = await signUp(EMAIL)
    await promote(EMAIL)
    expect(await isAdminUserId(account.id)).toBe(true)

    await db.update(users).set({ role: 'player' }).where(eq(users.email, EMAIL))

    // C'est la propriété que la variable d'environnement ne pouvait pas offrir
    // sans redéploiement, et que le cache de cookie de Better Auth aurait
    // retardée de cinq minutes si le rôle y voyageait.
    expect(await isAdminUserId(account.id)).toBe(false)
  })

  it('se lit sur une adresse tapée avec des majuscules ou des espaces', async () => {
    await signUp(EMAIL)
    await promote(EMAIL)

    // Le formulaire du back-office donne ce que l'admin a tapé. Une majuscule
    // qui fermerait la porte sans rien dire serait indiscernable d'un refus.
    expect(await isAdminEmail(`  ${EMAIL.toUpperCase()} `)).toBe(true)
  })

  it('répond non pour une adresse et un identifiant qui n’existent pas', async () => {
    expect(await isAdminEmail('personne@example.test')).toBe(false)
    expect(await isAdminUserId('un-identifiant-qui-n-existe-pas')).toBe(false)
  })
})
