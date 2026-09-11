import { crestUrl } from '@/shared/club'

/**
 * Le blason d'un club, côté joueur.
 *
 * Il est arrivé sur la grille par une décision de jeu et non parce que le
 * back-office en avait : un parcours de dix lignes de texte se lit mal, et le
 * blason est ce qui rend une séquence de clubs reconnaissable d'un coup d'œil.
 * Il ne dévoile rien — le nom du club est juste à côté, et le parcours est
 * montré entier dès la première seconde (specs §3).
 *
 * `alt=""` partout, et c'est volontaire : là où le blason accompagne un nom, il
 * le répète, et un lecteur d'écran qui annonce « Juventus, image Juventus » lit
 * deux fois la même chose. Là où il est seul — la bande d'une carte — c'est la
 * bande entière qui est décorative, et le nombre de clubs est écrit dessous.
 *
 * Un `<img>` nu plutôt que `next/image` : les octets sont une vignette déjà
 * rendue, servie par notre origine à une URL adressée par son contenu et
 * cachée pour toujours (ADR-0010). Il n'y a rien à optimiser.
 */
export function ClubCrest({
  crestKey,
  className = 'size-8',
}: Readonly<{
  /** Null quand le catalogue n'a pas de blason : une image qui manque. */
  crestKey: string | null
  className?: string
}>) {
  if (crestKey === null) {
    // Le trou garde sa place plutôt que de disparaître : sans lui, une liste
    // où un seul club n'a pas de blason a une ligne désalignée, ce qui se
    // remarque plus que l'image manquante.
    return (
      <span
        aria-hidden
        className={`${className} shrink-0 rounded-full border border-dashed border-neutral-200`}
      />
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- voir la note ci-dessus.
    <img
      src={crestUrl(crestKey)}
      alt=""
      loading="lazy"
      className={`${className} shrink-0 object-contain`}
    />
  )
}
