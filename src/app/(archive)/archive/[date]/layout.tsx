import { notFound, redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { getArchiveScreen } from '@/server/services/archive.service'
import { ArchiveGate } from '@/ui/game/archive-gate'
import { GameProvider } from '@/ui/game/game-provider'

/**
 * Une journée passée : ce que ses écrans ont en commun, et la porte d'entrée.
 *
 * Le pendant de `app/(game)/layout.tsx`, à deux différences près et pas une de
 * plus — ce qui est la moitié de « la mécanique de jeu en archive est identique
 * à celle du quotidien » (specs §7) :
 *
 * - la grille est lue **par sa date**, celle du segment de route, et non par
 *   l'horloge ;
 * - le droit d'y jouer se vérifie ici. Sept jours pour tout le monde, le reste
 *   pour qui a un compte, et rien du tout pour une journée à venir
 *   (`server/domain/archive.ts`).
 *
 * Le layout et non la page, pour la raison qui vaut à côté : il ne se remonte
 * pas d'une navigation à l'autre, donc passer de l'aperçu à un niveau ne
 * redemande pas la progression et ne rejoue pas d'écran de chargement.
 *
 * Le refus est rendu **sous le provider**, comme l'écran des jours sans grille :
 * ce qu'il propose — ouvrir son compte, sans quitter cette adresse — en dépend,
 * et c'est exactement ce que « la première raison concrète de s'inscrire »
 * demande. Le vrai mur, lui, est le service : `GET` ou pas, aucune énigme ne
 * sort d'ici sans que `play.service.ts` l'ait accordé.
 */
export default async function ArchiveGridLayout({
  children,
  params,
}: Readonly<{ children: ReactNode; params: Promise<{ date: string }> }>) {
  const { date } = await params
  const screen = await getArchiveScreen(date)

  // `null` est une adresse qui ne nomme pas un jour — `/archive/hier`, un 30
  // février. Un 404 le dit ; les trois refus ci-dessous portent sur de vraies
  // journées et méritent une phrase.
  if (screen === null) notFound()

  // Aujourd'hui n'est pas de l'archive : la grille du jour a son adresse, où
  // elle compte. Une redirection plutôt qu'un écran, pour qu'il n'existe qu'un
  // seul endroit d'où on la joue — le calendrier y renvoie déjà de son côté.
  if (screen.kind === 'today') redirect('/')

  return (
    // `archiveDate` est renseignée même sans grille : une journée verrouillée
    // ou sans grille reste une journée d'archive, et c'est ce qui décide de son
    // en-tête et des statistiques qu'elle montre.
    <GameProvider grid={screen.kind === 'grid' ? screen.grid : null} archiveDate={date}>
      {screen.kind === 'grid' ? children : <ArchiveGate reason={screen.kind} date={date} />}
    </GameProvider>
  )
}
