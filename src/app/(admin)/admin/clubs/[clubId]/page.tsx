import Link from 'next/link'
import { notFound } from 'next/navigation'

import { requireAdmin } from '@/server/services/admin-auth.service'
import { getClubDossier } from '@/server/services/club.service'
import type { CrestRunTrace } from '@/shared/club'
import { ClubCrestForm } from '@/ui/admin/club-crest-form'
import { ClubMergeForm } from '@/ui/admin/club-merge-form'
import { ClubNamesForm } from '@/ui/admin/club-names-form'

import {
  extractCrestAction,
  mergeClubsAction,
  removeCrestAction,
  renameClubAction,
  searchClubsAction,
  uploadCrestAction,
} from '../actions'

/**
 * The fiche of one club: its names, its crest, and the duplicate to fold into
 * it.
 *
 * It reads the catalogue and shows it — no club status, nothing stored about
 * the state of the data, exactly like the curation dossier of a footballer.
 *
 * The warning at the top is the one thing this screen has that the other does
 * not: a club is **shared**. Renaming it renames it in every parcours at once,
 * and a merge moves every footballer's passages. The page says so before it
 * offers either.
 */
export default async function ClubFichePage({
  params,
}: Readonly<{
  params: Promise<{ clubId: string }>
}>) {
  await requireAdmin()

  const { clubId } = await params
  const club = await getClubDossier(clubId)
  if (club === null) notFound()

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <Link href="/admin/clubs" className="link text-body text-white/80">
          ← Chercher un autre club
        </Link>
        <h1 className="text-title text-white">{club.frName}</h1>
        <ClubIdentity
          wikidataQid={club.wikidataQid}
          frName={club.frName}
          passageCount={club.passageCount}
        />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-heading text-white">Noms</h2>
        <div className="panel">
          <ClubNamesForm
            clubId={club.id}
            frName={club.frName}
            enName={club.enName}
            renameAction={renameClubAction}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-heading text-white">Blason</h2>
        <div className="panel flex flex-col gap-4">
          <ClubCrestForm
            clubId={club.id}
            crest={club.crest}
            hasWikidataQid={club.wikidataQid !== null}
            uploadAction={uploadCrestAction}
            extractAction={extractCrestAction}
            removeAction={removeCrestAction}
          />
          <LastCrestRun trace={club.lastCrestRun} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-heading text-white">Fusionner un doublon</h2>
        <div className="panel">
          <ClubMergeForm
            keepId={club.id}
            keepName={club.frName}
            mergeAction={mergeClubsAction}
            searchClubsAction={searchClubsAction}
          />
        </div>
      </section>
    </div>
  )
}

/**
 * What the last crest extraction for this club left in `job_runs`.
 *
 * Worth showing even — especially — when it failed: a lost download writes
 * nothing, so the club simply has no crest and this row is the only place the
 * reason survives. The same reasoning, and the same shape, as the import trace
 * on a footballer's dossier.
 */
function LastCrestRun({ trace }: Readonly<{ trace: CrestRunTrace | null }>) {
  if (trace === null) {
    return <p className="hint">Aucune recherche de blason enregistrée.</p>
  }

  const when = trace.startedAt.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })

  return (
    <p className={trace.failed ? 'status-error' : 'text-note text-muted'}>
      Dernière recherche : {when} — {crestRunOutcome(trace)}
    </p>
  )
}

function crestRunOutcome(trace: CrestRunTrace): string {
  if (!trace.failed) return `${trace.fetched ?? 0} blason(s) récupéré(s)`
  return trace.lastError === null ? 'échec' : `échec : ${trace.lastError}`
}

/**
 * Where this row came from, and how far it reaches.
 *
 * The Wikidata id is the useful half: a club that has one was created by an
 * import and can be looked up on Wikipedia; a club without one was typed in by
 * hand, which is precisely the row a duplicate is usually made of. The passage
 * count is what a merge would move, and what a rename would touch.
 */
function ClubIdentity({
  wikidataQid,
  frName,
  passageCount,
}: Readonly<{ wikidataQid: string | null; frName: string; passageCount: number }>) {
  const looksLikeAQid = /^Q\d+$/.test(frName)

  return (
    <div className="text-body flex flex-col gap-1 text-white/80">
      <p className="flex flex-wrap items-baseline gap-3">
        {wikidataQid === null ? (
          <span className="text-white/70">
            Créé à la main — pas d’identifiant Wikidata, donc pas d’extraction possible.
          </span>
        ) : (
          <a
            href={`https://www.wikidata.org/wiki/${wikidataQid}`}
            target="_blank"
            rel="noreferrer"
            className="link font-bold text-white"
          >
            {wikidataQid} ↗
          </a>
        )}
        <span className="text-white/70">
          {passageCount} passage{passageCount > 1 ? 's' : ''} dans le catalogue
        </span>
      </p>
      {looksLikeAQid ? (
        <p className="badge-alert text-note self-start normal-case">
          Ce club porte son identifiant Wikidata comme nom : la source ne le nomme dans
          aucune langue. Corrigez-le ci-dessous — c’est ce nom que le jeu affiche.
        </p>
      ) : null}
      <p className="text-white/60">
        Un club est partagé : ces corrections valent pour tous les footballeurs qui y
        sont passés.
      </p>
    </div>
  )
}
