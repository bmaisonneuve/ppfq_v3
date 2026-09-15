import 'server-only'

import { archiveReach } from '@/shared/archive'
import type { ChallengeDate } from '@/shared/schedule'
import type { PlayMode } from '@/shared/play'

/**
 * Qui a le droit de jouer quelle grille, et dans quel mode — une règle pure,
 * sans base et sans Next.
 *
 * ## Le mode se déduit de la date, il ne se demande pas
 *
 * C'est la décision dont tout ce fichier découle (ADR-0016). Le client envoie
 * la date de la grille qu'il tient — il l'a lue sur la page — et **jamais** le
 * mode dans lequel il prétend la jouer. Si le mode voyageait, une grille du
 * jour jouée en se disant `archive` ne coûterait rien, et surtout une grille de
 * l'an dernier jouée en se disant `daily` reconstruirait la série que les specs
 * §7 existent pour protéger : « sinon une série de 200 jours se reconstruit en
 * une soirée ». La seule horloge est celle du serveur, et le mode en découle.
 *
 * ## Trois réponses, et la troisième est une fonctionnalité
 *
 * Refuser une grille à venir n'est pas une validation défensive : les grilles
 * sont programmées à l'avance, donc `daily_challenges` contient demain, et une
 * lecture par date sans cette règle servirait l'énigme de demain à qui tape son
 * adresse. C'est la seule fuite que ce ticket pouvait ouvrir.
 *
 * Refuser au-delà de sept jours n'est pas une validation non plus : c'est « la
 * première raison concrète de s'inscrire », donc un refus que l'écran doit
 * savoir transformer en invitation — d'où un motif nommé plutôt qu'un booléen.
 */

/** Pourquoi une grille ne se joue pas. Deux motifs, deux écrans différents. */
export type GridRefusal =
  /** Elle est programmée mais le jour n'est pas venu. Un compte n'y change rien. */
  | 'not-yet'
  /** Au-delà des sept jours ouverts : il faut un compte (specs §7). */
  | 'account-required'

/**
 * Ce qu'une date vaut pour ce joueur-ci : un mode dans lequel jouer, ou un
 * refus.
 *
 * `granted` porte la distinction plutôt que l'absence d'un champ : un appelant
 * qui lirait `access.mode` sans regarder doit se faire refuser par `tsc`, pas
 * écrire `undefined` dans une colonne qui n'a pas de défaut.
 */
export type GridAccess =
  | { granted: true; mode: PlayMode }
  | { granted: false; refusal: GridRefusal }

/**
 * Le droit de jouer une grille, et le mode dans lequel elle se joue.
 *
 * `hasAccount` et non « une session » : ce qui ouvre l'archive complète est un
 * compte **posé sur ce joueur-là** (`players.auth_user_id`), pas une session
 * ouverte quelque part. Les deux coïncident presque toujours — c'est la session
 * qui désigne le joueur — et le jour où elles divergent, c'est la colonne qui a
 * raison : elle est ce que la reprise de progression écrit.
 */
export function gridAccess(args: {
  date: ChallengeDate
  today: ChallengeDate
  hasAccount: boolean
}): GridAccess {
  switch (archiveReach(args.date, args.today)) {
    case 'future':
      return { granted: false, refusal: 'not-yet' }
    case 'today':
      return { granted: true, mode: 'daily' }
    case 'open':
      return { granted: true, mode: 'archive' }
    case 'account':
      return args.hasAccount
        ? { granted: true, mode: 'archive' }
        : { granted: false, refusal: 'account-required' }
  }
}

/**
 * Le mode d'une grille, sans se demander qui a le droit d'y jouer.
 *
 * Ce que `gridAccess` décide est « peut-il, et alors dans quoi » ; ceci ne
 * décide que le second, et sert à une seule question : **quelles statistiques
 * regarde-t-on**. Lire ses agrégats d'archive n'est pas jouer, donc un jour
 * verrouillé n'y change rien — le joueur a le droit de voir ce qu'il vaut hors
 * du quotidien même le jour où il ne peut pas rejouer le 3 janvier.
 *
 * Tout ce qui n'est pas la grille du jour est compté dans l'archive, une grille
 * à venir comprise : elle n'a par définition aucune partie à son actif, donc la
 * ligne d'archive est la réponse exacte, et lui inventer un troisième mode
 * aurait créé un agrégat que rien n'écrit.
 */
export function modeOfDate(date: ChallengeDate, today: ChallengeDate): PlayMode {
  return archiveReach(date, today) === 'today' ? 'daily' : 'archive'
}

/**
 * Faut-il savoir si ce joueur a un compte pour répondre ?
 *
 * Presque jamais : la grille du jour et les sept derniers jours se jouent sans,
 * et la grille du jour est la quasi-totalité du trafic. C'est ce qui permet au
 * chemin du pic de ne pas payer une lecture de plus sur `players` — la même
 * économie que `needsCareer` fait sur le catalogue (`server/domain/play.ts`).
 */
export function needsAccountCheck(date: ChallengeDate, today: ChallengeDate): boolean {
  return archiveReach(date, today) === 'account'
}
