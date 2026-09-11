import { flagUrl } from '@/shared/nationality'
import { revealedDecade, revealedNationality } from '@/shared/play'
import type { EnigmaPlay } from '@/shared/play'

/**
 * La carte de fin de partie : qui c'était.
 *
 * Elle ne s'affiche qu'une fois la partie terminée — trouvée ou perdue — parce
 * que le nom du footballeur est la seule chose que l'écran cache. Tout le
 * reste, le parcours en tête, est public depuis le premier rendu.
 *
 * La sous-ligne se compose de ce qui a été dévoilé, et de rien d'autre : une
 * énigme trouvée au deuxième essai n'a jamais montré la nationalité, et la
 * carte n'en profite pas pour la sortir. Elle dit ce que la partie a coûté, pas
 * ce que la base contient.
 */
export function AnswerCard({
  play,
  clubs,
}: Readonly<{ play: EnigmaPlay; clubs: number }>) {
  const solved = play.status === 'solved'
  const nationality = revealedNationality(play.hints) ?? null
  const decade = revealedDecade(play.hints) ?? null

  const line = [
    nationality?.frName,
    decade === null ? undefined : `années ${decade}`,
    `${clubs} club${clubs > 1 ? 's' : ''}`,
  ].filter((part) => part !== undefined)

  return (
    <div className="rounded-card flex gap-[12px] bg-white p-[14px]">
      <span
        className={`flex size-[38px] shrink-0 items-center justify-center rounded-full ${
          solved ? 'bg-found' : 'bg-missed-soft'
        }`}
      >
        {solved ? <CheckIcon /> : <CrossIcon />}
      </span>

      <div className="flex min-w-0 flex-col gap-[3px]">
        <span
          className={`font-mono text-overline ${solved ? 'text-found-ink' : 'text-missed'}`}
        >
          {overline(play)}
        </span>

        <span className="font-display text-answer text-ink">
          {/* Le serveur ne renvoie le nom qu'à la fin de la partie ; s'il
              manque, c'est un défaut de données et non un suspense. */}
          {play.answer ?? 'Réponse indisponible'}
        </span>

        <span className="font-mono text-meta text-ink/55 flex items-center gap-2">
          {nationality?.flagKey === undefined || nationality.flagKey === null ? null : (
            <img
              src={flagUrl(nationality.flagKey)}
              alt=""
              className="h-[14px] w-[20px] shrink-0 rounded-[3px] object-cover"
            />
          )}
          {line.join(' · ')}
        </span>
      </div>
    </div>
  )
}

function overline(play: EnigmaPlay): string {
  if (play.status === 'solved') {
    return `TROUVÉ EN ${play.triesUsed} ESSAI${play.triesUsed > 1 ? 'S' : ''} · LA RÉPONSE`
  }

  return `${play.triesUsed} ERREURS · LA RÉPONSE`
}

function CheckIcon() {
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
      <polyline points="5,10.5 8.5,14 15,6.5" />
    </svg>
  )
}

function CrossIcon() {
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
      <line x1="6" y1="6" x2="14" y2="14" />
      <line x1="14" y1="6" x2="6" y2="14" />
    </svg>
  )
}
