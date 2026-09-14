import { requireAdmin } from '@/server/services/admin-auth.service'
import { AdminFootballerSearch } from '@/ui/admin/footballer-search'

/**
 * The way in: search a footballer, open his dossier.
 *
 * The screen the admin uses every day starts here because the referential is
 * the list — there is no "footballers to curate" table to browse, since curated
 * is not a status but the fact of having passages.
 */
export default async function AdminHomePage() {
  await requireAdmin()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-title text-white">Curation d’un parcours</h1>
        <p className="text-body text-white/80">
          Cherchez un footballeur pour voir l’état de son parcours et le corriger.
        </p>
      </div>
      <div className="panel max-w-md">
        <AdminFootballerSearch />
      </div>
    </div>
  )
}
