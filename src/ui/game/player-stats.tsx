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
 * ## Il ne s'affiche pas avant d'avoir quelque chose à dire
 *
 * Deux absences, et elles ne veulent pas dire la même chose. Des statistiques
 * qu'on n'a pas encore lues sont `undefined` : afficher des zéros pendant ce
 * temps-là serait afficher quelque chose de faux. Un joueur qui n'a réellement
 * rien joué a bien des zéros, et on ne les lui montre pas non plus — « 0 % » et
 * « série : 0 » sont un reproche adressé à quelqu'un qui vient d'arriver.
 *
 * Il n'apparaît donc qu'à partir de la première partie ouverte, ce qui est
 * aussi le moment où il commence à donner une raison de revenir demain.
 */
export function PlayerStatsPanel({ stats }: Readonly<{ stats: PlayerStats | undefined }>) {
  if (stats === undefined || stats.playedCount === 0) return null

  const rate = successRatePercent(stats)

  return (
    <section
      aria-label="Vos statistiques"
      className="flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white px-4 py-3"
    >
      {/* Ce que les specs §5 énumèrent, et la série. La meilleure série est
          stockée parce que le modèle la demande, et n'est pas affichée : elle
          n'est dans aucune des deux listes. */}
      <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
        <Figure label="Série" value={days(stats.serie)} />
        <Figure label="Cartons pleins" value={String(stats.perfectChallenges)} />
        <Figure label="Parties jouées" value={String(stats.playedCount)} />
      </dl>

      <Distribution stats={stats} rate={rate} />
    </section>
  )
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
        <h2 className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
          Réussites par nombre d’essais
        </h2>
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
