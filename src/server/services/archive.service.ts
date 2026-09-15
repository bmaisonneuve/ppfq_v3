import 'server-only'

import { and, gte, lte } from 'drizzle-orm'

import { db } from '@/server/db/client'
import { dailyChallenges } from '@/server/db/schema'
import { gridAccess, needsAccountCheck } from '@/server/domain/archive'
import type { GridRefusal } from '@/server/domain/archive'
import {
  datesInMonth,
  monthOfDate,
  parseChallengeDate,
  parseChallengeMonth,
  shiftMonth,
  todayInParis,
} from '@/server/domain/challenge-calendar'
import { archiveReach } from '@/shared/archive'
import type { ArchiveCalendar, ArchiveDay } from '@/shared/archive'
import type { ChallengeDate, ChallengeMonth } from '@/shared/schedule'
import type { DailyGrid } from '@/shared/grid'

import { getGridOfDate } from './grid.service'
import { presentedPlayerHasAccount } from './player.service'

/**
 * L'archive : rejouer les jours passés, et la porte que sept jours laissent
 * ouverte.
 *
 * ## Pourquoi ce n'est pas `grid.service.ts`
 *
 * Celui-là est dans la liste de `test/architecture/static-game-page.test.ts` :
 * il ne lit rien qui appartienne à une requête, et c'est ce qui garde la grille
 * du jour prérendue et servie depuis un cache partagé (ADR-0008). Celui-ci lit
 * la requête à chaque fois — il faut bien savoir qui demande pour savoir
 * jusqu'où il remonte — donc les écrans d'archive sont dynamiques, et c'est le
 * bon échange : ils voient une fraction du trafic de la grille du jour, et ce
 * qu'ils rendent dépend de la personne.
 *
 * Ce qu'il **ne refait pas**, c'est la lecture d'une grille : `getGridOfDate`
 * est déjà « la grille d'une date », écrite sans horloge exprès pour ça. Une
 * grille d'archive et la grille du jour sont donc littéralement la même valeur,
 * ce qui est la moitié de « la mécanique de jeu en archive est identique à
 * celle du quotidien » (specs §7) — l'autre moitié étant que les écrans sont
 * les mêmes.
 *
 * ## Avoir un compte, et non avoir une session
 *
 * Ce qui ouvre l'archive complète est `players.auth_user_id`, la colonne que
 * pose la reprise de progression (ADR-0003) — la même définition que la porte
 * qui joue (`play.service.ts`), sans quoi l'écran montrerait un cadenas sur une
 * grille que le serveur accepte.
 *
 * Elle se lit **sans créer de joueur**, ce qu'un rendu ne peut pas faire, et
 * elle se lit **une seule fois pour tout le dépôt** :
 * `presentedPlayerHasAccount` est chez le joueur, à côté de la colonne qu'elle
 * interroge, et la porte qui joue lit la même. Deux implémentations de « a un
 * compte » seraient deux façons de répondre, et celle qui divergerait ferait
 * apparaître un cadenas sur une grille que le serveur accepte.
 *
 * ## Coupé en deux, comme `player.service.ts` et `account.service.ts`
 *
 * Les **portes** lisent la requête — la session, le cookie — et l'horloge. Tout
 * le reste reçoit ce qu'elles ont lu en argument. C'est le même échange
 * qu'ailleurs et il rapporte la même chose : un jour verrouillé, un jour
 * ouvert, un trou et une grille à venir deviennent des cas qu'un test joue
 * contre un vrai Postgres, sans contexte Next à fabriquer ni horloge à truquer.
 */

/**
 * Ce qu'un écran d'archive a besoin de savoir, en une valeur.
 *
 * Cinq issues, parce que cinq réponses différentes : la grille, le cadenas qui
 * invite à s'inscrire, le jour qui n'est pas encore venu, le jour sans grille,
 * et **aujourd'hui**. Les rassembler sous « pas de grille » ferait dire
 * « revenez demain » à quelqu'un à qui il manque un compte.
 *
 * `today` — le champ, celui de Paris — accompagne les cinq : il a servi à
 * trancher, et l'écran en a besoin après pour dater la journée et proposer ses
 * voisines, jusque sur un refus. Le rendre plutôt que de le relire est ce qui
 * garde une seule horloge dans l'affaire (ADR-0016) ; deux lectures à une
 * seconde d'écart auraient pu tomber de part et d'autre de minuit.
 *
 * `kind: 'today'` n'est pas un refus : la grille du jour existe et se joue,
 * seulement pas ici. Elle a son adresse à elle, où elle alimente la série ; la
 * rejouer sous `/archive/<aujourd'hui>` l'aurait montrée sous un en-tête qui
 * cache la série tout en la faisant avancer. L'appelant redirige.
 */
export type ArchiveScreen = { today: ChallengeDate } & (
  | { kind: 'grid'; grid: DailyGrid }
  | { kind: 'no-grid' }
  | { kind: 'today' }
  | { kind: GridRefusal }
)

/**
 * La grille d'un jour passé, pour qui la demande.
 *
 * L'ordre compte : le droit d'abord, la grille ensuite. Une grille à venir ne
 * doit pas être lue du tout — les grilles sont programmées à l'avance, donc la
 * ligne existe, et la lire avant de vérifier serait la charger en mémoire pour
 * décider de ne pas l'afficher. Le refus est la lecture qu'on ne fait pas.
 */
export async function getArchiveScreen(date: string): Promise<ArchiveScreen | null> {
  const today = todayInParis()

  // `null` est une **adresse** qui n'en est pas une : `/archive/hier`, ou un
  // 30 février, qui passe le motif et n'est pas un jour. La page en fait un
  // 404, ce qui est ce que c'est — à distinguer soigneusement des trois refus
  // ci-dessous, qui portent tous sur une journée réelle.
  const parsed = parseChallengeDate(date, today)
  if (parsed !== date) return null

  return await archiveScreenAt(date, today, await hasAccount(date, today))
}

/** La décision, sans requête et sans horloge : ce que la porte vient de lire. */
export async function archiveScreenAt(
  date: ChallengeDate,
  today: ChallengeDate,
  hasTheAccount: boolean,
): Promise<ArchiveScreen> {
  const access = gridAccess({ date, today, hasAccount: hasTheAccount })
  if (!access.granted) return { today, kind: access.refusal }
  // Le seul cas où l'accès est accordé et où cet écran-ci n'a rien à montrer :
  // la grille du jour se joue à son adresse, pas sous celle de l'archive.
  if (access.mode === 'daily') return { today, kind: 'today' }

  const grid = await getGridOfDate(date)

  return grid === null ? { today, kind: 'no-grid' } : { today, kind: 'grid', grid }
}

/**
 * Un mois de l'index, tel qu'il s'affiche : chaque jour, son thème, son verdict.
 *
 * Le mois entier et non les seuls jours programmés : les trous sont ce qu'on
 * vient lire autant que les grilles, et une liste qui les saute demanderait au
 * lecteur de compter les dates pour les retrouver.
 *
 * Les jours à venir y sont, et **sans leur thème** : `playable` est faux et le
 * thème est tu, sinon la case du lendemain annoncerait « rétro » à qui regarde
 * la veille au soir. C'est la même retenue que le refus de `getArchiveScreen`,
 * appliquée à une case de calendrier.
 */
export async function getArchiveCalendar(month?: string): Promise<ArchiveCalendar> {
  const today = todayInParis()
  // Un mois mal formé retombe sur le mois courant plutôt que de refuser : la
  // valeur vient de l'URL, où `?mois=septembre` est une faute de frappe et non
  // un incident (`server/domain/challenge-calendar.ts`).
  const asked = parseChallengeMonth(month, monthOfDate(today))

  // Un seul coup, et pour tout le mois : le droit ne dépend pas du jour, et
  // trente cases ne doivent pas faire trente lectures de `players`. La date sur
  // laquelle il se décide est la plus ancienne du mois — celle qui verrouille
  // la première.
  return await archiveCalendarAt(asked, today, await hasAccount(oldestOf(asked), today))
}

/** La décision, sans requête et sans horloge. Voir l'en-tête du fichier. */
export async function archiveCalendarAt(
  month: ChallengeMonth,
  today: ChallengeDate,
  account: boolean,
): Promise<ArchiveCalendar> {
  const currentMonth = monthOfDate(today)
  const themes = await readThemes(month)

  return {
    month,
    today,
    days: datesInMonth(month).map((date) => archiveDay(date, today, themes, account)),
    previousMonth: shiftMonth(month, -1),
    // Rien devant le mois courant : il n'y a que des grilles programmées, et
    // leur existence même est une information qu'on ne donne pas.
    nextMonth: month >= currentMonth ? null : shiftMonth(month, 1),
    hasAccount: account,
  }
}

function archiveDay(
  date: ChallengeDate,
  today: ChallengeDate,
  themes: ReadonlyMap<ChallengeDate, string>,
  account: boolean,
): ArchiveDay {
  const reach = archiveReach(date, today)
  const theme = themes.get(date)
  const access = gridAccess({ date, today, hasAccount: account })

  return {
    date,
    // Le thème d'un jour à venir ne sort pas, grille programmée ou non.
    theme: reach === 'future' || theme === undefined ? null : theme,
    reach,
    // La grille du jour n'est pas « jouable depuis l'archive » : elle a son
    // adresse à elle, et l'index y renvoie plutôt que de la rejouer ici.
    playable: access.granted && access.mode === 'archive' && theme !== undefined,
  }
}

/** Le premier jour d'un mois — la date sur laquelle le droit se décide. */
function oldestOf(month: ChallengeMonth): ChallengeDate {
  return `${month}-01`
}

/**
 * Les thèmes programmés d'un mois, par date.
 *
 * Le thème et rien d'autre : l'index nomme des journées, il ne pose pas
 * d'énigme. Aucun `challenge_items` n'est joint, donc aucun `footballer_id` ne
 * traverse cette fonction — la même retenue que `grid.service.ts`, pour la même
 * raison.
 */
async function readThemes(month: ChallengeMonth): Promise<Map<ChallengeDate, string>> {
  const days = datesInMonth(month)
  const first = days[0]
  const last = days[days.length - 1]
  if (first === undefined || last === undefined) return new Map()

  const rows = await db
    .select({ date: dailyChallenges.date, theme: dailyChallenges.theme })
    .from(dailyChallenges)
    .where(and(gte(dailyChallenges.date, first), lte(dailyChallenges.date, last)))

  return new Map(rows.map((row) => [row.date, row.theme]))
}

/**
 * Ce joueur a-t-il un compte ? — et la question n'est posée que si elle décide.
 *
 * La grille du jour et les sept jours ouverts répondent sans, donc l'écran le
 * plus fréquenté de l'archive ne lit ni session ni `players`
 * (`needsAccountCheck`).
 */
async function hasAccount(date: ChallengeDate, today: ChallengeDate): Promise<boolean> {
  return needsAccountCheck(date, today) && (await presentedPlayerHasAccount())
}
