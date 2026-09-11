import { revealedFigures } from '@/shared/play'
import type { EnigmaPassage } from '@/shared/grid'
import type { HintClubLine, RevealedHint } from '@/shared/play'

import { ClubCrest } from './club-crest'

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
 */
export function ClubTable({
  passages,
  hints,
}: Readonly<{
  passages: readonly EnigmaPassage[]
  hints: readonly RevealedHint[]
}>) {
  const seasons = revealedFigures(hints, 2)
  const matches = revealedFigures(hints, 4)
  const goals = revealedFigures(hints, 5)

  const template = [
    '32px',
    'minmax(0,1fr)',
    ...(seasons === undefined ? [] : ['44px']),
    ...(matches === undefined ? [] : ['52px']),
    ...(goals === undefined ? [] : ['42px']),
  ].join(' ')

  return (
    <div className="flex flex-col gap-[6px]">
      <div
        style={{ gridTemplateColumns: template }}
        className="font-mono text-column text-ink grid items-center gap-[8px] px-[12px] pb-[2px]"
      >
        <span className="col-span-2">CLUB</span>
        {seasons === undefined ? null : <span className="text-right">SAIS.</span>}
        {matches === undefined ? null : <span className="text-right">MATCHS</span>}
        {goals === undefined ? null : <span className="text-right">BUTS</span>}
      </div>

      <ol className="flex flex-col gap-[6px]">
        {passages.map((passage, index) => (
          <li
            key={index}
            style={{ gridTemplateColumns: template }}
            className="rounded-row grid items-center gap-[8px] bg-white px-[12px] py-[10px]"
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

            <Figure lines={seasons} index={index} />
            <Figure lines={matches} index={index} />
            <Figure lines={goals} index={index} />
          </li>
        ))}
      </ol>
    </div>
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
}: Readonly<{ lines: readonly HintClubLine[] | undefined; index: number }>) {
  if (lines === undefined) return null

  const figure = lines[index]?.figure ?? null

  return (
    <span className="font-mono text-cell text-ink text-right tabular-nums">
      {figure ?? '—'}
    </span>
  )
}
