'use client'

import Link from 'next/link'

import {
  POSITIONS,
  WEEKDAY_LABELS,
  dayState,
  describeCalendarDay,
  enigmaAt,
  formatChallengeMonth,
  weekdayIndex,
} from '@/shared/schedule'
import type { CalendarDay, ChallengeDate, ChallengeMonth, DayState, MonthCalendar } from '@/shared/schedule'

/**
 * The month view: the holes, and what fills them.
 *
 * A hole is the absence of a `daily_challenges` row and nothing else — there is
 * no status meaning "nothing planned" — so a square with no grid is drawn as
 * one. It is the whole point of the screen: the same absence is what the weekly
 * alert (#14) and the health route (#15) will read, and seeing it a month at a
 * time is what stops a morning without a grid from arriving unannounced.
 *
 * ## Deux formats, un seul arbre
 *
 * Un mois fait sept colonnes quelle que soit la largeur de l'écran, et c'est ce
 * qui rend le téléphone difficile : à 40 px de large, une case ne peut pas
 * porter trois noms de footballeurs. Elle porte donc ce qui suffit à décider
 * d'y toucher — le quantième, et une pastille qui dit si le jour est programmé.
 * L'ordinateur, lui, garde les trois positions à l'œil, parce qu'il a la place
 * et que relire une grille sans l'ouvrir est la moitié du travail.
 *
 * Tout ce qui les sépare est écrit en `lg:` sur les mêmes éléments, comme le
 * châssis du jeu (`ui/game/chrome.tsx`) : le quantième passe d'une pastille
 * centrée à un coin de carré, le thème et les trois noms apparaissent, le fond
 * blanc quitte la grille entière pour chaque case. Aucun écran n'est dupliqué,
 * donc aucun des deux ne peut dériver de l'autre.
 *
 * ## Ce que la pastille ne dit pas, le nom accessible le dit
 *
 * Une couleur n'est pas une information pour qui ne la voit pas, et un
 * quantième seul n'est pas une date. Chaque case porte donc `aria-label` : la
 * date en toutes lettres, le thème, et les trois footballeurs à leur position
 * (`describeCalendarDay`). Il remplace le contenu de la case plutôt que de s'y
 * ajouter — sur l'ordinateur, les trois lignes lues sans leur date ni leur
 * position ne voulaient pas dire grand-chose.
 *
 * Cliquer un jour ouvre sa grille dans une fenêtre, et c'est un bouton : ce que
 * l'on ouvre est un formulaire au-dessus de l'écran, pas une autre page.
 */
export function MonthCalendarView({
  calendar,
  today,
  previousMonth,
  nextMonth,
  onPickDay,
}: Readonly<{
  calendar: MonthCalendar
  today: ChallengeDate
  previousMonth: ChallengeMonth
  nextMonth: ChallengeMonth
  onPickDay: (date: ChallengeDate) => void
}>) {
  const first = calendar.days[0]
  // The empty squares before the 1st, so the columns line up with the weekdays.
  const lead = first === undefined ? 0 : weekdayIndex(first.date)
  const gaps = calendar.days.filter((day) => day.grid === null).length

  return (
    <section className="flex flex-col gap-3">
      {/* Le mois, puis les deux mois voisins centrés dessous : la navigation
          est sous ce qu'elle fait bouger, et non poussée au bord opposé du
          titre. Le tout se lit comme l'en-tête d'un calendrier, et ne dépend
          plus de la largeur pour ne pas se disloquer. */}
      <header className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-heading text-white">
          {formatChallengeMonth(calendar.month)}{' '}
          <span className="text-body text-white/70">{gapsLabel(gaps)}</span>
        </h2>
        <nav className="flex flex-wrap justify-center gap-2">
          <MonthLink month={previousMonth} direction="previous" />
          <MonthLink month={nextMonth} direction="next" />
        </nav>
      </header>

      {/* La grille est posée sur une surface blanche sur le téléphone, et se
          disperse en cases blanches sur l'ordinateur : à 40 px, un carré blanc
          bordé par jour est un damier, pas un calendrier. */}
      <ol className="panel grid grid-cols-7 gap-1 p-2 lg:bg-transparent lg:p-0">
        {WEEKDAY_LABELS.map((label) => (
          <li key={label} className="field-label text-muted lg:text-white/70 py-1 text-center lg:px-1 lg:text-left">
            {label}
          </li>
        ))}
        {Array.from({ length: lead }, (_, index) => (
          <li key={`lead-${index}`} aria-hidden />
        ))}
        {calendar.days.map((day) => (
          <li key={day.date}>
            <DaySquare day={day} isToday={day.date === today} onPick={onPickDay} />
          </li>
        ))}
      </ol>
    </section>
  )
}

/**
 * Le mois d'à côté : un bouton, et pas une flèche posée dans une phrase.
 *
 * C'est la seule commande de l'écran en dehors des jours eux-mêmes, et elle
 * était un caractère de 14 px souligné — invisible sur le vert, et intouchable
 * au doigt. Elle prend donc la pièce que le jeu pose déjà sur le vert pour ses
 * boutons d'en-tête (`ui/game/chrome.tsx`) : un contour blanc, un voile de
 * blanc derrière, un carré d'au moins 40 px.
 *
 * Le nom du mois est écrit dedans, à toutes les largeurs : centrés sous le
 * mois courant les deux boutons ont la place, et un chevron seul ne dit ni
 * quel mois ni dans quel sens. `aria-label` le redit en phrase, parce que
 * « octobre 2026 » lu tout seul n'est pas une destination.
 */
function MonthLink({
  month,
  direction,
}: Readonly<{ month: ChallengeMonth; direction: 'previous' | 'next' }>) {
  const name = formatChallengeMonth(month)
  const previous = direction === 'previous'

  return (
    <Link
      href={monthHref(month)}
      aria-label={`Aller à ${name}`}
      title={name}
      className="rounded-icon font-display text-body focus-visible:ring-pitch flex h-10
        min-w-10 shrink-0 cursor-pointer items-center justify-center gap-2 border-[1.5px]
        border-white/60 bg-white/16 px-3 text-white hover:bg-white/25
        focus-visible:ring-2 focus-visible:outline-none"
    >
      {previous ? <ChevronIcon direction="previous" /> : null}
      {/* `aria-hidden` : le lien porte déjà son nom en entier. */}
      <span aria-hidden>{name}</span>
      {previous ? null : <ChevronIcon direction="next" />}
    </Link>
  )
}

/** Le chevron du mois d'avant ou d'après — le même trait que les autres icônes. */
function ChevronIcon({ direction }: Readonly<{ direction: 'previous' | 'next' }>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={direction === 'previous' ? '12,4 6,10 12,16' : '8,4 14,10 8,16'} />
    </svg>
  )
}

/**
 * One day. Le téléphone en lit la pastille, l'ordinateur en lit les trois
 * positions, et les deux ouvrent la même fenêtre.
 */
function DaySquare({
  day,
  isToday,
  onPick,
}: Readonly<{
  day: CalendarDay
  isToday: boolean
  onPick: (date: ChallengeDate) => void
}>) {
  const grid = day.grid
  const state = dayState(grid)

  return (
    <button
      type="button"
      onClick={() => { onPick(day.date) }}
      aria-label={describeCalendarDay(day)}
      // `date` et non `true` : c'est le jour courant d'un calendrier, et c'est
      // la valeur que la norme réserve à ça.
      aria-current={isToday ? 'date' : undefined}
      className={`rounded-field focus-visible:ring-ink flex w-full cursor-pointer flex-col items-center
        justify-center gap-1 py-2 focus-visible:ring-2 focus-visible:outline-none
        lg:rounded-card lg:bg-white lg:text-ink lg:h-28 lg:items-stretch lg:justify-start
        lg:gap-1 lg:overflow-hidden lg:border lg:p-2 ${desktopBorder(state)}`}
    >
      <span className="text-note flex w-full items-baseline justify-center gap-1 lg:justify-between">
        <span
          className={`font-display text-body flex size-8 shrink-0 items-center justify-center
            rounded-full lg:text-note lg:size-5 ${
              isToday ? 'bg-ink text-white' : 'text-ink lg:text-muted'
            }`}
        >
          {Number(day.date.slice(8, 10))}
        </span>
        {grid === null ? null : (
          <span className="text-muted hidden truncate lg:inline">{grid.theme}</span>
        )}
      </span>

      {/* Le téléphone : l'indicateur, et rien d'autre. */}
      <DayDot state={state} />

      {/* L'ordinateur : les trois positions, ou le mot qui manque.

          Des `span` et non une liste : le contenu d'un `<button>` est du
          contenu de phrase, et un `<ol>` n'en est pas. Rien n'est perdu — la
          case entière est annoncée par `describeCalendarDay`, qui nomme bien
          les trois positions. */}
      {grid === null ? (
        <span className="text-note text-alert hidden lg:inline">aucune grille</span>
      ) : (
        <span className="text-note hidden flex-col gap-0.5 text-left leading-tight lg:flex">
          {POSITIONS.map((position) => {
            const enigma = enigmaAt(grid, position)
            return (
              <span
                key={position}
                className={enigma === undefined ? 'text-alert' : 'truncate'}
              >
                {position}. {enigma?.name ?? 'vide'}
              </span>
            )
          })}
        </span>
      )}
    </button>
  )
}

/**
 * La pastille du téléphone : programmé, à moitié, ou rien.
 *
 * Pleine quand la grille est là, creuse quand elle manque — la forme porte donc
 * l'information autant que la couleur, ce qui est la condition pour qu'elle
 * tienne debout sans elle. Le vert est celui de la réussite (`found`) et non
 * celui du terrain : sur du blanc, `pitch` n'a pas le contraste d'un élément
 * graphique porteur de sens.
 *
 * `aria-hidden` : la case entière porte déjà la phrase (`describeCalendarDay`).
 */
function DayDot({ state }: Readonly<{ state: DayState }>) {
  return <span aria-hidden className={`size-2 shrink-0 rounded-full lg:hidden ${DOT[state]}`} />
}

const DOT: Record<DayState, string> = {
  programmed: 'bg-found',
  incomplete: 'bg-alert',
  hole: 'border-alert border',
}

/**
 * Le contour d'un carré, sur l'ordinateur : le jour sans grille est en
 * pointillés, parce que c'est ce que l'écran existe pour montrer. Le contour et
 * jamais l'ombre, comme partout dans le thème.
 */
function desktopBorder(state: DayState): string {
  return state === 'hole' ? 'lg:border-alert/40 lg:border-dashed' : 'lg:border-line'
}

/** "aucun trou", or how many days of the month have no grid. */
function gapsLabel(gaps: number): string {
  if (gaps === 0) return 'aucun trou'
  return `${gaps} jour${gaps > 1 ? 's' : ''} sans grille`
}

/**
 * Le seul état que l'écran garde dans son URL : le mois affiché.
 *
 * Le jour qu'on édite n'y est plus, et c'est une décision : c'est une fenêtre
 * modale, il n'y a rien à partager d'un formulaire à moitié rempli, et une
 * navigation par ouverture aurait mis un aller-retour serveur entre le doigt et
 * la fenêtre. `?date=` reste lu à l'arrivée (`SchedulingScreen.openDate`), pour
 * qu'un lien puisse amener sur un jour précis.
 */
const monthHref = (month: ChallengeMonth) => `/admin/schedule?month=${month}`
