import { getArchiveCalendar } from '@/server/services/archive.service'
import { ARCHIVE_MONTH_PARAM } from '@/shared/archive'
import { ArchiveScreenView } from '@/ui/game/archive-screen'
import { GameProvider } from '@/ui/game/game-provider'

/**
 * L'index de l'archive : le calendrier des journées passées.
 *
 * ## Dynamique, et c'est l'inverse exact de la grille du jour
 *
 * La page de la grille du jour ne lit rien qui appartienne à une requête, et
 * c'est la décision d'architecture centrale du projet (ADR-0008) : elle est
 * prérendue et servie entière depuis un cache partagé, ce qui absorbe le pic de
 * minuit et rend impossible qu'un état personnel atteigne l'écran d'un autre.
 *
 * Celle-ci fait le contraire, en connaissance de cause : ce qu'elle affiche
 * dépend de qui regarde — sept jours pour tout le monde, l'archive entière pour
 * qui a un compte — donc elle est rendue à chaque requête et cachée par
 * personne. C'est tenable parce que c'est un écran de navigation : on n'y arrive
 * pas à vingt mille en cinq minutes, et une requête y coûte deux lectures.
 *
 * Le groupe de routes est à part pour cette raison. `(game)` porte un layout qui
 * lit la grille du jour et qui doit rester statique ; y glisser l'archive aurait
 * rendu dynamique tout ce qu'il y a dessous.
 *
 * ## `?mois=` porte le mois, et rien d'autre ne porte d'état
 *
 * Un mois se met en favori et se partage, et le bouton « précédent » le
 * retraverse. En français, comme l'URL et comme le `?jeton=` du lien magique.
 * Un mois mal formé retombe sur le mois courant : la valeur vient de la barre
 * d'adresse, où une faute de frappe n'est pas un incident.
 */
export default async function ArchivePage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const asked = (await searchParams)[ARCHIVE_MONTH_PARAM]
  const calendar = await getArchiveCalendar(typeof asked === 'string' ? asked : undefined)

  // Sans grille et **sans journée** : cet écran n'en montre aucune en
  // particulier, il les montre toutes. C'est le seul du jeu dans ce cas, et
  // c'est pourquoi il ne passe pas de `today` — le rail n'a alors ni date à
  // titrer ni journée voisine à proposer, et son propre calendrier porte le
  // `today` qui marque la case du jour.
  //
  // Le provider reste pour ce qu'il porte en plus : le compte, que le cadenas
  // d'une journée verrouillée ouvre sur place, et les chiffres du joueur.
  return (
    <GameProvider grid={null}>
      <ArchiveScreenView calendar={calendar} />
    </GameProvider>
  )
}
