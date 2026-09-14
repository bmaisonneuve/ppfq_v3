/**
 * Le compte, tel qu'il voyage entre le serveur et l'écran.
 *
 * S'inscrire et se connecter sont **une seule action** (specs §6) : il n'y a
 * donc ni « inscription » ni « connexion » dans ce fichier, seulement une
 * demande et une validation. Ce que le joueur tape est une adresse, puis six
 * chiffres ; ce qu'il reçoit en retour est son adresse ou rien.
 *
 * Ce qui n'y est pas est aussi net : **aucun jeton, aucun identifiant de
 * compte, aucune date d'expiration**. La session est un cookie `httpOnly` que
 * rien ici ne peut lire, et un client qui connaîtrait l'échéance en aurait une
 * seconde définition — celle qui finit par diverger de la vraie. Un compte, vu
 * du navigateur, se résume à l'adresse qu'il faut réafficher.
 */
import { z } from 'zod'

/** Les quatre portes du compte. Une définition, deux côtés. */
export const ACCOUNT_STATE_PATH = '/api/account/state'
export const ACCOUNT_REQUEST_PATH = '/api/account/request'
export const ACCOUNT_SIGN_IN_PATH = '/api/account/sign-in'
export const ACCOUNT_SIGN_OUT_PATH = '/api/account/sign-out'

/**
 * Où le lien magique tombe : une page à nous, et non le callback de Better
 * Auth.
 *
 * C'est ce qui rend possible le « GET puis confirmation explicite » que
 * réclament les specs : la page ne consomme rien, elle montre un bouton, et
 * c'est ce bouton qui poste. Un scanner de liens — SafeLinks, un antivirus mail
 * — précharge l'URL, tombe sur la page, et le jeton reste entier.
 */
export const ACCOUNT_LINK_PATH = '/compte/connexion'

/** Le nom du paramètre que porte le lien. En français, comme l'URL. */
export const ACCOUNT_LINK_TOKEN = 'jeton'

/** Six chiffres (`docs/stack-technique.md` §4bis). */
export const SIGN_IN_CODE_LENGTH = 6

/**
 * Dix minutes, en secondes — pour le code **et** pour le jeton du lien.
 *
 * La même valeur pour les deux parce que c'est la même promesse, et parce que
 * deux constantes auraient fini par valoir deux durées différentes sans que
 * personne ne l'ait décidé.
 */
export const SIGN_IN_TTL_SECONDS = 10 * 60

/** 180 jours glissants : un jeu d'habitude quotidienne ne redemande pas un email tous les quinze jours. */
export const ACCOUNT_SESSION_SECONDS = 180 * 24 * 60 * 60

/**
 * L'adresse, telle qu'elle est acceptée et telle qu'elle est **rangée**.
 *
 * La normalisation est dans le schéma et non à côté : la casse et les espaces
 * d'une saisie mobile ne doivent pas produire deux comptes, et surtout pas deux
 * clés de limite de fréquence — une adresse tapée avec une majuscule ferait
 * sinon repartir le compteur qui protège la boîte de son propriétaire.
 */
export const EmailInput = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: 'Cette adresse email n’est pas valide.' }))
  .pipe(z.string().max(254, { message: 'Cette adresse email est trop longue.' }))

/**
 * Le code, tel qu'il est accepté.
 *
 * Les espaces sont retirés avant tout : un code collé depuis un client mail
 * arrive régulièrement en « 123 456 », et refuser cette saisie-là serait
 * refuser la moitié des collages pour une raison que personne ne voit.
 */
export const SignInCodeInput = z
  .string()
  .transform((value) => value.replaceAll(/\s/gu, ''))
  .pipe(
    z.string().regex(new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`, 'u'), {
      message: 'Le code est fait de six chiffres.',
    }),
  )

/** Ce que porte une demande : une adresse, et par quel chemin on veut la suite. */
export const AccountRequestInput = z.object({
  email: EmailInput,
  /** Le code est la voie principale ; le lien est le raccourci du même appareil. */
  via: z.enum(['code', 'link']).default('code'),
})

export type AccountRequestInput = z.infer<typeof AccountRequestInput>

export const AccountSignInInput = z.object({ email: EmailInput, code: SignInCodeInput })

export type AccountSignInInput = z.infer<typeof AccountSignInInput>

/**
 * Qui est connecté, vu du navigateur : une adresse, ou personne.
 *
 * Pas d'identifiant de compte. Le client n'a rien à en faire — toutes ses
 * requêtes portent le cookie — et un identifiant qui traîne dans un état React
 * est un identifiant qui finit dans une URL.
 *
 * ## `admin` est présent ou absent, et jamais `false`
 *
 * C'est la seule chose que le navigateur apprend d'un rôle, et la forme du
 * champ est la décision. Un `admin: boolean` aurait répondu `false` à tout
 * joueur connecté, c'est-à-dire aurait appris à n'importe qui **qu'il existe un
 * rôle à viser** — exactement ce que `requireAdmin()` refuse de dire en
 * renvoyant un joueur curieux vers le formulaire de connexion plutôt que vers
 * un « vous n'êtes pas admin ». Optionnel, il ne parle qu'à ceux qui savent
 * déjà : un joueur reçoit `{ email }`, mot pour mot ce qu'il recevait avant.
 *
 * Ce qu'il sert à faire est **de dessiner un lien**, et rien d'autre. Il
 * n'ouvre aucune porte : chaque page et chaque Server Action du back-office
 * appellent `requireAdmin()`, qui relit la session côté serveur. Un curieux qui
 * se le fabriquerait dans son navigateur gagnerait un bouton qui le mène au
 * formulaire de connexion.
 */
export type AccountState = { email: string; admin?: true } | null

/**
 * Pourquoi une demande ou une connexion a été refusée.
 *
 * Cinq motifs, et aucun ne dit quoi que ce soit sur le titulaire du compte.
 * En particulier **une adresse inconnue n'en est pas un** : demander un code
 * pour une adresse qui n'a jamais joué fait exactement la même chose et répond
 * exactement la même chose, sans quoi cette porte dirait qui est inscrit.
 *
 * `not-configured` et `unavailable` sont les seules qui parlent de nous et non
 * de la demande, et c'est le même arbitrage que l'ADR-0006 : ce sont les
 * erreurs d'un exploitant, pas un renseignement pour un attaquant — personne
 * n'atteint cette porte sans savoir déjà que le jeu existe.
 *
 * `unavailable` et `mail-unavailable` se ressemblent et ne doivent surtout pas
 * fusionner : « l'email n'a pas pu être envoyé » envoie quelqu'un fouiller ses
 * indésirables, ce qui est une perte de temps quand le message n'a jamais été
 * fabriqué parce que la base ne répondait pas.
 */
export type AccountRefusal =
  /** Trop de demandes, par IP ou par adresse. */
  | 'too-many-requests'
  /** Le code ne correspond pas, a expiré, ou a déjà servi. Les trois se disent pareil. */
  | 'bad-code'
  /** L'email n'est pas parti : le relais a refusé, ou il n'y en a pas. */
  | 'mail-unavailable'
  /** Le compte n'est pas configuré sur ce déploiement. Il reste donc fermé. */
  | 'not-configured'
  /** Une panne de notre côté, et non de celui du relais. */
  | 'unavailable'

/** Ce que le serveur répond à une demande ou à une connexion. */
export type AccountOutcome =
  | { ok: true; account: AccountState }
  | { ok: false; refusal: AccountRefusal }

/**
 * Le refus, en français, une fois pour toutes.
 *
 * Les phrases sont ici plutôt que dans le composant qui les affiche
 * parce que le formulaire du jeu et celui du back-office sont deux écrans et
 * un seul vocabulaire, et parce que « le code est faux » et « le code a
 * expiré » doivent rester **la même phrase** : les distinguer dirait à qui
 * essaie des codes lesquels sont passés près.
 */
export const ACCOUNT_REFUSALS: Readonly<Record<AccountRefusal, string>> = {
  'too-many-requests': 'Trop de demandes. Réessayez dans quelques minutes.',
  'bad-code': 'Ce code n’est pas valide. Demandez-en un nouveau.',
  'mail-unavailable': 'L’email n’a pas pu être envoyé. Réessayez dans un instant.',
  'not-configured': 'La connexion par email n’est pas configurée sur ce déploiement.',
  'unavailable': 'La connexion n’a pas pu aboutir. Réessayez dans un instant.',
}
