import 'server-only'

import { eq } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { users } from '@/server/db/schema'

/**
 * Qui est admin : une colonne de `users`, lue à chaque question (ADR-0015).
 *
 * Elle remplace `ADMIN_EMAILS`, et l'objection que l'ADR-0006 opposait à une
 * colonne — « un état à administrer, donc un écran pour le changer, donc une
 * façon de plus de se donner le rôle » — tombe parce que **l'écran n'existe
 * pas**. Rien dans ce dépôt n'écrit `users.role` : le seul chemin est un UPDATE
 * à la main sur la base (`pnpm admin:grant`), donc le rôle se donne toujours
 * avec un accès que seul l'exploitant a. Ce qu'on gagne en échange est qu'il
 * suit la personne dans la base qu'on sauvegarde, au lieu de vivre dans un
 * environnement qu'un redéploiement est nécessaire pour changer.
 *
 * ## Lu à chaque fois, et jamais mis en cache
 *
 * C'est la différence qui compte avec la variable d'environnement. Retirer le
 * rôle à quelqu'un doit prendre effet **à sa requête suivante**, et non à
 * l'expiration de son cookie de session. Le rôle n'est donc pas déclaré dans les
 * champs que Better Auth recopie dans la session : il y serait porté par le cache
 * de cookie signé (`session.cookieCache`, cinq minutes) et une révocation
 * traînerait cinq minutes — ce qui est long quand on révoque en urgence.
 *
 * Le prix est une lecture par question, sur une ligne atteinte par sa clé
 * primaire ou par `users_email_key`. Elle n'est pas sur le chemin du pic : les
 * pages d'admin sont rares, et côté jeu c'est `POST /api/account/state` qui la
 * paie — une fois par visite, et seulement pour quelqu'un de connecté. Ce qui
 * est appelé à chaque requête personnelle est `currentAccountIdentity()`, qui
 * ne passe pas par ici.
 *
 * ## Ce fichier ne garde aucune porte
 *
 * Il répond à une question, il n'autorise rien. La porte est `requireAdmin()`
 * dans `services/admin-auth.service.ts`, appelée en première ligne de chaque
 * page et de chaque action du back-office, et `test/architecture/admin-guard.test.ts`
 * fait échouer la CI quand un export nouveau l'oublie.
 */

/** Vrai quand ce compte porte le rôle admin. */
export async function isAdminUserId(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return row?.role === 'admin'
}

/**
 * Vrai quand cette adresse est celle d'un admin.
 *
 * Par l'adresse et non par l'identifiant parce que la porte du back-office se
 * pose la question **avant** qu'il y ait une session : c'est ce qui décide si
 * un code part. L'adresse est normalisée comme partout ailleurs — Better Auth
 * range en minuscules, et une majuscule tapée dans le formulaire ne doit pas
 * fermer la porte sans rien dire.
 */
export async function isAdminEmail(email: string): Promise<boolean> {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1)

  return row?.role === 'admin'
}
