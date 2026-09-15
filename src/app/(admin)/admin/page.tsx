import { requireAdmin } from '@/server/services/admin-auth.service'
import { ClubSearch } from '@/ui/admin/club-search'
import { AdminFootballerSearch } from '@/ui/admin/footballer-search'

import { searchClubsAction } from './clubs/actions'

/**
 * La curation : une porte pour le footballeur, une porte pour le club.
 *
 * Two searches on one screen, because they are two ways into the same work.
 * The admin who opens a parcours to fix a passage lands on a club shown as
 * `Q123456` or on a duplicate, and goes to curate that club; the one who comes
 * to merge two clubs got their names from a parcours. Sending each to its own
 * index page made the back-office look like two tools and cost a navigation in
 * the middle of a correction.
 *
 * Neither section browses: the referential holds 382 703 footballers and the
 * club catalogue gains a row at every import, so there is nothing to list, and
 * "curé" is not a status — a dossier is opened on someone who has no passages
 * yet, which is how curation starts.
 *
 * The fiches themselves stay where they are — `/admin/footballers/[id]` and
 * `/admin/clubs/[clubId]`. What is merged here is the way in, not the work.
 */
export default async function AdminHomePage() {
  await requireAdmin()

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-white">Curation</h1>
        <p className="text-body text-white/80">
          Ouvrez le parcours d’un footballeur, ou la fiche d’un club.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-heading text-white">Un footballeur</h2>
        <p className="text-body text-white/80">
          Cherchez-le pour voir l’état de son parcours et le corriger.
        </p>
        <div className="panel max-w-lg">
          <AdminFootballerSearch />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-heading text-white">Un club</h2>
        <p className="text-body text-white/80">
          Corriger les noms d’un club, lui donner son blason, fusionner un doublon. Un
          club est partagé : ce qui change ici change dans tous les parcours.
        </p>
        <div className="panel max-w-lg">
          <ClubSearch searchClubsAction={searchClubsAction} />
        </div>
      </section>
    </div>
  )
}
