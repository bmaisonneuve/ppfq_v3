import type { ReactNode } from 'react'

import { distributionBars, successRatePercent } from '@/shared/stats'
import type { PlayerStats } from '@/shared/stats'

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
}: Readonly<{ stats: PlayerStats | null | undefined }>) {
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
        Vous n’avez encore joué aucune partie. Ouvrez une énigme pour commencer.
      </Empty>
    )
  }

  const rate = successRatePercent(stats)

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      {/* Ce que les specs §5 énumèrent, et la série. La meilleure série est
          stockée parce que le modèle la demande, et n'est pas affichée : elle
          n'est dans aucune des deux listes. */}
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
        <Figure label="Série" value={days(stats.serie)} />
        <Figure label="Cartons pleins" value={String(stats.perfectChallenges)} />
        <Figure label="Parties jouées" value={String(stats.playedCount)} />
      </dl>

      <Distribution stats={stats} rate={rate} />
    </div>
  )
}

/** Ce que la fenêtre dit quand il n'y a pas encore de chiffres à montrer. */
function Empty({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="px-5 py-6 text-sm text-neutral-600">{children}</p>
}

/** Un chiffre et ce qu'il compte. La valeur d'abord : c'est ce qu'on vient lire. */
function Figure({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col">
      <dt className="order-2 text-xs tracking-wide text-neutral-500 uppercase">{label}</dt>
      <dd className="order-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * La répartition des réussites par nombre d'essais.
 *
 * Une barre par essai possible, creux compris : « je ne trouve jamais du
 * premier coup » est une information, et une barre absente ne la donne pas.
 * Leur longueur est relative à la plus grande (`distributionBars`), parce que
 * ce qu'on lit là-dedans est une forme et non des parts d'un total.
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
        <h3 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Réussites par nombre d’essais
        </h3>
        {rate === null ? null : (
          <p className="text-sm text-neutral-600">
            Taux de réussite <span className="font-medium tabular-nums">{rate} %</span>
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-1">
        {distributionBars(stats).map((bar) => (
          <li key={bar.tries} className="flex items-center gap-2 text-sm">
            <span className="w-3 shrink-0 text-neutral-500 tabular-nums">{bar.tries}</span>
            <span className="flex h-5 min-w-0 flex-1 items-center">
              <span
                // Une barre vide garde une amorce visible, sinon la ligne d'un
                // nombre d'essais jamais atteint disparaît et la forme ment.
                style={{ width: `${Math.max(bar.share * 100, 2)}%` }}
                className={`flex h-full items-center justify-end rounded-sm px-1.5 text-xs font-medium tabular-nums ${
                  bar.count === 0 ? 'bg-neutral-100 text-transparent' : 'bg-neutral-800 text-white'
                }`}
              >
                {bar.count}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Français, donc zéro au singulier : « 0 jour », « 1 jour », « 2 jours ». */
const days = (count: number) => `${count} jour${count > 1 ? 's' : ''}`
