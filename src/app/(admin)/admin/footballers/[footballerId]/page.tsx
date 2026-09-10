import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAdmin } from '@/server/services/admin-auth.service'
import { getCurationDossier, listNationalities } from '@/server/services/curation.service'
import type { CurationImportTrace } from '@/shared/curation'
import { AddPassageForm } from '@/ui/admin/add-passage-form'
import { CreateClubForm } from '@/ui/admin/create-club-form'
import { NationalityForm } from '@/ui/admin/nationality-form'
import { PassageRow } from '@/ui/admin/passage-row'
import { ReimportButton } from '@/ui/admin/reimport-button'

import {
  addPassageAction,
  createClubAction,
  deletePassageAction,
  reimportCareerAction,
  searchClubsAction,
  setNationalityAction,
  updatePassageAction,
} from './actions'

/**
 * The curation dossier: everything about one footballer's parcours, on one
 * screen.
 *
 * It reads the catalogue and shows it. There is no verification status to set
 * and no "mark as done" — "curé" is the fact of having passages, and the flags
 * on each row are recomputed from the rows themselves, so fixing one makes it
 * disappear with no second write.
 *
 * The Wikipedia link sits at the top for a reason that is the whole point of
 * this screen: a parcours can be **complete and false by omission** — at least
 * 21,5 % of otherwise complete careers have a hole of two years or more — and
 * no query detects it. The only guard is the admin reading the article.
 */
export default async function CurationPage({
  params,
}: Readonly<{
  params: Promise<{ footballerId: string }>
}>) {
  await requireAdmin()

  const { footballerId } = await params
  const [dossier, nationalities] = await Promise.all([
    getCurationDossier(footballerId),
    listNationalities(),
  ])

  if (dossier === null) notFound()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Link href="/admin" className="text-sm text-neutral-600 underline underline-offset-2">
          ← Chercher un autre footballeur
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{dossier.name}</h1>
        <WikipediaLinks frUrl={dossier.wikiFrUrl} enUrl={dossier.wikiEnUrl} />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Import</h2>
        <ReimportButton qid={dossier.wikidataQid} reimportAction={reimportCareerAction} />
        <LastImport trace={dossier.lastImport} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Nationalité</h2>
        <NationalityForm
          footballerId={dossier.footballerId}
          nationality={dossier.nationality}
          nationalities={nationalities}
          setNationalityAction={setNationalityAction}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">
          Parcours{' '}
          <span className="text-sm font-normal text-neutral-500">
            {dossier.passages.length} passage{dossier.passages.length > 1 ? 's' : ''}
          </span>
        </h2>

        {dossier.passages.length === 0 ? (
          <p className="text-sm text-neutral-600">
            Aucun passage : ce footballeur n’est pas encore curé. Lancez l’import, ou
            saisissez son parcours à la main.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {dossier.passages.map((passage) => (
              <PassageRow
                key={passage.id}
                passage={passage}
                updateAction={updatePassageAction}
                deleteAction={deletePassageAction}
                searchClubsAction={searchClubsAction}
              />
            ))}
          </ul>
        )}

        <AddPassageForm
          footballerId={dossier.footballerId}
          addPassageAction={addPassageAction}
          searchClubsAction={searchClubsAction}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Club absent du catalogue</h2>
        <p className="text-sm text-neutral-600">
          Quand la source ignore un passage, elle ignore souvent le club avec. Créez-le
          ici, puis ajoutez le passage.
        </p>
        <CreateClubForm createClubAction={createClubAction} />
      </section>
    </div>
  )
}

/**
 * The link opened on every curation. It is the guard against the one defect
 * nothing else catches, so it is prominent rather than tucked away.
 */
function WikipediaLinks({ frUrl, enUrl }: Readonly<{ frUrl: string | null; enUrl: string | null }>) {
  if (frUrl === null && enUrl === null) {
    return (
      <p className="text-sm text-neutral-500">
        Aucun lien Wikipédia connu : vérifiez le parcours contre une autre source.
      </p>
    )
  }

  return (
    <p className="flex gap-3 text-sm">
      {frUrl === null ? null : (
        <a
          href={frUrl}
          target="_blank"
          rel="noreferrer"
          className="font-medium underline underline-offset-2"
        >
          Wikipédia (fr) ↗
        </a>
      )}
      {enUrl === null ? null : (
        <a href={enUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          Wikipédia (en) ↗
        </a>
      )}
      <span className="text-neutral-500">
        — un parcours peut être complet et faux : le trou ne se voit qu’ici.
      </span>
    </p>
  )
}

/**
 * What the last run left in `job_runs`. Worth showing even — especially — when
 * it failed: a refused import wrote nothing, so the catalogue says nothing
 * about it and this row is the only trace of the reason.
 */
function LastImport({ trace }: Readonly<{ trace: CurationImportTrace | null }>) {
  if (trace === null) {
    return <p className="text-sm text-neutral-500">Aucun import enregistré.</p>
  }

  const when = trace.startedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })

  return (
    <p className={`text-sm ${trace.failed ? 'text-red-700' : 'text-neutral-600'}`}>
      Dernier import : {when} — {importOutcome(trace)}
    </p>
  )
}

/** What that run came to: the reason it was refused, or what it wrote. */
function importOutcome(trace: CurationImportTrace): string {
  if (!trace.failed) return `${trace.passagesWritten ?? 0} passage(s) écrit(s)`
  if (trace.lastError === null) return 'échec'
  return `échec : ${trace.lastError}`
}
