/**
 * Accorde ou retire le rôle d'admin à un compte, dans la base que
 * `DATABASE_URL` désigne.
 *
 *     pnpm admin:grant  vous@exemple.fr
 *     pnpm admin:grant  vous@exemple.fr --revoke
 *     pnpm admin:grant  --list
 *
 * C'est **le seul chemin** par lequel `users.role` est écrit : rien dans
 * l'application ne l'écrit, et il n'y a pas d'écran qui accorde le rôle
 * (ADR-0015). Ce script n'est donc pas une commodité, c'est le mécanisme — et
 * il ne fait rien qu'un `UPDATE` à la main ne ferait, sinon écrire la bonne
 * requête et dire ce qu'il a changé.
 *
 * Il exige un compte qui existe déjà, et refuse plutôt que de le créer : un
 * compte est fabriqué par une connexion vérifiée (un code reçu dans une boîte),
 * et un script qui en insérerait un contournerait précisément cette preuve. La
 * marche à suivre pour un nouvel admin est donc : il se connecte une fois côté
 * jeu, puis on le promeut ici.
 */
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'

import { users } from '../src/server/db/schema.ts'
import { loadEnvLocal, withPool } from './db.ts'

loadEnvLocal()

const url = process.env.DATABASE_URL
if (url === undefined || url === '') {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local, then run `pnpm db:up`.',
  )
}

const USAGE = 'Usage: pnpm admin:grant <email> [--revoke] | pnpm admin:grant --list'

const args = process.argv.slice(2)
const list = args.includes('--list')
const revoke = args.includes('--revoke')

/** L'adresse visée, normalisée comme la base la range : minuscules, sans espaces. */
function targetEmail(): string {
  const found = args.find((arg) => !arg.startsWith('--'))?.trim().toLowerCase() ?? ''
  if (found === '') throw new Error(USAGE)

  return found
}

await withPool(url, async (pool) => {
  const db = drizzle(pool)

  if (list) {
    const admins = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.role, 'admin'))

    console.log(
      admins.length === 0
        ? 'Aucun admin. Personne ne peut ouvrir /admin.'
        : [`${admins.length} admin(s) :`, ...admins.map((a) => `  ${a.email}`)].join('\n'),
    )
    return
  }

  const email = targetEmail()
  const [changed] = await db
    .update(users)
    .set({ role: revoke ? 'player' : 'admin' })
    .where(eq(users.email, email))
    .returning({ email: users.email, role: users.role })

  if (changed === undefined) {
    // Refuser plutôt que créer : voir l'en-tête. Le message dit quoi faire,
    // parce que « compte introuvable » sur une adresse qu'on vient de taper
    // ressemble à une faute de frappe alors que c'est le plus souvent quelqu'un
    // qui ne s'est pas encore connecté.
    throw new Error(
      `Aucun compte pour ${email}. Demandez-lui de se connecter une fois sur le jeu, puis relancez.`,
    )
  }

  console.log(
    revoke
      ? `${changed.email} n’est plus admin. Sa prochaine requête sur /admin est refusée : le rôle est relu à chaque fois, rien n’est en cache.`
      : `${changed.email} est admin.`,
  )
})
