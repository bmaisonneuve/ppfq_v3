'use client'

import { ARCHIVE_OPEN_DAYS, ARCHIVE_PATH } from '@/shared/archive'
import { formatGridDate } from '@/shared/schedule'
import type { ChallengeDate } from '@/shared/schedule'

import { PrimaryButton, PrimaryLink } from './chrome'
import { useGame } from './game-provider'
import { GridMessage } from './grid-message'

/**
 * Ce qu'une journée passée dit quand elle ne se joue pas.
 *
 * Trois raisons et trois écrans, parce qu'elles n'appellent pas le même geste
 * et que les confondre est ce qui rendrait le cadenas inutile :
 *
 * - **il manque un compte.** C'est « la première raison concrète de
 *   s'inscrire » (#14), donc l'écran ne se contente pas de refuser : il ouvre la
 *   fenêtre du compte, sur place, sans quitter l'adresse où l'on voulait aller.
 *   Se connecter depuis ici ramène donc exactement ici ;
 * - **le jour n'est pas venu.** Les grilles sont programmées à l'avance, donc
 *   cette adresse-là existe déjà ; ce que l'écran ne dit pas est s'il y a une
 *   grille derrière — un compte n'y donne pas accès, et l'annoncer reviendrait
 *   à dévoiler le calendrier de programmation ;
 * - **il n'y a jamais eu de grille ce jour-là.** Un trou, la même absence que
 *   lit l'index (`docs/modele-donnees.md` §4).
 *
 * Il est monté **sous le provider**, comme l'écran des jours sans grille : ce
 * qu'il propose — ouvrir son compte — en dépend, et c'est tout l'intérêt.
 */
export type ArchiveGateReason = 'account-required' | 'not-yet' | 'no-grid'

export function ArchiveGate({
  reason,
  date,
}: Readonly<{ reason: ArchiveGateReason; date: ChallengeDate }>) {
  const { openAccount } = useGame()
  const when = formatGridDate(date)

  switch (reason) {
    case 'account-required':
      return (
        <GridMessage
          title="Un compte ouvre cette journée"
          action={<PrimaryButton label="Se connecter" onClick={openAccount} />}
        >
          Les {ARCHIVE_OPEN_DAYS} derniers jours se rejouent sans rien. Au-delà —
          {` ${when.toLowerCase()} `}en fait partie — il faut un compte, qui garde aussi
          votre série d’un appareil à l’autre. Votre progression du jour est reprise.
        </GridMessage>
      )
    case 'not-yet':
      return (
        <GridMessage
          title="Cette journée n’est pas encore arrivée"
          action={<PrimaryLink label="Voir la grille du jour" href="/" />}
        >
          L’archive ne remonte que le passé. Revenez {when.toLowerCase()}.
        </GridMessage>
      )
    case 'no-grid':
      return (
        <GridMessage
          title="Pas de grille ce jour-là"
          action={<PrimaryLink label="Choisir une autre journée" href={ARCHIVE_PATH} />}
        >
          Aucune grille n’était programmée le {when.toLowerCase()}.
        </GridMessage>
      )
  }
}
