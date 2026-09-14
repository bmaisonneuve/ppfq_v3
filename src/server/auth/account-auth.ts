import 'server-only'

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { nextCookies } from 'better-auth/next-js'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { magicLink } from 'better-auth/plugins/magic-link'

import { db } from '@/server/db/client'
import { accounts, sessions, users, verifications } from '@/server/db/schema'
import { MailNotSent } from '@/server/email/mailer'
import { sendSignInCode, sendSignInLink } from '@/server/email/sign-in-mails'
import {
  ACCOUNT_LINK_PATH,
  ACCOUNT_LINK_TOKEN,
  ACCOUNT_SESSION_SECONDS,
  SIGN_IN_CODE_LENGTH,
  SIGN_IN_TTL_SECONDS,
} from '@/shared/account'

/**
 * Better Auth, configuré — le magasin de comptes, de sessions et de jetons.
 *
 * Ce fichier est un **réglage**, pas une règle : ce qui décide quoi que ce soit
 * sur un joueur est dans `services/account.service.ts`. Ce qui est ici est ce
 * que la bibliothèque a besoin de savoir, et chacun de ces réglages a une
 * raison qui tient dans `docs/stack-technique.md` §4bis.
 *
 * ## Aucune route n'est montée
 *
 * `app/api/auth/[...all]/route.ts` du §4 n'existe pas, et c'est la seule
 * divergence de forme avec le document. Trois raisons, dont la première
 * suffirait :
 *
 * - la limite de fréquence des specs est **par IP et par adresse email**, et
 *   celle de Better Auth est par chemin. Il faut donc une porte à nous devant
 *   la demande, sans quoi on peut bombarder la boîte d'un tiers ;
 * - le callback du lien magique doit être **GET puis confirmation explicite**
 *   pour qu'un préchargement ne consomme rien. Le sien consomme en GET ;
 * - la règle de layering du dépôt (`eslint.config.mjs`) veut que `app/`
 *   n'atteigne le serveur que par un service. Un `[...all]` qui réexporte le
 *   handler la contournerait sans rien apporter — il n'y a pas de client Better
 *   Auth dans ce jeu, donc personne pour appeler ces chemins.
 *
 * Les endpoints existent tous de toute façon : `auth.api.*` les appelle en
 * direct, et `nextCookies()` pose les cookies par `next/headers`.
 *
 * ## L'instance est paresseuse
 *
 * Même raison que `db/client.ts` : `next build` évalue chaque module de route
 * pour en lire la configuration de segment, sur une machine qui n'a ni base ni
 * secret. Construire l'instance au premier appel garde ce build vert et fait
 * échouer la configuration manquante là où elle fait vraiment mal.
 */

const SECRET_VAR = 'BETTER_AUTH_SECRET'
const URL_VAR = 'APP_URL'

/** Le développement, où l'application se sert sur ce port. */
const DEFAULT_APP_URL = 'http://localhost:3000'

/**
 * L'origine publique de l'application.
 *
 * Elle sert à deux choses qui doivent être d'accord : ce que Better Auth
 * considère comme son `baseURL`, et l'URL écrite dans l'email du lien magique.
 * Une seule lecture, donc, plutôt qu'une constante de chaque côté.
 */
export function appUrl(): string {
  const configured = process.env[URL_VAR] ?? ''
  const url = configured === '' ? DEFAULT_APP_URL : configured

  // Une boucle plutôt qu'un `/\/+$/` : la classe répétée en fin de motif est
  // exactement la forme qui rétrograde en temps quadratique sur une entrée
  // choisie, et celle-ci vient de l'environnement.
  let end = url.length
  while (end > 0 && url[end - 1] === '/') end -= 1

  return url.slice(0, end)
}

/** L'URL que reçoit le joueur : une page à nous, qui ne consomme rien. */
function signInLinkUrl(token: string): string {
  return `${appUrl()}${ACCOUNT_LINK_PATH}?${ACCOUNT_LINK_TOKEN}=${encodeURIComponent(token)}`
}

/** Vraie quand le secret de session est là. Sans lui, le compte reste fermé. */
export function isAccountConfigured(): boolean {
  return (process.env[SECRET_VAR] ?? '') !== ''
}

let instance: ReturnType<typeof build> | undefined

/** L'instance, construite au premier appel puis gardée. */
export function accountAuth(): ReturnType<typeof build> {
  instance ??= build()
  return instance
}

function build() {
  return betterAuth({
    appName: 'Footguessr',
    baseURL: appUrl(),
    secret: process.env[SECRET_VAR],

    database: drizzleAdapter(db, {
      provider: 'pg',
      // Les tables du dépôt sont au pluriel, et `user` est un mot réservé de
      // Postgres qu'il faudrait citer dans le moindre `psql` à la main.
      usePlural: true,
      // Une inscription écrit un compte et une session ; les deux ou aucune.
      transaction: true,
      // Nommément, et pas le schéma entier : l'adaptateur n'a rien à voir du
      // catalogue ni des parties, et une table de plus ici serait une table
      // qu'une bibliothèque tierce peut écrire.
      schema: { users, sessions, accounts, verifications },
    }),

    // Il n'y a pas de mot de passe (specs §6) : ni stockage, ni flow de
    // réinitialisation, ni credential stuffing sur un compte qui ne contient
    // que des statistiques.
    emailAndPassword: { enabled: false },

    session: {
      expiresIn: ACCOUNT_SESSION_SECONDS,
      // Glissant : la session est prolongée quand elle sert, au plus une fois
      // par jour. Sans cela, un joueur quotidien serait déconnecté au 180e jour
      // exactement comme un joueur parti.
      updateAge: 60 * 60 * 24,
      // Le cookie porte la session pendant cinq minutes, signée. C'est ce qui
      // évite un aller-retour en base sur le chemin du pic : `currentPlayerId`
      // lit la session à chaque requête personnelle (ADR-0009).
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },

    advanced: {
      // `ppfq.session_token`, à côté de `ppfq_player` — les deux seuls
      // cookies du site depuis que la porte du back-office a rejoint le compte.
      cookiePrefix: 'ppfq',
      useSecureCookies: process.env.NODE_ENV === 'production',
    },

    plugins: [
      emailOTP({
        otpLength: SIGN_IN_CODE_LENGTH,
        expiresIn: SIGN_IN_TTL_SECONDS,
        // Haché en base : un dump de `verifications` ne doit pas être une liste
        // de codes valides. Le prix est qu'on ne peut plus relire un code
        // envoyé — ce qui est exactement la propriété voulue, et ce pour quoi
        // les tests lisent la boîte mail plutôt que la table.
        storeOTP: 'hashed',
        // Trois essais par code. Au-delà, il faut en redemander un — et cette
        // demande-là repasse par la limite de fréquence.
        allowedAttempts: 3,
        /**
         * **Ce n'est pas par là que passe la demande de connexion.**
         *
         * Better Auth enveloppe ce rappel dans `runInBackgroundOrAwait`, qui
         * attrape l'exception, la journalise et répond quand même
         * `{ success: true }` : un relais absent ou en panne serait rapporté au
         * joueur comme un envoi réussi, et il attendrait un code qui n'existe
         * pas. `account.service.ts` fabrique donc le code par
         * `createVerificationOTP` et l'envoie lui-même, ce qui lui rend
         * l'échec.
         *
         * Le rappel reste branché parce que le plugin l'exige, et il envoie
         * pour de bon : un chemin futur qui l'emprunterait doit poster un
         * email, pas tomber dans le vide.
         */
        sendVerificationOTP: async ({ email, otp }) => {
          await sendSignInCode(email, otp)
        },
      }),

      magicLink({
        expiresIn: SIGN_IN_TTL_SECONDS,
        storeToken: 'hashed',
        sendMagicLink: async ({ email, token }) => {
          // L'URL de Better Auth est ignorée : la nôtre mène à une page qui
          // demande confirmation, et c'est ce qui fait qu'un scanner de liens
          // ne brûle pas le jeton.
          if (!(await sendSignInLink(email, signInLinkUrl(token)))) throw new MailNotSent()
        },
      }),

      // En dernier, comme sa documentation l'exige : c'est lui qui écrit les
      // cookies par `next/headers` quand on appelle `auth.api.*` depuis une
      // Route Handler ou une Server Action, au lieu de les rendre dans une
      // `Response` que l'appelant devrait recopier.
      nextCookies(),
    ],
  })
}
