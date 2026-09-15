'use client'

import { useState } from 'react'

import { formatChallengeDate } from '@/shared/schedule'
import type { ChallengeDate, ScheduleAction, SchedulingScreen } from '@/shared/schedule'
import { Modal } from '@/ui/modal'

import { MonthCalendarView } from './month-calendar'
import { ScheduleForm } from './schedule-form'

/**
 * Le calendrier, et la grille d'un jour ouverte au-dessus de lui.
 *
 * Programmer se fait **dans une fenêtre** et non dans un formulaire posé sous
 * le calendrier, pour une raison que le téléphone rend évidente et qui vaut
 * aussi sur l'ordinateur : le formulaire parle d'un jour, et le seul endroit où
 * ce jour se choisit est le calendrier. Sous le mois, il fallait redescendre
 * pour vérifier lequel on remplissait ; au-dessus, la fenêtre le titre.
 *
 * ## Le jour ouvert est un état, pas une URL
 *
 * L'URL de cet écran ne porte que le mois. Le jour qu'on édite est l'état d'une
 * fenêtre modale : il n'y a rien à partager d'un formulaire à moitié rempli, et
 * une navigation par ouverture aurait mis un aller-retour serveur entre le
 * doigt et la fenêtre — sur un téléphone, c'est la différence entre un
 * calendrier et une attente.
 *
 * `?date=` reste lu **à l'arrivée** (`openDate`), et sert d'amorce à cet état :
 * un lien peut donc ouvrir un jour précis, ce dont l'alerte hebdomadaire (#14)
 * aura besoin le jour où elle écrira « il manque une grille le 12 ». Fermer la
 * fenêtre ne réécrit pas l'URL en retour : elle amène sur un jour, elle ne le
 * suit pas.
 *
 * ## Rien n'est relu pour ouvrir un jour
 *
 * La grille de la journée vient du calendrier déjà chargé, pas d'une seconde
 * requête : le mois porte chaque jour avec sa grille ou son trou, ce qui est
 * exactement ce que le formulaire demande. C'est aussi ce qui fait qu'une
 * programmation réussie se voit sans rien fermer — `refresh()` repeint le mois,
 * et la fenêtre, qui lit dedans, se retrouve devant ce qui vient d'être écrit.
 */
export function ScheduleScreen({
  screen,
  scheduleAction,
}: Readonly<{
  screen: SchedulingScreen
  scheduleAction: ScheduleAction
}>) {
  const [openDate, setOpenDate] = useState<ChallengeDate | null>(screen.openDate)

  // Le jour tel que le mois affiché le connaît — et `null` dès qu'il ne le
  // connaît plus : changer de mois pendant qu'un jour est ouvert referme la
  // fenêtre plutôt que de la laisser sur une grille qui n'est plus à l'écran.
  const day = screen.calendar.days.find((candidate) => candidate.date === openDate) ?? null

  return (
    <>
      <MonthCalendarView
        calendar={screen.calendar}
        today={screen.today}
        previousMonth={screen.previousMonth}
        nextMonth={screen.nextMonth}
        onPickDay={setOpenDate}
      />

      <Modal
        open={day !== null}
        wide
        title={day === null ? '' : formatChallengeDate(day.date)}
        onClose={() => { setOpenDate(null) }}
      >
        {/* Monté avec la fenêtre et démonté avec elle : un formulaire qui
            survivrait à sa fermeture garderait le thème et les footballeurs du
            jour précédent, et les proposerait au suivant. La clé le redit pour
            le cas où deux jours s'ouvrent sans que la fenêtre se ferme. */}
        {day === null ? null : (
          <ScheduleForm
            key={day.date}
            date={day.date}
            grid={day.grid}
            themes={screen.themes}
            scheduleAction={scheduleAction}
          />
        )}
      </Modal>
    </>
  )
}
