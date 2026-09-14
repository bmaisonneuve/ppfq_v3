import 'server-only'

import { redirect } from 'next/navigation'

import { isAccountConfigured } from '@/server/auth/account-auth'
import { currentAccountIdentity } from '@/server/auth/account-session'
import type { AccountOutcome } from '@/shared/account'

import { requestSignIn, signInWithCode, signOutAccount } from './account.service'

/**
 * La porte du back-office : **le compte de #13, plus une variable qui dit qui
 * est l'admin**.
 *
 * C'est la sortie que l'ADR-0006 avait annoncée. Le secret partagé et le cookie
 * signé qui tenaient la porte depuis #5 ont disparu avec `auth/admin-session.ts`
 * : il n'y a plus de mot de passe à faire tourner, à partager ou à oublier, et
 * le back-office se ferme désormais par le même code à six chiffres que le jeu.
 *
 * ## Le rôle est dans l'environnement, pas dans une colonne
 *
 * `ADMIN_EMAILS` liste les adresses qui ouvrent `/admin`. Une colonne `role`
 * aurait ajouté un état à administrer — et donc un écran pour le changer, et
 * donc une façon de plus de se donner le rôle. Une variable d'environnement
 * n'est modifiable que par qui déploie, ce qui est exactement la population
 * qu'on veut. Le prix est qu'ajouter un admin demande un redéploiement ; il y
 * en a un, et `docs/stack-technique.md` §6 n'en prévoit pas d'autre.
 *
 * ## Sans variable, la porte reste fermée
 *
 * Repris tel quel de l'ADR-0006, et la raison n'a pas bougé : un back-office
 * qui s'ouvre parce qu'une variable manque échoue en silence et du côté qui
 * laisse entrer. Ici il faut les deux — le compte configuré (`BETTER_AUTH_SECRET`)
 * et au moins une adresse — sans quoi `isAdmin()` répond non à tout le monde,
 * l'exploitant compris, donc il s'en aperçoit.
 *
 * ## Où le contrôle doit être, et ça non plus n'a pas changé
 *
 * Sur **chaque page et chaque Server Action d'admin**, parce qu'une Server
 * Action est joignable par un POST direct quelle que soit la page autour
 * d'elle, et qu'un layout Next 16 ne décide pas si ses segments enfants
 * s'affichent. `test/architecture/admin-guard.test.ts` fait échouer la CI quand
 * un export nouveau l'oublie.
 *
 * ## Ce qui est assumé
 *
 * « Qui contrôle la boîte mail contrôle le back-office » (`docs/stack-technique.md`
 * §4bis) : ni passkey, ni second facteur. La sécurité du back-office **est**
 * celle de la boîte mail de l'admin, et c'est donc là — et nulle part dans ce
 * code — qu'il faut la renforcer. Ce que ce fichier ajoute au-dessus du jeu est
 * une seule chose : le jeton dure dix minutes et ne sert qu'une fois, comme
 * pour tout le monde.
 */

const ADMIN_EMAILS_VAR = 'ADMIN_EMAILS'

/** Where an unauthenticated visitor is sent, and the one page not behind this. */
export const ADMIN_LOGIN_PATH = '/admin/login'

/** Where signing in lands. */
export const ADMIN_HOME_PATH = '/admin'

/** Vraie quand le compte est configuré **et** qu'au moins une adresse est admin. */
export function isAdminConfigured(): boolean {
  return isAccountConfigured() && adminEmails().length > 0
}

/**
 * Whether this request carries an admin session.
 *
 * Une session ouverte ne suffit pas : c'est un jeu, et la plupart des gens
 * connectés sont des joueurs. Ce qui décide est l'adresse.
 */
export async function isAdmin(): Promise<boolean> {
  if (!isAdminConfigured()) return false

  const identity = await currentAccountIdentity()
  return identity !== null && adminEmails().includes(identity.email)
}

/**
 * The gate. Called first in every admin page and every admin Server Action.
 *
 * It redirects rather than throwing a 403: every way of arriving here without
 * the role — no session, a player's session, an expired cookie, a bookmark — is
 * answered by the same thing, the login form. A direct POST to a Server Action
 * gets the redirect and no mutation, which is the point.
 *
 * Un joueur connecté qui tombe sur `/admin` reçoit donc le formulaire de
 * connexion, et c'est la bonne réponse : lui dire « vous êtes connecté mais pas
 * admin » apprendrait à un curieux qu'il existe un rôle à viser.
 */
export async function requireAdmin(): Promise<void> {
  if (await isAdmin()) return
  redirect(ADMIN_LOGIN_PATH)
}

/**
 * Envoie un code à cette adresse — si elle est celle d'un admin.
 *
 * Une adresse qui n'est pas dans la liste reçoit la **même réponse** et aucun
 * email. C'est le seul endroit du projet où l'on refuse sans le dire, et c'est
 * justifié ici et pas ailleurs : côté jeu, demander un code pour une adresse
 * inconnue crée un compte, donc il n'y a rien à révéler ; ici, envoyer un code
 * apprendrait à celui qui essaie des adresses laquelle est celle de l'admin.
 */
export async function requestAdminCode(email: string): Promise<AccountOutcome> {
  if (!isAdminConfigured()) return { ok: false, refusal: 'not-configured' }

  // La limite de fréquence du jeu s'applique quand même : elle est dans
  // `account.service.ts`, avant l'envoi, et c'est elle qui rend le devinage
  // lent — ce que le verrou en mémoire de l'ADR-0006 faisait, en mieux, parce
  // qu'elle compte aussi par adresse.
  if (!adminEmails().includes(email)) return { ok: true, account: null }

  return await requestSignIn(email, 'code')
}

/** Vérifie le code, ouvre la session, et refuse si l'adresse n'est pas admin. */
export async function signInAdmin(email: string, code: string): Promise<AccountOutcome> {
  if (!isAdminConfigured()) return { ok: false, refusal: 'not-configured' }
  if (!adminEmails().includes(email)) return { ok: false, refusal: 'bad-code' }

  return await signInWithCode(email, code)
}

/**
 * Drops the session. Signing out twice is not an error.
 *
 * C'est la session du compte, la même que celle du jeu : un admin qui se
 * déconnecte du back-office se déconnecte tout court. Il n'y en a qu'une, et
 * deux sessions pour une personne auraient demandé de choisir laquelle fait foi.
 */
export async function signOutAdmin(): Promise<void> {
  await signOutAccount()
}

/**
 * Les adresses qui ouvrent le back-office, lues à l'appel et non au chargement
 * du module : le serveur standalone lit son environnement au démarrage, et une
 * valeur capturée dans une constante est une valeur qu'un redémarrage est
 * nécessaire pour changer.
 *
 * Normalisées comme les adresses du compte le sont — minuscules, sans espaces —
 * sinon une majuscule dans la variable fermerait la porte sans rien dire.
 */
function adminEmails(): readonly string[] {
  return (process.env[ADMIN_EMAILS_VAR] ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email !== '')
}
