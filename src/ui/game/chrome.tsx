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
 *
 * ## Deux formats, un seul arbre
 *
 * Le téléphone et l'ordinateur (`1c` du handoff) ne sont pas deux applications :
 * c'est la même colonne, à qui l'on ajoute un rail à gauche quand l'écran est
 * large. Tout ce qui les sépare est donc écrit en `lg:` sur les mêmes éléments —
 * la gouttière s'élargit, l'en-tête du téléphone s'efface au profit du rail, le
 * bouton primaire arrête de prendre toute la largeur — et jamais en dupliquant
 * un écran. Une règle CSS est vraie dès le premier pixel peint, avant même que
 * React n'ait hydraté la page prérendue ; un `if (desktop)` ne l'est qu'après,
 * et ferait passer l'ordinateur par le format téléphone le temps d'un éclair
 * (`use-desktop.ts` dit les deux seuls endroits où il n'y a pas le choix).
 */
export function GameShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // `h-dvh` et non `min-h-dvh` : la page entière ne défile pas, seul son
    // corps le fait (`ScrollBody`). L'en-tête et le bandeau d'essai restent
    // donc visibles quel que soit le parcours — un joueur qui lit le septième
    // club a toujours le champ de saisie sous les yeux, et n'a pas à remonter
    // pour savoir quel niveau il joue.
    //
    // En `lg:`, la colonne devient une grille de deux colonnes : le rail puis
    // l'écran. La largeur est plafonnée à 1140 px et non aux 940 px de la
    // maquette — le tableau des clubs respire, sans que les lignes deviennent
    // des rubans sur un écran de 27 pouces.
    //
    // Le rail prend 320 px là où le handoff en donnait 280 : les noms de
    // niveau et leur ligne d'état y tiennent au large, et les trois lignes de
    // chiffres du bas cessent de se toucher. Le plafond monte des mêmes 40 px,
    // donc la zone de jeu garde exactement la largeur qu'elle avait.
    <main className="mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden lg:grid lg:max-w-[1140px] lg:grid-cols-[320px_minmax(0,1fr)]">
      {children}
    </main>
  )
}

/**
 * La colonne d'un écran : l'en-tête, le corps qui défile, le bandeau d'action.
 *
 * Sur le téléphone c'est tout l'écran ; en `lg:` c'est la deuxième cellule de
 * la grille, à droite du rail. La même déclaration tient dans les deux cas —
 * `flex-1` remplit la colonne en flex, et une cellule de grille est déjà
 * étirée à la hauteur de la rangée.
 *
 * `hiddenOnDesktop` sert au seul écran qui a deux versions : l'accueil, qui est
 * un sommaire sur le téléphone et qui, sur un grand écran, passe la main au
 * défi à reprendre (`home-screen.tsx`).
 */
export function ScreenColumn({
  hiddenOnDesktop = false,
  children,
}: Readonly<{ hiddenOnDesktop?: boolean; children: ReactNode }>) {
  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden ${
        hiddenOnDesktop ? 'lg:hidden' : ''
      }`}
    >
      {children}
    </div>
  )
}

/** La seule zone qui défile : le contenu propre à l'écran. */
export function ScrollBody({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // La gouttière du handoff : 16 px sur le téléphone, 22 px dans la zone
    // principale du desktop. En bas, rien — c'est le bandeau d'action qui
    // tient le bord inférieur, et son propre rembourrage suffit.
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 lg:px-[22px] lg:pt-[20px] lg:pb-0">
      {children}
    </div>
  )
}

/**
 * La marque et les trois boutons : la seule rangée que les deux formats ont en
 * commun mot pour mot.
 *
 * Elle est en haut de l'écran sur le téléphone et en haut du rail sur
 * l'ordinateur. Deux emplacements, une définition : le jour où un quatrième
 * bouton arrive, il arrive dans les deux.
 */
export function BrandRow({
  onStats,
  onAccount,
  /** L'initiale de l'adresse connectée, ou rien : `?` tant qu'on est anonyme. */
  accountInitial,
}: Readonly<{
  onStats: () => void
  onAccount: () => void
  accountInitial?: string
}>) {
  return (
    <div className="flex items-center justify-between gap-[10px]">
      {/* Le mot-marque ramène à la grille du jour, comme le logo de n'importe
          quel site : l'écran d'un niveau n'a pas d'autre chemin de retour, sa
          barre segmentée n'allant que d'un niveau à l'autre. */}
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

        {/* Le compte (#13). Sans session il n'y a ni nom ni initiale à
            montrer — l'identité est anonyme et en cookie (ADR-0003) — donc
            le point d'interrogation n'est pas un défaut : c'est l'état du
            joueur, et le bouton ouvre la fenêtre qui en change. */}
        <button
          type="button"
          aria-label={accountInitial === undefined ? 'Se connecter' : 'Mon compte'}
          onClick={onAccount}
          className="bg-ink font-display size-[30px] shrink-0 cursor-pointer rounded-full text-[12px] font-bold text-white uppercase"
        >
          {accountInitial ?? '?'}
        </button>
      </div>
    </div>
  )
}

/**
 * La barre d'en-tête du téléphone : la marque, les trois boutons, puis ce que
 * l'écran met dessous — la date sur l'accueil, la barre segmentée sur un
 * niveau.
 *
 * `lg:hidden` sans condition : sur un grand écran, la marque, la date et la
 * navigation entre niveaux sont dans le rail, et les répéter en haut de la
 * colonne les aurait mises deux fois à l'écran.
 */
export function GameHeader({
  onStats,
  onAccount,
  accountInitial,
  children,
}: Readonly<{
  onStats: () => void
  onAccount: () => void
  accountInitial?: string
  children?: ReactNode
}>) {
  return (
    <header className="flex shrink-0 flex-col gap-[13px] px-4 pt-[14px] lg:hidden">
      <BrandRow onStats={onStats} onAccount={onAccount} accountInitial={accountInitial} />
      {children}
    </header>
  )
}

/**
 * La date du jour et la pastille de thème.
 *
 * `stacked` est la version du rail : la maquette y empile la date et la
 * pastille, là où l'en-tête du téléphone les met aux deux bouts d'une ligne.
 * Même contenu, même typographie, deux arrangements — c'est exactement ce
 * qu'une prop doit porter, et un second composant aurait laissé les deux
 * dériver.
 */
export function GridTitle({
  date,
  theme,
  stacked = false,
}: Readonly<{ date: string; theme: string; stacked?: boolean }>) {
  return (
    <div
      className={
        stacked
          ? 'flex flex-col items-start gap-[9px]'
          : 'flex flex-wrap items-center justify-between gap-[9px]'
      }
    >
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
    <div className="flex shrink-0 flex-col gap-2 px-4 pt-[14px] pb-[18px] lg:gap-[9px] lg:px-[22px] lg:pt-[14px] lg:pb-[22px]">
      {children}
    </div>
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
      className={`${PRIMARY} ${PRIMARY_WIDTH}`}
    >
      {label}
    </button>
  )
}

/** Le même bouton, quand le geste est d'aller ailleurs plutôt que d'agir ici. */
export function PrimaryLink({ label, href }: Readonly<{ label: string; href: string }>) {
  return (
    <Link href={href} className={`${PRIMARY} ${PRIMARY_WIDTH} block text-center`}>
      {label}
    </Link>
  )
}

/**
 * Le lien de bas de bandeau : « REVENIR À LA GRILLE › », sans fond.
 *
 * `hiddenOnDesktop` est pour celui-là même : sur un grand écran, la grille du
 * jour est en permanence à gauche, dans le rail. Le lien n'y a plus de travail,
 * et l'accueil de l'ordinateur rouvrirait de toute façon le défi à reprendre
 * (`home-screen.tsx`) — donc « revenir à la grille » y ramènerait dans une
 * énigme, ce qui n'est pas ce qu'il promet.
 */
export function TextLink({
  label,
  href,
  hiddenOnDesktop = false,
}: Readonly<{ label: string; href: string; hiddenOnDesktop?: boolean }>) {
  return (
    <Link href={href} className={`${TEXT_ACTION} ${hiddenOnDesktop ? 'lg:hidden' : ''}`}>
      {label} ›
    </Link>
  )
}

/**
 * Le bouton du thème (`.btn`, dans `globals.css`), au rembourrage du jeu : le
 * bandeau d'action lui donne 15 px de haut là où un formulaire du back-office
 * en donne 11. Seule la hauteur est reprise ici — la forme, la police et l'état
 * désactivé viennent du thème, donc le jour où le bouton change, il change dans
 * les deux moitiés de l'application.
 */
const PRIMARY = 'btn py-[15px]'

/**
 * Pleine largeur sous le pouce, à sa propre largeur sur un grand écran : un
 * aplat sombre de 800 px de long ne se lit plus comme un bouton.
 */
const PRIMARY_WIDTH = 'w-full lg:w-auto lg:self-start lg:px-8'

const TEXT_ACTION = 'font-mono text-cta text-ink self-start p-1 uppercase'

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
