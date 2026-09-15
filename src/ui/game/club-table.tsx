import { revealedFigures } from '@/shared/play'
import type { EnigmaPassage } from '@/shared/grid'
import type { HintClubLine, HintTier, RevealedHint } from '@/shared/play'

import { ClubCrest } from './club-crest'
import type { Verdict } from './verdict'

/**
 * Le parcours, en tableau : une ligne par club, et des colonnes qui
 * apparaissent au fil des erreurs.
 *
 * C'est la règle centrale du jeu rendue visible. Les colonnes chiffrées sont
 * **ajoutées** et non remplies : au départ il n'y a que des noms de clubs, et
 * chaque palier resserre la grille d'un cran (2 saisons, 4 matchs, 5 buts).
 * Le joueur voit donc le tableau se peupler, ce qui vaut mieux qu'une colonne
 * de tirets qui annoncerait dès le début tout ce qu'il ne sait pas.
 *
 * `gridTemplateColumns` est calculé et posé en style : c'est la seule valeur de
 * cet écran qui dépend de l'état, et l'écrire en classes voudrait dire nommer à
 * l'avance les huit combinaisons de colonnes possibles.
 *
 * ## Ce que le verdict ajoute
 *
 * Trois mouvements, et aucun n'invente d'information — ils désignent celle qui
 * vient d'arriver. Une colonne payée par une erreur **cascade** de haut en bas
 * plutôt que d'apparaître d'un bloc : c'est le seul moyen de faire remarquer
 * trois chiffres de 11 px sur un écran qui en porte déjà vingt. Une énigme
 * trouvée fait onduler le parcours, ligne après ligne — la récompense est le
 * parcours lui-même, pas une décoration posée par-dessus. Une partie perdue le
 * fait pâlir une fois, et rien de plus.
 */
export function ClubTable({
  passages,
  hints,
  verdict,
}: Readonly<{
  passages: readonly EnigmaPassage[]
  hints: readonly RevealedHint[]
  /** Le dernier essai, tant qu'il est un instant. Null le reste du temps. */
  verdict: Verdict | null
}>) {
  const columns = FIGURE_COLUMNS.map((column) => ({
    ...column,
    lines: revealedFigures(hints, column.tier),
  })).filter((column) => column.lines !== undefined)

  const template = ['32px', 'minmax(0,1fr)', ...columns.map((column) => column.width)].join(' ')

  const revealed = verdict?.tier ?? null

  return (
    <div className="flex flex-col gap-[6px]">
      <div
        style={{ gridTemplateColumns: template }}
        className="font-mono text-column text-ink grid items-center gap-[8px] px-[12px] pb-[2px]"
      >
        <span className="col-span-2">CLUB</span>
        {columns.map((column) => (
          <Column
            key={column.tier}
            label={column.label}
            tier={column.tier}
            revealed={revealed}
          />
        ))}
      </div>

      <ol className={`flex flex-col gap-[6px] ${verdict?.kind === 'lost' ? 'animate-dim' : ''}`}>
        {passages.map((passage, index) => (
          <li
            key={index}
            style={{
              gridTemplateColumns: template,
              // Le décalage de la ola, ligne par ligne. En style parce qu'il
              // dépend du rang : le raccourci `animation` de l'utilitaire
              // remettrait le délai à zéro, et un style en ligne passe devant.
              animationDelay: `${index * 70}ms`,
            }}
            className={`rounded-row grid items-center gap-[8px] bg-white px-[12px] py-[10px] ${
              verdict?.kind === 'solved' ? 'animate-ola' : ''
            }`}
          >
            <ClubCrest clubName={passage.clubName} crestKey={passage.crestKey} size={32} />

            <span className="font-display text-club text-ink">
              {passage.clubName}
              {/* Une annotation accolée au nom, jamais un club à part entière
                  (CONTEXT.md) : un prêt est un passage comme les autres. */}
              {passage.isLoan ? (
                <span className="font-mono text-tag text-ink bg-loan rounded-loan ml-[6px] px-[5px] py-[2px] align-[1px]">
                  PRÊT
                </span>
              ) : null}
            </span>

            {columns.map((column) => (
              <Figure
                key={column.tier}
                lines={column.lines}
                index={index}
                tier={column.tier}
                revealed={revealed}
              />
            ))}
          </li>
        ))}
      </ol>
    </div>
  )
}

/**
 * Les trois colonnes chiffrées : leur palier, leur titre, leur largeur.
 *
 * Une seule table et non trois paires éparpillées dans le JSX. Le palier
 * servait à deux choses à dix lignes d'écart — aller chercher les chiffres
 * (`revealedFigures`) et décider quelle colonne se lève — et les deux ne
 * pouvaient rester d'accord que par surveillance. Les largeurs sont celles du
 * handoff (`.design/README.md`, écran `2c`) et se lisent maintenant l'une sous
 * l'autre.
 */
const FIGURE_COLUMNS = [
  { tier: 2, label: 'SAIS.', width: '44px' },
  { tier: 4, label: 'MATCHS', width: '52px' },
  { tier: 5, label: 'BUTS', width: '42px' },
] as const satisfies readonly { tier: 2 | 4 | 5; label: string; width: string }[]

/** Un en-tête de colonne chiffrée, qui se lève avec sa colonne. */
function Column({
  label,
  tier,
  revealed,
}: Readonly<{ label: string; tier: HintTier; revealed: HintTier | null }>) {
  return (
    <span className={`text-right ${tier === revealed ? 'animate-column' : ''}`}>{label}</span>
  )
}

/**
 * Une cellule chiffrée, alignée sur le parcours par son rang.
 *
 * Le serveur rend les paliers dans l'ordre chronologique du parcours, le même
 * que celui des passages : les deux listes se lisent donc en parallèle. Un
 * `figure` nul n'est pas un zéro — c'est une donnée que le catalogue n'a pas —
 * et le tiret le dit, là où « 0 but » serait un mensonge.
 */
function Figure({
  lines,
  index,
  tier,
  revealed,
}: Readonly<{
  lines: readonly HintClubLine[] | undefined
  index: number
  tier: HintTier
  revealed: HintTier | null
}>) {
  if (lines === undefined) return null

  const figure = lines[index]?.figure ?? null
  const fresh = tier === revealed

  return (
    <span
      style={fresh ? { animationDelay: `${index * 40}ms` } : undefined}
      className={`font-mono text-cell text-ink text-right tabular-nums ${
        fresh ? 'animate-cell' : ''
      }`}
    >
      {figure ?? '—'}
    </span>
  )
}
