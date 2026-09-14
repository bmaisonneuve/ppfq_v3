import 'server-only'

import { and, eq, gt, isNull, sql } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { pendingClaims, players } from '@/server/db/schema'
import type { AccountIdentity } from '@/server/auth/account-session'

/**
 * La reprise de progression : « la progression déjà réalisée sans compte est
 * reprise à l'inscription » (specs §6), et rien de plus.
 *
 * Ce que ça **n'est pas** est le cœur du sujet. Ce n'est ni une migration de
 * données, ni un merge `localStorage` ↔ base, ni une fusion de deux historiques
 * : c'est un `UPDATE players SET auth_user_id` (ADR-0003). Tout ce qui désigne
 * un joueur — `player_progress`, `player_stats`, `pending_claims` — pointe sur
 * `players.id` et ne bouge pas. C'est exactement ce que le plugin `anonymous`
 * de Better Auth aurait fait de travers : il supprime la ligne anonyme après
 * liaison, donc il aurait effacé la progression qu'on venait promettre.
 *
 * ## Pourquoi elle ne peut pas se faire depuis le seul cookie
 *
 * Parce que le lien magique s'ouvre dans le navigateur du client mail, qui
 * n'est pas celui où l'on jouait (`docs/stack-technique.md` §4bis) : le cookie
 * d'identité anonyme n'est pas là au moment de la connexion, et une reprise
 * lue au callback perdrait la progression au moment même où on promet de la
 * garder. L'association est donc écrite **à la demande du code ou du lien**,
 * dans l'onglet du jeu où le cookie est encore présent — `rememberClaim` — et
 * relue à la connexion, où qu'elle se produise.
 *
 * C'est aussi ce qui fait du code à six chiffres la voie principale : tapé dans
 * l'onglet du jeu, il rend ce détour inutile, et le détour est ce qui peut
 * rater.
 *
 * ## Pourquoi elle est rejouée à chaque requête et non une fois
 *
 * Parce qu'un `UPDATE` conditionné à « et pas encore réclamé » est idempotent
 * par construction, et qu'un mécanisme qui ne s'exécute qu'une fois est un
 * mécanisme qui ne s'est pas exécuté quand il a raté. Rejouée, la reprise ne
 * duplique ni ne détruit rien : le premier appel lie, les suivants relisent.
 * Elle devient alors la réponse à la question « qui est ce joueur », et plus un
 * geste de connexion qui pourrait manquer.
 */

/** Un joueur et le cookie qui le nomme. La forme que `player.service` rend. */
type ClaimedIdentity = { playerId: string; cookieId: string }

/**
 * Écrit « cette adresse joue en ce moment sous ce joueur », pendant que le
 * cookie est là pour le dire.
 *
 * Un `UPDATE` sur conflit plutôt qu'un `INSERT` sec : redemander un code ne
 * doit pas laisser une ligne par envoi, et la seule chose qui change d'une
 * demande à l'autre est l'échéance.
 */
export async function rememberClaim(
  email: string,
  playerId: string,
  expiresAt: Date,
): Promise<void> {
  await db
    .insert(pendingClaims)
    .values({ email, playerId, expiresAt })
    .onConflictDoUpdate({
      target: [pendingClaims.email, pendingClaims.playerId],
      set: { expiresAt },
    })
}

/**
 * Le joueur de ce compte — celui qu'il avait déjà, ou celui qu'on vient de lui
 * rattacher. `null` quand il n'y a rien à reprendre.
 *
 * L'ordre des trois sources n'est pas indifférent :
 *
 * 1. **le joueur que le compte porte déjà** : une fois lié, c'est lui, et rien
 *    ne le remplace. C'est ce qui rend l'appel idempotent et ce qui ramène au
 *    bon joueur un navigateur qui arrive avec un autre cookie ;
 * 2. **l'association écrite à la demande** : elle vient de l'onglet du jeu,
 *    donc elle désigne la partie en cours. Elle passe devant le cookie présenté
 *    parce que le navigateur qui ouvre un lien magique a souvent une identité
 *    anonyme à lui, qui ne porte rien ;
 * 3. **le cookie présenté**, pour qui demande un code sans avoir encore joué.
 */
export async function claimedPlayer(
  account: AccountIdentity,
  presentedCookieId: string,
): Promise<ClaimedIdentity | null> {
  const held = await playerOfAccount(account.userId)
  if (held !== null) return held

  const candidate =
    (await claimedPlayerId(account.email)) ?? (await unclaimedPlayerIdOfCookie(presentedCookieId))
  if (candidate === undefined) return null

  const linked = await link(candidate, account.userId)
  if (linked !== null) {
    await forgetClaims(account.email)
    return linked
  }

  // Perdu une course : une requête simultanée a lié une autre ligne à ce
  // compte, ou ce joueur-là vient d'être pris. Dans les deux cas, la vérité est
  // la ligne que le compte porte maintenant.
  return await playerOfAccount(account.userId)
}

/** Le joueur que ce compte porte, marqué revu au passage. */
async function playerOfAccount(userId: string): Promise<ClaimedIdentity | null> {
  const rows = await db
    .update(players)
    .set({ lastSeenAt: new Date() })
    .where(eq(players.authUserId, userId))
    .returning({ playerId: players.id, cookieId: players.cookieId })

  return rows[0] ?? null
}

/**
 * Le joueur qu'une association encore valide désigne pour cette adresse, à
 * condition qu'il soit toujours libre.
 *
 * `auth_user_id IS NULL` n'est pas de la prudence : deux navigateurs peuvent
 * avoir laissé chacun leur association pour la même adresse, et la seconde ne
 * doit pas défaire la première.
 */
async function claimedPlayerId(email: string): Promise<string | undefined> {
  const rows = await db
    .select({ playerId: players.id })
    .from(pendingClaims)
    .innerJoin(players, eq(players.id, pendingClaims.playerId))
    .where(
      and(
        eq(pendingClaims.email, email),
        gt(pendingClaims.expiresAt, new Date()),
        isNull(players.authUserId),
      ),
    )
    .limit(1)

  return rows[0]?.playerId
}

/** Le joueur du cookie présenté, s'il existe et n'appartient à personne. */
async function unclaimedPlayerIdOfCookie(cookieId: string): Promise<string | undefined> {
  const rows = await db
    .select({ playerId: players.id })
    .from(players)
    .where(and(eq(players.cookieId, cookieId), isNull(players.authUserId)))

  return rows[0]?.playerId
}

/**
 * Le seul écrit de la reprise, et toute sa sûreté tient dans son `where` :
 * `auth_user_id IS NULL` fait de la liaison un geste qui ne s'applique qu'une
 * fois, quel que soit le nombre d'appels et de requêtes simultanées.
 *
 * L'index unique sur la colonne peut le refuser — le compte a gagné une autre
 * ligne entre-temps — et c'est une course perdue, pas une panne : l'appelant
 * relit ce que le compte porte.
 */
async function link(playerId: string, userId: string): Promise<ClaimedIdentity | null> {
  try {
    const rows = await db
      .update(players)
      .set({ authUserId: userId, lastSeenAt: new Date() })
      .where(and(eq(players.id, playerId), isNull(players.authUserId)))
      .returning({ playerId: players.id, cookieId: players.cookieId })

    return rows[0] ?? null
  } catch {
    return null
  }
}

/**
 * Ce qui attendait cette adresse n'attend plus rien.
 *
 * Les associations expireraient toutes seules ; les effacer n'est donc pas du
 * ménage mais une garantie : rien ne peut relire une association déjà servie,
 * et une seconde connexion repart de ce que le compte porte.
 */
async function forgetClaims(email: string): Promise<void> {
  await db.delete(pendingClaims).where(eq(pendingClaims.email, email))
}

/**
 * Le balayage des associations périmées.
 *
 * Elles ne gênent personne — toute lecture filtre sur l'échéance — mais rien ne
 * les efface non plus quand la connexion n'a jamais lieu, et c'est la seule
 * table du compte qui grandisse au rythme des demandes. Appelé à la demande
 * suivante plutôt que par un job : il n'y a pas de cron pour ça, et une
 * suppression bornée par une date coûte un parcours d'index.
 */
export async function sweepExpiredClaims(): Promise<void> {
  await db.delete(pendingClaims).where(sql`${pendingClaims.expiresAt} <= now()`)
}
