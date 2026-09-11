import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * Le châssis commun à tous les écrans du jeu : la colonne, la barre d'en-tête,
 * la zone qui défile, le bandeau d'action du bas.
 *
 * Les écrans du handoff — l'aperçu de la journée, un niveau en cours, un niveau
 * révélé — ne partagent pas leur contenu mais partagent tout leur cadre : mêmes
 * 16 px de gouttière, même en-tête, même bandeau vert sombre en bas. Le cadre
 * est donc écrit une fois ici, et un écran n'écrit que ce qui le distingue.
 *
 * Rien dans ce fichier ne sait ce qu'est une énigme. C'est la condition pour
 * que l'écran d'archive et celui des statistiques, le jour où ils existeront,
 * s'y posent sans le modifier.
 */
export function GameShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // `h-dvh` et non `min-h-dvh` : la page entière ne défile pas, seul son
    // corps le fait (`ScrollBody`). L'en-tête et le bandeau d'essai restent
    // donc visibles quel que soit le parcours — un joueur qui lit le septième
    // club a toujours le champ de saisie sous les yeux, et n'a pas à remonter
    // pour savoir quel niveau il joue.
    <main className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden">
      {children}
    </main>
  )
}

/** La seule zone qui défile : le contenu propre à l'écran. */
export function ScrollBody({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
      {children}
    </div>
  )
}

/**
 * La barre d'en-tête : la marque, les trois boutons, puis ce que l'écran met
 * dessous — la date sur l'accueil, la barre segmentée sur un niveau.
 */
export function GameHeader({
  onStats,
  children,
}: Readonly<{
  onStats: () => void
  children?: ReactNode
}>) {
  return (
    <header className="flex shrink-0 flex-col gap-[13px] px-4 pt-[14px]">
      <div className="flex items-center justify-between gap-[10px]">
        {/* Le mot-marque ramène à la grille du jour, comme le logo de
            n'importe quel site : l'écran d'un niveau n'a pas d'autre chemin de
            retour, sa barre segmentée n'allant que d'un niveau à l'autre. */}
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-wordmark text-white">Footguessr</span>
        </Link>

        <div className="flex items-center gap-[6px]">
          {/* L'archive attend son écran (#11) : le bouton est à sa place et ne
              fait rien, plutôt que d'apparaître plus tard et de déplacer les
              deux autres. */}
          <IconButton label="Archive">
            <CalendarIcon />
          </IconButton>

          <IconButton label="Statistiques" onClick={onStats}>
            <BarsIcon />
          </IconButton>

          {/* De même pour le compte : l'identité est anonyme et en cookie
              (ADR-0003), donc il n'y a encore ni nom ni initiale à afficher. */}
          <button
            type="button"
            aria-label="Mon compte"
            className="bg-ink font-display size-[30px] shrink-0 cursor-pointer rounded-full text-[12px] font-bold text-white"
          >
            ?
          </button>
        </div>
      </div>

      {children}
    </header>
  )
}

/** La date du jour et la pastille de thème, sous la marque. */
export function GridTitle({ date, theme }: Readonly<{ date: string; theme: string }>) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-[9px]">
      <h1 className="font-display text-date text-white">{date}</h1>
      {/* Texte libre, imprimé tel que l'admin l'a tapé (CONTEXT.md) : la
          capitalisation est une mise en forme, pas une correction. */}
      <span className="font-mono text-pill text-ink rounded-full bg-white px-[11px] py-[6px] uppercase">
        {theme}
      </span>
    </div>
  )
}

/**
 * Le bandeau du bas : l'action principale de l'écran, et ce qui l'accompagne.
 *
 * Sans fond : le handoff le voile de `rgba(11,46,34,.1)`, ce qui l'assombrit
 * légèrement. Sur l'écran réel la séparation ne sert à rien — la zone est déjà
 * tenue par le bord bas de la fenêtre et par le bouton plein qui l'occupe — et
 * la bande grise coupait le vert en deux. Le jeton `--color-band` reste dans le
 * thème : le rail latéral du desktop (`1c`) est fait de la même valeur.
 */
export function ActionBand({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="flex shrink-0 flex-col gap-2 px-4 pt-[14px] pb-[18px]">{children}</div>
  )
}

export function PrimaryButton({
  label,
  onClick,
  disabled = false,
}: Readonly<{ label: string; onClick?: () => void; disabled?: boolean }>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${PRIMARY} w-full`}
    >
      {label}
    </button>
  )
}

/** Le même bouton, quand le geste est d'aller ailleurs plutôt que d'agir ici. */
export function PrimaryLink({ label, href }: Readonly<{ label: string; href: string }>) {
  return (
    <Link href={href} className={`${PRIMARY} block text-center`}>
      {label}
    </Link>
  )
}

/** Le lien de bas de bandeau : « REVENIR À LA GRILLE › », sans fond. */
export function TextLink({ label, href }: Readonly<{ label: string; href: string }>) {
  return (
    <Link href={href} className="font-mono text-cta text-ink self-start p-1 uppercase">
      {label} ›
    </Link>
  )
}

const PRIMARY =
  'bg-ink rounded-row font-display text-action cursor-pointer px-4 py-[15px] text-white disabled:opacity-50'

function IconButton({
  label,
  onClick,
  children,
}: Readonly<{ label: string; onClick?: () => void; children: ReactNode }>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="rounded-icon flex size-[30px] shrink-0 cursor-pointer items-center justify-center border-[1.5px] border-white/60 bg-white/16 text-white"
    >
      {children}
    </button>
  )
}

/** Le ballon de la marque : un cercle blanc, un pentagone à l'encre. */
function Logo() {
  return (
    <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden focusable="false">
      <circle cx="16" cy="16" r="14.5" fill="#fff" />
      <polygon points="16,8 22,12.4 19.7,19.4 12.3,19.4 10,12.4" fill="#0B2E22" />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <rect x="3" y="5" width="14" height="12" rx="2.5" />
      <line x1="3" y1="9" x2="17" y2="9" />
      <line x1="7" y1="3.2" x2="7" y2="5.6" />
      <line x1="13" y1="3.2" x2="13" y2="5.6" />
    </svg>
  )
}

function BarsIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <line x1="5" y1="16" x2="5" y2="11" />
      <line x1="10" y1="16" x2="10" y2="6" />
      <line x1="15" y1="16" x2="15" y2="9" />
    </svg>
  )
}
