import 'server-only'

import { headers } from 'next/headers'

import { accountAuth, isAccountConfigured } from '@/server/auth/account-auth'
import { currentAccountIdentity } from '@/server/auth/account-session'
import type { AccountIdentity } from '@/server/auth/account-session'
import { isAdminUserId } from '@/server/auth/admin-role'
import { quotaLimiter } from '@/server/domain/rate-limit'
import { MailNotSent } from '@/server/email/mailer'
import { sendSignInCode } from '@/server/email/sign-in-mails'
import { SIGN_IN_TTL_SECONDS } from '@/shared/account'
import type { AccountOutcome, AccountRefusal, AccountState } from '@/shared/account'

import {
  playerIdOfCookie,
  presentedPlayerCookie,
  rememberPlayerCookie,
  resolvePlayer,
} from './player.service'
import { rememberClaim, sweepExpiredClaims } from './progress-claim.service'

/**
 * Le compte : demander, se connecter, se déconnecter.
 *
 * S'inscrire et se connecter sont **une seule action** (specs §6), donc ce
 * service n'a pas de fonction `signUp`. On demande, on présente, on est
 * connecté — et savoir si le compte existait déjà est une information que
 * personne ne reçoit, pas même celui qui demande.
 *
 * ## Le code à six chiffres est la voie principale, le lien est un raccourci
 *
 * Contre-intuitif, et c'est le §4bis de `docs/stack-technique.md` qui le
 * tranche. Le lien est cliqué dans le client mail, qui ouvre souvent **un autre
 * navigateur** que celui où l'on jouait : le cookie d'identité anonyme reste de
 * l'autre côté, et la progression se perd au moment précis où on promet de la
 * garder. Et les scanners de liens — SafeLinks, antivirus mail — préchargent
 * les URL, donc brûlent un jeton à usage unique avant le clic.
 *
 * Les deux problèmes sont traités, pas seulement contournés : `pending_claims`
 * pour le premier (`progress-claim.service.ts`), et pour le second un callback
 * en deux temps — la page `/compte/connexion` n'est qu'un bouton, et c'est son
 * POST qui consomme (`confirmSignInLink`).
 *
 * ## La limite de fréquence est ici et pas dans Better Auth
 *
 * Celle de Better Auth compte par chemin. Les specs en demandent une **par IP
 * et par adresse email**, et c'est la seconde qui compte : sans elle, on
 * bombarde la boîte d'un tiers en tapant son adresse. Les deux compteurs sont
 * consommés à chaque demande — y compris quand l'autre a déjà refusé, sans quoi
 * marteler une adresse épuisée sortirait gratuitement du compteur d'IP.
 *
 * ## Ce fichier est coupé en deux, comme `player.service.ts`
 *
 * Les **portes** lisent la requête — les en-têtes, le cookie du joueur — et
 * reposent le cookie en sortie. Tout le reste reçoit ce qu'elles ont lu en
 * argument. C'est le même échange qu'à côté, et il rapporte la même chose : une
 * demande limitée, un code refusé, une reprise de progression et un lien ouvert
 * dans un autre navigateur deviennent des cas qu'un test joue contre un vrai
 * Postgres et une vraie boîte mail, au lieu de contextes Next à fabriquer.
 */

/**
 * Cinq demandes par quart d'heure et par adresse.
 *
 * Assez pour « il n'est pas arrivé, renvoyez-le » deux ou trois fois, et loin
 * de ce qui remplit une boîte. C'est la dimension qui protège quelqu'un dont
 * l'adresse est tapée par un autre, donc celle qui doit être la plus serrée.
 */
const PER_EMAIL = quotaLimiter({ max: 5, windowMs: 15 * 60 * 1000 })

/**
 * Vingt par quart d'heure et par IP.
 *
 * Plus large parce qu'une IP est partagée — un réseau d'entreprise, un opérateur
 * mobile, un foyer — et qu'une limite trop serrée y empêcherait de se connecter
 * des gens qui n'ont rien à voir les uns avec les autres.
 */
const PER_IP = quotaLimiter({ max: 20, windowMs: 15 * 60 * 1000 })

/** Une adresse d'appelant qu'on n'a pas su lire. Partagée, donc, et c'est voulu. */
const UNKNOWN_IP = 'inconnue'

/** Ce qu'une porte a lu de la requête, et que le reste reçoit en argument. */
export type RequestContext = {
  /** Les en-têtes : ce que Better Auth exige, et ce qui porte l'adresse d'appel. */
  request: Headers
  /** Ce que le navigateur présente comme identité anonyme. */
  presented: string | null
}

/** Une connexion qui a marché : le compte, et le joueur qui va avec. */
export type SignedIn = {
  ok: true
  account: NonNullable<AccountState>
  /** Le cookie que le navigateur doit emporter — celui du joueur du compte. */
  cookieId: string
}

export type SignInResult = SignedIn | { ok: false; refusal: AccountRefusal }

/* ------------------------------------------------------------------------- *
 * Les portes
 * ------------------------------------------------------------------------- */

/** Envoie un code, ou un lien, à cette adresse. */
export async function requestSignIn(email: string, via: 'code' | 'link'): Promise<AccountOutcome> {
  return await sendSignIn(email, via, await requestContext())
}

/**
 * Le code, présenté dans l'onglet où l'on joue.
 *
 * La porte repose le cookie du joueur, et c'est indispensable plutôt que
 * soigné : la reprise vient peut-être de désigner une **autre** ligne `players`
 * que celle du cookie présenté — celle qui portait la partie, restée dans
 * l'onglet du jeu. Sans cette réécriture, la requête suivante repartirait sur
 * l'ancienne.
 */
export async function signInWithCode(email: string, code: string): Promise<AccountOutcome> {
  return await settle(await signInByCode(email, code, await requestContext()))
}

/** Le lien, confirmé à la main sur la page où il mène. */
export async function confirmSignInLink(token: string): Promise<AccountOutcome> {
  return await settle(await signInByLink(token, await requestContext()))
}

/** Qui est connecté, ou personne. Une adresse, et le rôle s'il y en a un. */
export async function currentAccount(): Promise<AccountState> {
  const identity = await currentAccountIdentity()
  return identity === null ? null : await accountOf(identity)
}

/**
 * Ferme la session — et ne touche ni au cookie du joueur ni à ses parties.
 *
 * Se déconnecter n'est pas se retirer du jeu : la ligne `players` reste celle
 * du compte, le navigateur garde son cookie, et la personne rejoue
 * immédiatement sous la même identité anonyme. Se reconnecter la retrouvera par
 * `auth_user_id`, sans rien avoir à reprendre.
 */
export async function signOutAccount(): Promise<void> {
  if (!isAccountConfigured()) return

  try {
    await accountAuth().api.signOut({ headers: await headers() })
  } catch (error) {
    // Une session déjà expirée, un cookie forgé : se déconnecter deux fois
    // n'est pas une erreur, et la porte de sortie ne doit jamais coincer.
    console.error(`[compte] déconnexion sans session : ${String(error)}`)
  }
}

/* ------------------------------------------------------------------------- *
 * Ce qui décide, et qui ne lit pas la requête
 * ------------------------------------------------------------------------- */

/**
 * Envoie, et retient sous quel joueur cette adresse est en train de jouer.
 *
 * L'ordre compte : l'association est écrite **avant** l'envoi, pendant que le
 * cookie est là. Elle ne dépend donc ni du navigateur qui ouvrira le lien ni du
 * fait que l'email arrive.
 *
 * La réponse est la même pour une adresse connue et pour une inconnue. C'est la
 * conséquence directe de « s'inscrire et se connecter sont une seule action » :
 * il n'y a rien à distinguer, donc rien à révéler.
 */
export async function sendSignIn(
  email: string,
  via: 'code' | 'link',
  context: RequestContext,
): Promise<AccountOutcome> {
  if (!isAccountConfigured()) return refused('not-configured')

  // Les deux compteurs, toujours, et jamais en court-circuit : une adresse déjà
  // épuisée doit continuer de coûter au compteur de son IP.
  const now = Date.now()
  const allowedByIp = PER_IP.take(clientIp(context.request), now)
  const allowedByEmail = PER_EMAIL.take(email, now)
  if (!allowedByIp || !allowedByEmail) return refused('too-many-requests')

  await rememberPlayingAs(email, context.presented)

  try {
    if (via === 'link') await sendLink(email, context)
    else await sendCode(email)
  } catch (error) {
    // Deux pannes, et elles ne se disent pas pareil. Le relais qui refuse est
    // `MailNotSent` et rien d'autre ; tout le reste — la base qui ne répond
    // pas, une table qui manque — est de notre côté, et envoyer quelqu'un
    // fouiller ses indésirables pour un message jamais fabriqué serait le
    // promener. Le journal, lui, porte la vraie cause dans les deux cas.
    console.error(`[compte] demande de connexion non partie : ${String(error)}`)

    return refused(error instanceof MailNotSent ? 'mail-unavailable' : 'unavailable')
  }

  // Rien de ce que le compte sait ne sort d'ici : une demande dit qu'elle est
  // partie, jamais à qui.
  return { ok: true, account: null }
}

/**
 * Le code : **fabriqué par Better Auth, envoyé par nous**.
 *
 * `createVerificationOTP` plutôt que `sendVerificationOTP`, et ce n'est pas un
 * détail de style. La seconde passe notre envoi par son `runInBackgroundOrAwait`,
 * qui **avale l'exception et répond `{ success: true }`** : un relais SMTP
 * absent ou en panne serait alors rapporté au joueur comme un envoi réussi, et
 * il attendrait un code qui n'existe pas. Sans mot de passe, c'est
 * l'impossibilité de se connecter, annoncée comme une réussite — exactement ce
 * que `server/email/mailer.ts` existe pour éviter.
 *
 * L'endpoint utilisé écrit la même ligne de `verifications` — même identifiant,
 * même hachage, même échéance — et rend le code en clair. C'est la même
 * répartition que partout ailleurs dans ce ticket : Better Auth est le magasin,
 * il n'est pas la politique (ADR-0014).
 */
async function sendCode(email: string): Promise<void> {
  // Deux temps, et c'est ce qui rend les deux pannes distinguables : ce qui
  // lève ici est une panne de base, ce qui rend `false` en dessous est le
  // relais. Une seule expression aurait tout confondu.
  const code = await accountAuth().api.createVerificationOTP({
    body: { email, type: 'sign-in' },
  })

  if (!(await sendSignInCode(email, code))) throw new MailNotSent()
}

/**
 * Le lien, lui, part par Better Auth : `signInMagicLink` attend notre envoi
 * directement, donc un échec remonte et il n'y a rien à contourner.
 *
 * Ce chemin-là fabrique le jeton *et* envoie dans un seul appel de
 * bibliothèque, donc la distinction des deux pannes tient à ce que notre
 * `MailNotSent` traverse `auth.api` sans être réemballée — ce que
 * `test/services/account.service.test.ts` affirme plutôt que de l'espérer.
 */
async function sendLink(email: string, context: RequestContext): Promise<void> {
  await accountAuth().api.signInMagicLink({ body: { email }, headers: context.request })
}

/**
 * Les trois façons d'échouer — mauvais code, code expiré, code déjà servi —
 * répondent la même chose, et c'est délibéré : les distinguer dirait à qui
 * essaie des codes lesquels sont passés près.
 */
export async function signInByCode(
  email: string,
  code: string,
  context: RequestContext,
): Promise<SignInResult> {
  return await completeSignIn(context, async () => {
    const result = await accountAuth().api.signInEmailOTP({
      body: { email, otp: code },
      headers: context.request,
    })
    return result.user
  })
}

/**
 * Jamais appelé par un GET : c'est tout l'intérêt. Un préchargement tombe sur
 * la page `/compte/connexion`, la page ne consomme rien, et le jeton attend le
 * clic.
 */
export async function signInByLink(
  token: string,
  context: RequestContext,
): Promise<SignInResult> {
  return await completeSignIn(context, async () => {
    const result = await accountAuth().api.magicLinkVerify({
      query: { token },
      headers: context.request,
    })
    return result.user
  })
}

/**
 * Ce qui suit une session ouverte : la reprise de progression.
 *
 * Le compte est passé à `resolvePlayer` explicitement plutôt que relu depuis la
 * requête : la session vient d'être ouverte dans les cookies de la *réponse*,
 * et les en-têtes portent encore la requête entrante, où il n'y avait personne.
 */
async function completeSignIn(
  context: RequestContext,
  signIn: () => Promise<{ id: string; email: string }>,
): Promise<SignInResult> {
  if (!isAccountConfigured()) return refused('not-configured')

  let account: AccountIdentity
  try {
    const user = await signIn()
    account = { userId: user.id, email: user.email }
  } catch (error) {
    console.error(`[compte] connexion refusée : ${String(error)}`)
    return refused('bad-code')
  }

  const identity = await resolvePlayer(context.presented, account)

  return { ok: true, account: await accountOf(account), cookieId: identity.cookieId }
}

/**
 * Le compte tel que le navigateur le reçoit — ici, et pas à deux endroits.
 *
 * Les deux chemins qui nomment quelqu'un passent par cette fonction : la
 * lecture de session (`currentAccount`) et la connexion qui vient d'aboutir
 * (`completeSignIn`). Sans ça, un admin qui se connecte dans l'onglet du jeu ne
 * verrait son raccourci vers `/admin` qu'au rechargement suivant — la
 * connexion ne relit pas l'état, et n'a aucune raison de le faire (le panneau
 * se peuple de la réponse qu'il vient de recevoir).
 *
 * `admin` n'est posé que quand il est vrai. La raison est dans
 * `shared/account.ts` : un `false` explicite apprendrait à tout joueur connecté
 * qu'il existe un rôle, et c'est précisément ce que le back-office ne dit pas.
 *
 * La lecture se fait par l'identifiant du compte et non par son adresse : c'est
 * la clé primaire, et une adresse peut changer là où un identifiant ne change
 * pas. Elle coûte une ligne, une fois par visite d'un joueur connecté.
 */
async function accountOf(identity: AccountIdentity): Promise<NonNullable<AccountState>> {
  const { email } = identity

  return (await isAdminUserId(identity.userId)) ? { email, admin: true } : { email }
}

/**
 * Retient sous quel joueur cette adresse est en train de jouer, s'il y en a un.
 *
 * Rien n'est créé ici : quelqu'un qui se connecte sans avoir jamais joué n'a
 * pas de progression à reprendre, et lui fabriquer une ligne vide à chaque
 * adresse tapée serait une table qui grandit pour rien.
 */
async function rememberPlayingAs(email: string, presented: string | null): Promise<void> {
  const playerId = await playerIdOfCookie(presented)
  if (playerId === null) return

  await rememberClaim(email, playerId, new Date(Date.now() + SIGN_IN_TTL_SECONDS * 1000))
  // Le seul moment où quelqu'un paie le ménage est celui où il en crée : il n'y
  // a pas de cron pour cette table, et une suppression bornée par une date
  // coûte un parcours d'index.
  await sweepExpiredClaims()
}

/** Ce que la porte a lu de la requête. */
async function requestContext(): Promise<RequestContext> {
  return { request: await headers(), presented: await presentedPlayerCookie() }
}

/**
 * Une connexion réussie repose le cookie du joueur ; un refus ne touche à rien.
 *
 * Le `cookieId` s'arrête ici : il dit au navigateur qui il est, il n'a rien à
 * faire dans une réponse JSON que du JavaScript peut lire.
 */
async function settle(result: SignInResult): Promise<AccountOutcome> {
  if (!result.ok) return result

  await rememberPlayerCookie(result.cookieId)
  return { ok: true, account: result.account }
}

/**
 * L'adresse de l'appelant, telle que Cloudflare la donne.
 *
 * `cf-connecting-ip` d'abord parce que c'est lui qui est devant l'origine
 * (`docs/stack-technique.md` §1) et que c'est le seul en-tête qu'un client ne
 * peut pas fabriquer : le proxy le réécrit. `x-forwarded-for` ne sert qu'en
 * développement, où il n'y a rien devant — s'y fier en production donnerait une
 * clé de limite choisie par celui qu'elle limite.
 *
 * **En production, tout ce qui arrive sans cet en-tête partage une seule clé**,
 * et c'est voulu plutôt que subi. Cloudflare le pose toujours, donc ce qui en
 * est dépourvu est du trafic qui a contourné le proxy et joint l'origine en
 * direct : une population qui, dans un déploiement correct, est vide. La
 * rationner collectivement est la bonne réponse — on ne peut pas l'attribuer,
 * et lui donner un plafond à elle serait offrir le contournement comme échappée.
 * La dimension qui protège vraiment quelqu'un reste celle par adresse.
 */
function clientIp(request: Headers): string {
  const direct = request.get('cf-connecting-ip')
  if (direct !== null && direct !== '') return direct

  if (process.env.NODE_ENV === 'production') return UNKNOWN_IP

  const forwarded = request.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''
  return forwarded === '' ? UNKNOWN_IP : forwarded
}

/**
 * Un refus, et rien de plus : la phrase à afficher est dans `shared/account.ts`.
 *
 * Sa forme appartient aux deux unions de ce fichier, donc il n'y a pas de
 * conversion à écrire : `{ ok: false }` est un refus, quelle que soit la
 * réussite à laquelle il s'oppose.
 */
const refused = (refusal: AccountRefusal): { ok: false; refusal: AccountRefusal } => ({
  ok: false,
  refusal,
})
