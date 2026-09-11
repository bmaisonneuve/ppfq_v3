import { requireAdmin } from '@/server/services/admin-auth.service'
import { ClubSearch } from '@/ui/admin/club-search'

import { searchClubsAction } from './actions'

/**
 * The way into a club: search it, open its fiche.
 *
 * A search and not a list, for the same reason the footballer screen is one:
 * the catalogue grows a club every time an import meets a new one, and the
 * admin always arrives knowing which club he came for — a duplicate he spotted
 * in a parcours, or a club showing as `Q123456`.
 */
export default async function AdminClubsPage() {
  await requireAdmin()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Curation d’un club</h1>
        <p className="text-sm text-neutral-600">
          Corriger les noms d’un club, lui donner son blason, fusionner un doublon. Un
          club est partagé : ce qui change ici change dans tous les parcours.
        </p>
      </div>
      <div className="max-w-lg">
        <ClubSearch searchClubsAction={searchClubsAction} />
      </div>
    </div>
  )
}
