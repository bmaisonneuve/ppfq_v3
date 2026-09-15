/**
 * L'archive : les grilles des jours passés, et jusqu'où on les remonte sans
 * compte.
 *
 * Isomorphe et pur, comme `shared/play.ts` à côté : la même règle est lue par
 * le serveur, qui **refuse**, et par l'écran, qui **explique**. Deux lectures
 * d'une seule définition — une fenêtre de sept jours écrite deux fois aurait
 * fini par montrer un cadenas sur une grille que le serveur accepte, ce qui est
 * la pire des deux erreurs : elle ne se voit pas dans les tests du serveur.
 *
 * ## Ce qui n'est pas ici : le mode
 *
 * `daily` ou `archive` se déduit de la date et n'est **jamais** nommé par le
 * client (ADR-0016). Ce fichier sait dire à quelle distance du jour une grille
 * se trouve et ce que cette distance coûte ; c'est `server/domain/archive.ts`
 * qui en tire un mode, du côté où la date d'aujourd'hui est celle du serveur.
 */
import type { ChallengeDate, ChallengeMonth, Position } from './schedule'

/**
 * Sept jours ouverts à tous, et au-delà il faut un compte (specs §7).
 *
 * Sept **jours passés**, aujourd'hui non compris : la grille du jour n'est pas
 * de l'archive, elle est le jeu. Un joueur qui arrive un lundi remonte donc
 * jusqu'au lundi précédent inclus, ce qui est la façon dont « les sept derniers
 * jours » se lit quand on parle de jours révolus.
 *
 * C'est le premier endroit du jeu où un compte sert à quelque chose de concret,
 * et c'est pour ça que le nombre est ici, nommé, plutôt qu'écrit dans le
 * service qui refuse : l'écran qui propose de s'inscrire dit la même chose.
 */
export const ARCHIVE_OPEN_DAYS = 7

/** L'index de l'archive : le calendrier des jours passés. */
export const ARCHIVE_PATH = '/archive'

/** Le nom du paramètre de mois de l'index. En français, comme l'URL. */
export const ARCHIVE_MONTH_PARAM = 'mois'

/**
 * À quelle distance du jour une grille se trouve, et ce que ça coûte.
 *
 * Quatre réponses et non deux, parce que « pas encore » et « il faut un
 * compte » ne se disent pas du tout pareil à l'écran, et que `today` doit
 * rester distinct de `open` : la grille du jour se joue à son adresse à elle et
 * alimente la série, l'archive non.
 *
 * - `future` — une grille programmée qui n'a pas encore été jouée par
 *   personne. Elle n'est pas « verrouillée » : elle n'existe pas encore, et un
 *   compte n'y donne pas accès non plus.
 * - `today` — la grille du jour. Elle n'est pas de l'archive.
 * - `open` — dans les sept derniers jours : ouverte à tous.
 * - `account` — au-delà : il faut un compte.
 */
export type ArchiveReach = 'future' | 'today' | 'open' | 'account'

export function archiveReach(date: ChallengeDate, today: ChallengeDate): ArchiveReach {
  const days = daysSince(date, today)

  if (days < 0) return 'future'
  if (days === 0) return 'today'

  return days <= ARCHIVE_OPEN_DAYS ? 'open' : 'account'
}

/**
 * Le nombre de jours entre une grille et aujourd'hui — positif pour le passé.
 *
 * `Date.UTC` et non une soustraction de dates locales : ce sont deux dates de
 * Paris écrites en texte, et un `new Date('2026-03-29')` moins un autre
 * compterait 23 heures le jour du changement d'heure, donc zéro jour d'écart
 * là où il y en a un. UTC n'a pas de tel jour, et l'arithmétique est exacte.
 *
 * Voisin de `previousDate` dans `server/domain/challenge-calendar.ts` et
 * délibérément pas le même : celui-là nomme le jour d'avant — ce sur quoi la
 * série compte — et celui-ci mesure une distance. Il est ici plutôt que là-bas
 * parce que l'écran s'en sert aussi, et que le calendrier de Paris est
 * `server-only`.
 */
export function daysSince(date: ChallengeDate, today: ChallengeDate): number {
  return Math.round((midnightUtc(today) - midnightUtc(date)) / DAY_MS)
}

const DAY_MS = 24 * 60 * 60 * 1000

function midnightUtc(date: ChallengeDate): number {
  return Date.UTC(
    Number(date.slice(0, 4)),
    Number(date.slice(5, 7)) - 1,
    Number(date.slice(8, 10)),
  )
}

/**
 * Un jour de l'index de l'archive — une case du calendrier.
 *
 * `theme` porte le trou : `null` est le jour où rien n'a été programmé, la même
 * absence que lisent le calendrier du back-office et la route de santé
 * (`docs/modele-donnees.md` §4). Il n'y a pas de champ « il y a une grille » à
 * côté, qui serait la même chose dite deux fois.
 *
 * `playable` est le verdict entier, calculé côté serveur parce que lui seul
 * sait quel jour on est et si ce joueur a un compte : une grille, passée, et le
 * droit d'y aller. `reach` est là pour que la case sache *pourquoi* elle ne se
 * joue pas — un cadenas qui invite à s'inscrire n'est pas un jour vide.
 */
export type ArchiveDay = {
  date: ChallengeDate
  theme: string | null
  reach: ArchiveReach
  playable: boolean
}

/**
 * Le mois de l'index, tel qu'il s'affiche.
 *
 * `nextMonth` est `null` sur le mois courant, et c'est la seule borne de la
 * navigation : il n'y a rien à voir devant, et les grilles programmées à
 * l'avance ne se montrent pas — pas même leur existence, qui dirait déjà que
 * demain a une grille.
 */
export type ArchiveCalendar = {
  month: ChallengeMonth
  /** Aujourd'hui à Paris, pour que la case du jour se reconnaisse. */
  today: ChallengeDate
  days: ArchiveDay[]
  previousMonth: ChallengeMonth
  nextMonth: ChallengeMonth | null
  /** Vrai quand ce joueur a déjà un compte : le cadenas n'a plus rien à dire. */
  hasAccount: boolean
}

/**
 * Le préfixe d'URL des écrans d'une grille : rien pour le quotidien,
 * `/archive/<date>` pour une grille passée.
 *
 * C'est ce qui permet aux quatre écrans du jeu d'être les mêmes des deux côtés,
 * « la mécanique de jeu en archive est identique à celle du quotidien » (specs
 * §7). Un écran ne sait pas dans quel mode il est rendu : il sait d'où partent
 * ses liens, et c'est tout ce que la différence vaut en interface.
 */
export type GridBase = string

/** La grille du jour vit à la racine : son préfixe est vide. */
export const DAILY_BASE: GridBase = ''

export function archiveBase(date: ChallengeDate): GridBase {
  return `${ARCHIVE_PATH}/${date}`
}

/** L'aperçu d'une grille : `/` pour le quotidien, `/archive/<date>` sinon. */
export function gridHome(base: GridBase): string {
  return base === DAILY_BASE ? '/' : base
}

/** Un niveau d'une grille : `/2`, ou `/archive/<date>/2`. */
export function gridLevel(base: GridBase, position: Position): string {
  return `${base}/${position}`
}
