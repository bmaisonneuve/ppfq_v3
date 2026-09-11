import type { EnigmaPlay } from '@/shared/play'

/**
 * L'état d'un niveau en un signe de 11 px, dans la barre segmentée.
 *
 * Quatre états, quatre formes — et pas quatre couleurs de la même forme : la
 * barre est petite, et un joueur qui doit comparer deux verts pour savoir
 * lequel est fini n'a pas d'information, il a une devinette.
 *
 * - trouvé : une coche verte
 * - échoué : une croix rouge
 * - en cours : un point plein à l'encre — quelque chose est engagé
 * - à jouer : un point creux — rien n'est engagé
 *
 * Décoratif : chaque icône est doublée d'un titre lisible par un lecteur
 * d'écran, parce que la forme seule ne se lit pas à voix haute.
 */
export function SegmentIcon({ play }: Readonly<{ play: EnigmaPlay | undefined }>) {
  if (play === undefined) return <Dot filled={false} label="à jouer" />

  switch (play.status) {
    case 'in_progress':
      return <Dot filled label="en cours" />
    case 'solved':
      return (
        <Glyph label="trouvé" stroke="var(--color-found)">
          <polyline points="3,7.5 6,10.5 11,4.5" />
        </Glyph>
      )
    case 'failed':
      return (
        <Glyph label="échoué" stroke="var(--color-missed)">
          <line x1="4" y1="4" x2="10" y2="10" />
          <line x1="10" y1="4" x2="4" y2="10" />
        </Glyph>
      )
  }
}

function Dot({ filled, label }: Readonly<{ filled: boolean; label: string }>) {
  return (
    <span
      title={label}
      className={`size-[9px] shrink-0 rounded-full border-2 ${
        filled ? 'bg-ink border-ink' : 'border-ink/35 bg-transparent'
      }`}
    >
      <span className="sr-only">{label}</span>
    </span>
  )
}

function Glyph({
  label,
  stroke,
  children,
}: Readonly<{ label: string; stroke: string; children: React.ReactNode }>) {
  return (
    <svg
      viewBox="0 0 14 14"
      width="11"
      height="11"
      role="img"
      aria-label={label}
      className="shrink-0"
      fill="none"
      stroke={stroke}
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}
