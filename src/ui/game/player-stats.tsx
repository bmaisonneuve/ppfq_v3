import type { ReactNode } from 'react'

import { distributionBars, successRatePercent } from '@/shared/stats'
import type { PlayerStats } from '@/shared/stats'

import { DistributionList } from './distribution'

/**
 * Ce que le joueur a derrière lui — la série, les cartons pleins, ses chiffres.
 *
 * Présentationnel et rien d'autre : ce qu'on lui passe est déjà tout ce qu'il a
 * le droit de voir, et surtout la série arrive **déjà remise à zéro**. Ce
 * composant ne sait pas quel jour on est et ne doit pas l'apprendre : la seule
 * horloge fiable est celle du serveur (ADR-0009), et une série recalculée ici
 * serait une deuxième définition de la règle.
 *
 * ## Il ne s'affiche plus tout seul : on vient le chercher
 *
 * Les chiffres étaient posés sous la grille, donc sous les yeux de tout le
 * monde en permanence. Ils sont maintenant derrière un bouton, et cela change
 * ce que ce composant doit dire des cas vides. Un panneau qui s'affiche seul se
 * tait quand il n'a rien à dire — « 0 % » et « série : 0 » sont un reproche
 * adressé à quelqu'un qui vient d'arriver. Une fenêtre qu'on a ouverte exprès
 * ne peut pas rester blanche : la question a été posée, et « vous n'avez encore
 * rien joué » est la réponse.
 *
 * Restent trois états et non deux, et aucun ne se dit comme l'autre : pas
 * encore lues (`undefined`), impossibles à lire (`null`), lues et vides. Des
 * zéros affichés pendant l'attente seraient faux, et « elles arrivent » après
 * un échec serait une promesse qui ne tient pas.
 */
export function PlayerStatsPanel({
  stats,
  archive = false,
}: Readonly<{ stats: PlayerStats | null | undefined; archive?: boolean }>) {
  // Pas encore lues : la file des requêtes personnelles les met derrière l'état
  // de la grille (ADR-0009), donc un joueur rapide peut ouvrir la fenêtre avant
  // qu'elles n'arrivent.
  if (stats === undefined) return <Empty>Vos statistiques arrivent…</Empty>

  // Lues, et la lecture a échoué. Le jeu n'en dépend pas — les trois énigmes
  // se jouent sans — mais la fenêtre ne peut pas rester blanche.
  if (stats === null) {
    return <Empty>Vos statistiques n’ont pas pu être chargées.</Empty>
  }

  if (stats.playedCount === 0) {
    return (
      <Empty>
        {archive
          ? 'Vous n’avez encore rejoué aucune grille passée.'
          : 'Vous n’avez encore joué aucune partie. Ouvrez une énigme pour commencer.'}
      </Empty>
    )
  }

  const rate = successRatePercent(stats)

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      {/* Ce que les specs §5 énumèrent, et la série. La meilleure série est
          stockée parce que le modèle la demande, et n'est pas affichée : elle
          n'est dans aucune des deux listes. */}
      {/* L'archive n'a pas de série et n'en aura jamais : elle n'alimente pas
          les compteurs du quotidien (specs §7), donc la colonne ne reste pas à
          zéro — elle disparaît, et les deux qui restent prennent la place. Un
          « 0 jour » ici se lirait comme une série perdue, ce qui est exactement
          le contresens que compter à part existe pour éviter. */}
      <dl className={`grid gap-x-4 gap-y-3 ${archive ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {archive ? null : <Figure label="Série" value={days(stats.serie)} />}
        <Figure label="Cartons pleins" value={String(stats.perfectChallenges)} />
        <Figure label="Parties jouées" value={String(stats.playedCount)} />
      </dl>

      <Distribution stats={stats} rate={rate} />
    </div>
  )
}

/** Ce que la fenêtre dit quand il n'y a pas encore de chiffres à montrer. */
function Empty({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="text-body text-muted px-5 py-6">{children}</p>
}

/** Un chiffre et ce qu'il compte. La valeur d'abord : c'est ce qu'on vient lire. */
function Figure({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col">
      <dt className="field-label order-2">{label}</dt>
      <dd className="text-score order-1 tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * La répartition des réussites par nombre d'essais.
 *
 * Les barres elles-mêmes sont `distribution.tsx`, partagées avec le panneau
 * d'une énigme : c'est la même forme, lue de la même façon. Ce qui reste ici
 * est ce qui n'appartient qu'au joueur — son titre, et son taux.
 *
 * Le taux de réussite est posé à côté du titre et non parmi les chiffres
 * ci-dessus : c'est le même fait que cette répartition, résumé en un nombre.
 */
function Distribution({
  stats,
  rate,
}: Readonly<{ stats: PlayerStats; rate: number | null }>) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="field-label">Réussites par nombre d’essais</h3>
        {rate === null ? null : (
          <p className="text-note text-muted">
            Taux de réussite <span className="font-bold tabular-nums">{rate} %</span>
          </p>
        )}
      </div>

      <DistributionList bars={distributionBars(stats)} />
    </div>
  )
}

/** Français, donc zéro au singulier : « 0 jour », « 1 jour », « 2 jours ». */
const days = (count: number) => `${count} jour${count > 1 ? 's' : ''}`
