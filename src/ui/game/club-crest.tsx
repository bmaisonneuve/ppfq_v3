import { clubInitials, crestUrl } from '@/shared/club'

/**
 * Le blason d'un club, ou ce qui en tient lieu.
 *
 * Toujours un cercle de la même taille, avec ou sans image : la bande de
 * blasons d'une carte et la colonne d'un tableau s'alignent sur le gabarit et
 * non sur le contenu, sinon un parcours dont trois clubs ont un blason et
 * quatre n'en ont pas se lit comme une ligne cassée.
 *
 * L'image sort de `/api/crests/<clé>` : le blason vit en base, adressé par le
 * SHA-256 de ses octets (ADR-0010), donc l'URL est immuable et le navigateur la
 * garde. `loading="lazy"` parce qu'un parcours peut en aligner sept et qu'aucun
 * n'est ce que le joueur lit en premier.
 */
export function ClubCrest({
  clubName,
  crestKey,
  size,
}: Readonly<{
  clubName: string
  crestKey: string | null
  /** 28 px dans la bande d'une carte, 32 px dans une ligne de tableau. */
  size: 28 | 32
}>) {
  const box = size === 28 ? 'size-[28px]' : 'size-[32px]'

  return (
    <span
      className={`bg-crest flex ${box} shrink-0 items-center justify-center overflow-hidden rounded-full`}
    >
      {crestKey === null ? (
        <span
          aria-hidden
          className={`font-mono text-crest-ink font-bold ${
            size === 28 ? 'text-[9px]' : 'text-[10px]'
          }`}
        >
          {clubInitials(clubName)}
        </span>
      ) : (
        <img
          src={crestUrl(crestKey)}
          alt=""
          loading="lazy"
          className="size-full object-contain"
        />
      )}
    </span>
  )
}
