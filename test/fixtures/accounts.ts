/**
 * Deux comptes, comme il y a deux joueurs.
 *
 * Même raison qu'à côté (`fixtures/players.ts`) : presque tout ce qu'on
 * affirme sur une reprise de progression est une affirmation sur *à qui* elle
 * revient, et une suite à un seul compte ne distingue pas « reprend ma
 * progression » de « reprend une progression ».
 *
 * Ces lignes-là sont écrites en direct plutôt que par Better Auth. Ce que les
 * tests de reprise exercent est la colonne `players.auth_user_id` et rien
 * d'autre ; faire passer chaque cas par une vraie inscription les ferait
 * dépendre d'un envoi d'email pour vérifier un `UPDATE`. Le chemin complet —
 * demande, code reçu, session ouverte — est exercé une fois, et ailleurs
 * (`test/services/account.service.test.ts`).
 */
import { users } from '@/server/db/schema'
import type { Db } from '@/server/db/client'

export const ACCOUNT_IDS = {
  /** Le compte dont un test parle. */
  mine: 'user_mine',
  /** Quelqu'un d'autre, qui est là pour ne pas être lu. */
  other: 'user_other',
} as const

export const ACCOUNT_EMAILS = {
  mine: 'moi@example.test',
  other: 'quelqu-un-dautre@example.test',
} as const

export async function seedAccounts(executor: Db): Promise<void> {
  await executor.insert(users).values([
    { id: ACCOUNT_IDS.mine, email: ACCOUNT_EMAILS.mine, emailVerified: true },
    { id: ACCOUNT_IDS.other, email: ACCOUNT_EMAILS.other, emailVerified: true },
  ])
}

/** Le compte tel que `resolvePlayer` le reçoit : un identifiant et une adresse. */
export const ACCOUNTS = {
  mine: { userId: ACCOUNT_IDS.mine, email: ACCOUNT_EMAILS.mine },
  other: { userId: ACCOUNT_IDS.other, email: ACCOUNT_EMAILS.other },
} as const
