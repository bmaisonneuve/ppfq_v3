import { percent } from '@/shared/stats'
import type { DistributionBar } from '@/shared/stats'

/**
 * La répartition des réussites par nombre d'essais, dessinée.
 *
 * Une pièce partagée par les deux panneaux qui la montrent : celui d'un joueur
 * sur toute son histoire (`player-stats.tsx`) et celui d'une énigme sur tous
 * ses joueurs (`enigma-stats.tsx`). C'est la même forme et elle se lit de la
 * même façon — deux copies auraient divergé au premier ajustement, et le
 * joueur les voit à deux écrans d'intervalle.
 *
 * Une barre par essai possible, creux compris : « personne ne l'a trouvée du
 * premier coup » est une information, et une barre absente ne la donne pas.
 * Leur **longueur** est relative à la plus grande (`distributionBars`), parce
 * que ce qu'on lit là-dedans est une forme et non des parts d'un total ; leur
 * **étiquette**, elle, porte la valeur, et les deux panneaux n'y mettent pas la
 * même — voir `of`.
 */
export function DistributionList({
  bars,
  of,
  /**
   * Le nombre d'essais du joueur, quand il est dans cette répartition.
   *
   * Sa barre prend alors la couleur de la réussite au lieu de l'encre : c'est
   * tout ce qui distingue « voici la forme » de « voici la forme, et vous êtes
   * là ». Absent sur la répartition d'un joueur, qui est déjà la sienne entière.
   */
  mark = null,
}: Readonly<{
  bars: readonly DistributionBar[]
  /**
   * La population dont chaque barre est une part — et alors l'étiquette est un
   * **pourcentage**. Absente, c'est le compte brut qui s'affiche.
   *
   * Les deux panneaux ne veulent pas la même chose, et c'est une question de
   * dénominateur visible. Un joueur connaît le sien : « 12 » énigmes trouvées
   * en trois essais est un chiffre à lui, qu'il compare à ses autres barres.
   * Sur une énigme, le compte ne dit rien — « 2 » ne devient une information
   * qu'avec la population, qui n'est écrite nulle part sur la barre — et il est
   * trompeur les premiers jours, où toutes les barres sont petites sans que
   * l'énigme y soit pour rien.
   */
  of?: number
  mark?: number | null
}>) {
  return (
    <ol className="flex flex-col gap-1">
      {bars.map((bar) => {
        const value = label(bar, of)
        // L'étiquette ne tient dans la barre que si la barre est assez longue.
        // En dessous, elle se pose à côté plutôt que de déborder : « 26 % »
        // écrit sur une amorce de deux pour cent est illisible des deux côtés.
        const inside = value !== null && bar.share >= 0.28

        return (
          <li
            key={bar.tries}
            aria-current={bar.tries === mark ? 'true' : undefined}
            className="text-body flex items-center gap-2"
          >
            <span className="text-muted w-3 shrink-0 tabular-nums">{bar.tries}</span>
            <span className="flex h-5 min-w-0 flex-1 items-center gap-1.5">
              <span
                // Une barre vide garde une amorce visible, sinon la ligne d'un
                // nombre d'essais jamais atteint disparaît et la forme ment.
                style={{ width: `${Math.max(bar.share * 100, 2)}%` }}
                className={`rounded-bar text-cell flex h-full shrink-0 items-center justify-end px-1.5 text-white tabular-nums ${ground(bar, bar.tries === mark)}`}
              >
                {inside ? value : null}
              </span>

              {inside || value === null ? null : (
                <span className="text-cell text-muted shrink-0 tabular-nums">{value}</span>
              )}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Ce qu'une barre annonce : une part, un compte, ou rien.
 *
 * Rien pour une barre vide, dans les deux modes : « 0 » et « 0 % » sont du
 * bruit posé sur toutes les lignes creuses d'une répartition, et l'amorce grise
 * dit déjà qu'il n'y a personne.
 */
function label(bar: DistributionBar, of: number | undefined): string | null {
  if (bar.count === 0) return null
  if (of === undefined) return String(bar.count)

  const share = percent(bar.count, of)

  return share === null ? null : `${String(share)} %`
}

/**
 * Le fond d'une barre.
 *
 * Celle du joueur reste verte même vide, et ce cas existe vraiment : la
 * réponse d'une énigme peut avoir été mise en cache une minute avant que sa
 * partie ne s'y ajoute (`app/api/game/enigma-stats/route.ts`). Une barre verte
 * sans étiquette est alors exacte — « vous êtes ici, et vous n'y êtes pas
 * encore compté » — là où la repeindre en gris aurait effacé le joueur de sa
 * propre répartition.
 */
function ground(bar: DistributionBar, marked: boolean): string {
  if (marked) return 'bg-found'

  return bar.count === 0 ? 'bg-crest' : 'bg-ink'
}
