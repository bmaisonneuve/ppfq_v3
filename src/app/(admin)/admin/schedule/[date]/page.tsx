import { notFound } from 'next/navigation'

import { requireAdmin } from '@/server/services/admin-auth.service'
import { getScheduleDayScreen } from '@/server/services/schedule.service'
import {
  dayState,
  formatChallengeDate,
  formatChallengeMonth,
  formatGridDate,
  scheduleDayHref,
  scheduleMonthHref,
} from '@/shared/schedule'
import type { ChallengeDate, DayState, ScheduleDayScreen } from '@/shared/schedule'
import { CalendarNavLink } from '@/ui/admin/calendar-nav-link'
import { ScheduleForm } from '@/ui/admin/schedule-form'

import { scheduleGridAction } from '../actions'

/**
 * La journée du 12 : son thème, ses trois footballeurs, et de quoi passer au 13.
 *
 * C'était une fenêtre modale au-dessus du mois, et l'argument était la distance
 * entre le doigt et le formulaire. Ce que la fenêtre ne pouvait pas faire pèse
 * plus lourd : une adresse qu'on envoie — « il manque une grille le 12 » —, un
 * rechargement qui retombe au même endroit, le bouton « précédent » du
 * navigateur qui répond, et surtout l'enchaînement des jours. Programmer une
 * semaine est le geste courant du back-office, et il repassait par le mois
 * entre chaque jour.
 *
 * Trois commandes, toutes des liens, toutes la même pièce que les mois du
 * calendrier (`ui/admin/calendar-nav-link.tsx`) : le retour au mois qui
 * contient ce jour, la veille, le lendemain. Le retour vise le **mois** et non
 * l'historique du navigateur — on arrive ici par un lien aussi souvent que par
 * une case, et « revenir » doit alors mener quelque part.
 *
 * `notFound()` pour une adresse qui ne nomme pas un jour — `/admin/schedule/
 * demain`, un 30 février —, comme l'archive le fait de son côté. Un jour réel
 * n'a pas d'autre refus : le jour sans grille *est* ce que l'admin vient
 * combler.
 */
export default async function ScheduleDayPage({
  params,
}: Readonly<{
  params: Promise<{ date: string }>
}>) {
  await requireAdmin()

  const { date } = await params
  const screen = await getScheduleDayScreen(date)

  if (screen === null) notFound()

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col items-start gap-3">
        <CalendarNavLink
          href={scheduleMonthHref(screen.month)}
          label="Retour au calendrier"
          announce={`Retour au calendrier de ${formatChallengeMonth(screen.month)}`}
          direction="previous"
        />
        {/* La ligne du jour : la date, et la veille et le lendemain poussés au
            bord opposé dès qu'il y a la place. Sur l'ordinateur les trois se
            lisent d'un seul balayage — on sait quel jour on remplit et on passe
            au suivant sans quitter la ligne du titre. Sous `lg:`, la largeur
            n'en porte pas trois : les deux voisins tombent alors sous la date,
            au-dessus de l'état, et gardent leur carré de 40 px. */}
        <div
          className="flex w-full flex-col items-start gap-3 lg:flex-row lg:items-center
            lg:justify-between lg:gap-4"
        >
          {/* La date en capitale initiale sans la réécrire : `first-letter:` fait
              ce que ferait une seconde fonction de formatage, et le nom du jour
              reste celui que tous les écrans impriment. */}
          <h1 className="text-title text-white first-letter:uppercase">
            {formatChallengeDate(screen.date)}
          </h1>

          {/* La veille et le lendemain, nommés : un chevron seul ne dit pas quel
              jour, et c'est précisément le jour qui compte quand on remplit une
              semaine. */}
          <nav className="flex flex-wrap gap-2 lg:shrink-0">
            <DayLink date={screen.previousDate} direction="previous" />
            <DayLink date={screen.nextDate} direction="next" />
          </nav>
        </div>

        <DayStatus screen={screen} />
      </header>

      {/* La clé : passer au jour d'à côté est une navigation, et un formulaire
          qui survivrait à celle-ci proposerait au 13 le thème et les trois
          footballeurs saisis pour le 12. */}
      <ScheduleForm
        key={screen.date}
        date={screen.date}
        grid={screen.grid}
        themes={screen.themes}
        scheduleAction={scheduleGridAction}
      />
    </div>
  )
}

/**
 * Ce que ce jour est, en un mot et un signe : programmé, à moitié, ou pas.
 *
 * Une pastille et non une phrase, parce que c'est la première chose qu'on vient
 * lire et qu'on la relit à chaque jour d'une semaine qu'on remplit : un état se
 * reconnaît d'un coup d'œil, une phrase se lit. C'est la pastille que les
 * autres écrans du back-office posent déjà à côté d'une ligne (`.badge-*`), et
 * les trois états sont ceux de la case du calendrier (`dayState`) — même
 * verdict, mêmes couleurs, et le même creux pour le jour sans grille.
 *
 * L'icône ne dit rien à qui ne la voit pas : le mot est écrit à côté, toujours,
 * et c'est lui qui porte l'information.
 *
 * Le jour courant prend la sienne, parce que le remplacer n'est pas une
 * correction sans conséquence : la grille est devant des joueurs, et changer le
 * footballeur d'une position emporte les parties ouvertes dessus
 * (`server/services/schedule.service.ts`).
 */
function DayStatus({ screen }: Readonly<{ screen: ScheduleDayScreen }>) {
  const status = DAY_STATUS[dayState(screen.grid)]

  return (
    <p className="flex flex-wrap items-center gap-2">
      <span className={`${status.className} inline-flex items-center gap-[5px]`}>
        <StatusIcon shape={status.icon} />
        {status.words}
      </span>
      {screen.date === screen.today ? (
        <span className="badge-info">Grille du jour</span>
      ) : null}
    </p>
  )
}

/**
 * Les trois états d'un jour, dans les mots et les couleurs du calendrier.
 *
 * « Programmée » et non « planifiée » : c'est le verbe de ce back-office, celui
 * du bouton du formulaire et celui de la base (CONTEXT.md).
 */
const DAY_STATUS: Record<DayState, { words: string; className: string; icon: IconShape }> = {
  programmed: { words: 'Programmée', className: 'badge-ok', icon: 'check' },
  incomplete: { words: 'Incomplète', className: 'badge-alert', icon: 'alert' },
  hole: { words: 'Non programmée', className: 'badge-alert', icon: 'empty' },
}

type IconShape = 'check' | 'alert' | 'empty'

/**
 * Le signe de l'état, au trait des autres icônes du dépôt.
 *
 * Le creux du jour sans grille est un cercle vide, comme la pastille creuse du
 * calendrier : la **forme** porte l'état autant que la couleur, ce qui est la
 * condition pour qu'il tienne debout sans elle.
 *
 * `aria-hidden` : le mot est à côté, et une icône annoncée deux fois est une
 * icône de trop.
 */
function StatusIcon({ shape }: Readonly<{ shape: IconShape }>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="12"
      height="12"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shape === 'check' ? <polyline points="4,11 8,15 16,5" /> : null}
      {shape === 'alert' ? (
        <>
          <line x1="10" y1="3" x2="10" y2="12" />
          <line x1="10" y1="16.5" x2="10" y2="17" />
        </>
      ) : null}
      {shape === 'empty' ? <circle cx="10" cy="10" r="6.5" /> : null}
    </svg>
  )
}

/** La veille ou le lendemain, sous la même pièce que les mois voisins. */
function DayLink({
  date,
  direction,
}: Readonly<{ date: ChallengeDate; direction: 'previous' | 'next' }>) {
  return (
    <CalendarNavLink
      href={scheduleDayHref(date)}
      label={formatGridDate(date)}
      announce={`Aller au ${formatChallengeDate(date)}`}
      direction={direction}
    />
  )
}
