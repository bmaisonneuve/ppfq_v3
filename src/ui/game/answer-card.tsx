import { flagUrl } from '@/shared/nationality'
import { revealedDecade, revealedNationality } from '@/shared/play'
import type { EnigmaPlay } from '@/shared/play'

import { closes } from './verdict'
import type { Verdict } from './verdict'

/**
 * La carte de fin de partie : qui c'était.
 *
 * Elle ne s'affiche qu'une fois la partie terminée — trouvée ou perdue — parce
 * que le nom du footballeur est la seule chose que l'écran cache. Tout le
 * reste, le parcours en tête, est public depuis le premier rendu.
 *
 * La sous-ligne dit le footballeur en trois mots — nationalité, décennie,
 * nombre de clubs. Une partie finie montre toute l'échelle
 * (`server/domain/reveal-ladder.ts`), donc c'est ici que ces deux paliers-là se
 * lisent, et les pastilles de l'écran s'effacent pour ne pas les redire.
 *
 * ## Elle arrive, ou elle est là
 *
 * Les deux cas existent et ne se ressemblent pas : la partie qui vient de se
 * terminer sous les yeux du joueur, et la même partie rouverte le soir. Seule
 * la première se joue — la carte se pose, la coche se trace, le nom monte sous
 * son masque, la gerbe part. Un rechargement n'a rien à fêter, et une fête qui
 * se rejoue à chaque visite n'est plus une fête.
 *
 * C'est aussi la seule chose qui distingue « trouvé du premier coup » : le
 * dessus de la carte le dit en toutes lettres, et la gerbe — lancée par
 * l'écran, au-dessus de la fenêtre entière — est près de deux fois plus
 * fournie. Aucune
 * couleur de plus, aucun écran de plus.
 */
export function AnswerCard({
  play,
  clubs,
  verdict,
}: Readonly<{
  /** La partie, une fois finie, et `undefined` tant qu'elle ne l'est pas. */
  play: EnigmaPlay | undefined
  clubs: number
  /** Le dernier essai, s'il est celui qui vient de terminer cette partie. */
  verdict: Verdict | null
}>) {
  if (play === undefined) return null

  const solved = play.status === 'solved'
  const entering = closes(verdict)

  return (
    <div
      className={`rounded-card flex gap-[12px] bg-white p-[14px] ${
        entering ? 'animate-card' : ''
      }`}
    >
      <span
        // `self-center` : la pastille se cale sur le milieu des trois lignes
        // plutôt que sur la première. Alignée en haut, elle pendait au-dessus
        // du nom, qui est la ligne la plus haute de la carte.
        className={`flex size-[38px] shrink-0 self-center items-center justify-center rounded-full ${
          solved ? 'bg-found' : 'bg-missed-soft'
        } ${entering ? 'animate-pop' : ''}`}
      >
        {solved ? <CheckIcon traced={entering} /> : <CrossIcon traced={entering} />}
      </span>

      <div className="flex min-w-0 flex-col gap-[3px]">
        <span
          className={`font-mono text-overline ${solved ? 'text-found-ink' : 'text-missed'}`}
        >
          {overline(play)}
        </span>

        {/* Le masque : deux éléments pour une ligne, parce que le nom monte
            depuis sous son propre bord. Les 2 px rendus à la marge sont la
            place des jambages — sans eux, le `g` de « Guardiola » est rogné au
            repos. */}
        <span className="-mb-[2px] block overflow-hidden pb-[2px]">
          <span className={`font-display text-answer text-ink block ${entering ? 'animate-unmask' : ''}`}>
            {/* Le serveur ne renvoie le nom qu'à la fin de la partie ; s'il
                manque, c'est un défaut de données et non un suspense. */}
            {play.answer ?? 'Réponse indisponible'}
          </span>
        </span>

        <Trace play={play} clubs={clubs} />
      </div>
    </div>
  )
}

/**
 * Le footballeur en une ligne : sa nationalité, sa décennie, son nombre de
 * clubs.
 *
 * Une partie finie montre toute l'échelle (`server/domain/reveal-ladder.ts`),
 * donc les deux paliers sont là quelle que soit la manière dont elle s'est
 * finie. Les `?? null` restent : c'est le catalogue qui peut ne pas savoir, et
 * cette ligne saute alors la partie qu'elle n'a pas plutôt que d'écrire
 * « inconnue » sur une carte de réponse.
 */
function Trace({ play, clubs }: Readonly<{ play: EnigmaPlay; clubs: number }>) {
  const nationality = revealedNationality(play.hints) ?? null
  const decade = revealedDecade(play.hints) ?? null
  const flag = nationality?.flagKey ?? null

  const line = [
    nationality?.frName,
    decade === null ? undefined : `années ${decade}`,
    `${clubs} club${clubs > 1 ? 's' : ''}`,
  ].filter((part) => part !== undefined)

  return (
    <span className="font-mono text-meta text-ink/55 flex items-center gap-2">
      {flag === null ? null : (
        <img
          src={flagUrl(flag)}
          alt=""
          className="h-[14px] w-[20px] shrink-0 rounded-[3px] object-cover"
        />
      )}
      {line.join(' · ')}
    </span>
  )
}

function overline(play: EnigmaPlay): string {
  if (play.status === 'solved') {
    // Le premier coup a sa phrase : « TROUVÉ EN 1 ESSAI » compte un essai comme
    // les autres, alors que c'est le seul résultat que le joueur racontera.
    if (play.triesUsed === 1) return 'TROUVÉ DU PREMIER COUP · LA RÉPONSE'

    return `TROUVÉ EN ${play.triesUsed} ESSAIS · LA RÉPONSE`
  }

  return `${play.triesUsed} ERREURS · LA RÉPONSE`
}

/**
 * La coche, tracée d'un trait quand la partie vient de se finir.
 *
 * `pathLength="1"` : le tracé se décrit en fractions de lui-même, donc la même
 * règle dessine la coche et les deux barres de la croix sans que personne ait à
 * mesurer un chemin.
 */
function CheckIcon({ traced }: Readonly<{ traced: boolean }>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="#fff"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <polyline
        points="5,10.5 8.5,14 15,6.5"
        pathLength={1}
        strokeDasharray={1}
        className={traced ? 'animate-trace' : ''}
      />
    </svg>
  )
}

function CrossIcon({ traced }: Readonly<{ traced: boolean }>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="17"
      height="17"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="#E4573D"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <line
        x1="6"
        y1="6"
        x2="14"
        y2="14"
        pathLength={1}
        strokeDasharray={1}
        className={traced ? 'animate-trace' : ''}
      />
      <line
        x1="14"
        y1="6"
        x2="6"
        y2="14"
        pathLength={1}
        strokeDasharray={1}
        // La seconde barre suit la première : une croix dont les deux traits
        // partent ensemble ne se lit pas comme un geste.
        style={traced ? { animationDelay: '560ms' } : undefined}
        className={traced ? 'animate-trace' : ''}
      />
    </svg>
  )
}
