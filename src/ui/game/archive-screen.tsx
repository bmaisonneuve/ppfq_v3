'use client'

import Link from 'next/link'

import { ARCHIVE_MONTH_PARAM, ARCHIVE_PATH, ARCHIVE_OPEN_DAYS } from '@/shared/archive'
import type { ArchiveCalendar, ArchiveDay } from '@/shared/archive'
import {
  WEEKDAY_LABELS,
  formatChallengeDate,
  formatChallengeMonth,
  weekdayIndex,
} from '@/shared/schedule'
import type { ChallengeMonth } from '@/shared/schedule'

import { ActionBand, GameHeader, ScreenColumn, ScrollBody } from './chrome'
import { DesktopRail } from './rail'
import { useGame } from './game-provider'

/**
 * L'index de l'archive : un mois de journées passées, et ce qu'on peut en
 * rejouer.
 *
 * Un **calendrier** et non une liste des jours programmés, parce que les trous
 * font partie de ce qu'on vient lire : une liste qui les sauterait demanderait
 * de compter les dates pour retrouver le mardi manquant. C'est le même parti
 * que le calendrier de programmation du back-office, à ceci près que celui-ci
 * ne nomme aucun footballeur — il annonce des journées, il ne pose pas
 * d'énigme.
 *
 * ## Le cadenas est une porte, pas un panneau
 *
 * Au-delà des sept jours ouverts, une case n'est pas grisée : elle **ouvre la
 * fenêtre du compte**, sur place. C'est la première raison concrète de
 * s'inscrire (#14), et un refus qui demande d'aller chercher soi-même le bouton
 * de connexion serait un refus qui ne convertit personne.
 *
 * Ce qu'elle montre quand même est le thème : il ne révèle rien — c'est un mot
 * libre sur la journée entière — et c'est ce qui donne envie d'ouvrir la porte.
 *
 * ## Rien devant le mois courant
 *
 * Les grilles sont programmées à l'avance, donc la base sait déjà ce qu'il y a
 * demain. Le mois suivant n'est donc pas navigable depuis le mois courant, et
 * les jours à venir arrivent sans leur thème (`archive.service.ts`) : la
 * retenue est côté serveur, et cet écran ne fait que ne pas dessiner ce qu'il
 * n'a pas reçu.
 */
export function ArchiveScreenView({ calendar }: Readonly<{ calendar: ArchiveCalendar }>) {
  const { openStats, openAccount, account } = useGame()

  return (
    <>
      <DesktopRail active={null} />

      <ScreenColumn>
        <GameHeader
          onStats={openStats}
          onAccount={openAccount}
          accountInitial={account.initial}
        >
          <div className="flex flex-col gap-[9px]">
            <h1 className="font-display text-date text-white">Archive</h1>
          </div>
        </GameHeader>

        <ScrollBody>
          <div className="flex flex-col gap-[14px]">
            <MonthBar calendar={calendar} />
            <MonthGrid calendar={calendar} />
          </div>
        </ScrollBody>

        <ActionBand>
          <p className="font-mono text-meta text-ink">
            {calendar.hasAccount
              ? 'Votre compte ouvre toute l’archive.'
              : `Les ${ARCHIVE_OPEN_DAYS} derniers jours se rejouent sans compte. Au-delà, il en faut un.`}
          </p>
          {/* Ce que l'archive ne rapporte pas, dit une fois et à l'entrée : un
              joueur qui découvre après coup que sa soirée n'a rien compté
              l'aurait appris au pire moment. */}
          <p className="font-mono text-meta text-ink/70">
            Une grille rejouée ici n’alimente ni votre série ni vos cartons pleins du
            quotidien : elle est comptée à part.
          </p>
        </ActionBand>
      </ScreenColumn>
    </>
  )
}

/** Le mois affiché, et les deux flèches qui en changent. */
function MonthBar({ calendar }: Readonly<{ calendar: ArchiveCalendar }>) {
  return (
    <div className="flex items-center justify-between gap-2">
      <MonthLink month={calendar.previousMonth} label="Mois précédent">
        ‹
      </MonthLink>

      <h2 className="font-display text-card text-white first-letter:uppercase">
        {formatChallengeMonth(calendar.month)}
      </h2>

      <MonthLink month={calendar.nextMonth} label="Mois suivant">
        ›
      </MonthLink>
    </div>
  )
}

/**
 * Une flèche de navigation, ou sa place vide.
 *
 * `month` à `null` est le mois courant : il n'y a rien devant, et laisser la
 * flèche en place — inerte — garde le titre centré au lieu de le faire sauter
 * d'un mois à l'autre.
 */
function MonthLink({
  month,
  label,
  children,
}: Readonly<{ month: ChallengeMonth | null; label: string; children: string }>) {
  const shape =
    'rounded-icon flex size-[30px] shrink-0 items-center justify-center border-[1.5px] text-white'

  if (month === null) {
    return <span aria-hidden className={`${shape} border-white/20 text-white/20`} />
  }

  return (
    <Link
      href={`${ARCHIVE_PATH}?${ARCHIVE_MONTH_PARAM}=${month}`}
      aria-label={label}
      className={`${shape} border-white/60 bg-white/16`}
    >
      {children}
    </Link>
  )
}

/** Le mois en sept colonnes, lundi d'abord, avec ses cases vides en tête. */
function MonthGrid({ calendar }: Readonly<{ calendar: ArchiveCalendar }>) {
  const first = calendar.days[0]
  const blanks = first === undefined ? 0 : weekdayIndex(first.date)

  return (
    <div className="flex flex-col gap-[7px]">
      <div className="font-mono text-column text-ink/70 grid grid-cols-7 gap-[5px]">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="text-center uppercase">
            {label}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-[5px]">
        {Array.from({ length: blanks }, (_, index) => (
          <span key={`blank-${String(index)}`} aria-hidden />
        ))}

        {calendar.days.map((day) => (
          <DaySquare key={day.date} day={day} />
        ))}
      </div>
    </div>
  )
}

/**
 * Une journée, en un carré.
 *
 * Quatre rendus pour quatre états, et chacun est un geste différent : rejouer,
 * aller à la grille du jour, se connecter, ou rien. Le quatrième — un jour sans
 * grille, ou un jour à venir — est un carré éteint plutôt qu'une case absente :
 * un mois auquel il manquerait des jours ne se lirait plus comme un mois.
 */
function DaySquare({ day }: Readonly<{ day: ArchiveDay }>) {
  const { openAccount } = useGame()
  const number = Number(day.date.slice(8, 10))
  const box =
    'rounded-card flex aspect-square flex-col items-center justify-center gap-[2px] text-center'

  if (day.reach === 'today') {
    return (
      <Link
        href="/"
        aria-label={`${formatChallengeDate(day.date)} — la grille du jour`}
        className={`${box} ring-ink bg-white ring-2`}
      >
        <DayNumber>{number}</DayNumber>
        <Marker>auj.</Marker>
      </Link>
    )
  }

  if (day.playable) {
    return (
      <Link
        href={`${ARCHIVE_PATH}/${day.date}`}
        aria-label={`${formatChallengeDate(day.date)} — rejouer`}
        className={`${box} bg-white`}
      >
        <DayNumber>{number}</DayNumber>
        <Marker>{day.theme}</Marker>
      </Link>
    )
  }

  // Une grille derrière un compte : le carré est un bouton, et il ouvre la
  // fenêtre de connexion plutôt que d'envoyer le joueur la chercher.
  if (day.reach === 'account' && day.theme !== null) {
    return (
      <button
        type="button"
        onClick={openAccount}
        aria-label={`${formatChallengeDate(day.date)} — un compte est nécessaire`}
        className={`${box} bg-white/45 cursor-pointer`}
      >
        <DayNumber>{number}</DayNumber>
        <Marker>🔒</Marker>
      </button>
    )
  }

  // Rien à faire ce jour-là : aucune grille, ou un jour qui n'est pas venu. Le
  // chiffre reste lisible — un mois auquel il manquerait des jours ne se lirait
  // plus comme un mois — et il n'y a rien de plus à annoncer que lui.
  return (
    <span className={`${box} ${day.reach === 'future' ? 'bg-white/10' : 'bg-white/20'}`}>
      <DayNumber muted>{number}</DayNumber>
    </span>
  )
}

const DayNumber = ({
  children,
  muted = false,
}: Readonly<{ children: number; muted?: boolean }>) => (
  <span className={`font-display text-card tabular-nums ${muted ? 'text-ink/40' : 'text-ink'}`}>
    {children}
  </span>
)

/** La ligne sous le chiffre : le thème, « auj. », le cadenas. Toujours courte. */
const Marker = ({ children }: Readonly<{ children: string | null }>) => (
  <span className="font-mono text-sub text-ink/60 w-full truncate px-[3px] lowercase">
    {children}
  </span>
)
