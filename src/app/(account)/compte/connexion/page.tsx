import Link from 'next/link'

import { ACCOUNT_LINK_TOKEN } from '@/shared/account'
import { SignInLinkForm } from '@/ui/account/sign-in-link-form'

import { confirmAction } from './actions'

/**
 * Où mène le lien magique : un bouton, et rien qui consomme.
 *
 * Le §4bis est explicite — « son callback doit être GET → page "Confirmer la
 * connexion" → POST : un préchargement ne consomme alors rien ». Les scanners
 * de liens des clients mail ouvrent les URL avant l'humain ; un callback qui
 * ouvrirait la session en GET aurait brûlé le jeton à usage unique avant le
 * clic, et sans mot de passe la personne serait bloquée.
 *
 * Donc cette page **ne lit pas le jeton autrement que pour le remettre dans un
 * champ caché**. Elle ne l'interroge pas, ne le valide pas, ne dit pas s'il est
 * bon : dire « ce lien a expiré » avant le clic redonnerait à un préchargement
 * le pouvoir d'apprendre quelque chose, et surtout obligerait à lire la table
 * des jetons sur une requête que n'importe qui déclenche.
 *
 * Elle est hors du groupe `(game)` : ce layout-là lit la grille du jour et
 * monte la progression du joueur au-dessus de ses pages, ce qui n'a rien à
 * faire sur une page de connexion visitée une fois.
 */
export default async function SignInLinkPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const raw = (await searchParams)[ACCOUNT_LINK_TOKEN]
  const token = typeof raw === 'string' ? raw : ''

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center gap-6 px-4 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-white">Confirmer la connexion</h1>
        <p className="text-body text-white/80">
          {token === ''
            ? 'Ce lien est incomplet. Demandez-en un nouveau depuis le jeu, ou préférez le code à six chiffres.'
            : 'Vous avez demandé à vous connecter à Footguessr. Confirmez pour ouvrir la session sur cet appareil.'}
        </p>
      </div>

      {token === '' ? null : (
        <div className="panel">
          <SignInLinkForm token={token} confirmAction={confirmAction} />
        </div>
      )}

      <Link href="/" className="link text-body self-start text-white/80">
        Revenir au jeu
      </Link>
    </main>
  )
}
