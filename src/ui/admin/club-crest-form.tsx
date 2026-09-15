'use client'

import { useActionState } from 'react'

import { ALLOWED_CREST_TYPES, IDLE_CLUB_ACTION, MAX_CREST_BYTES, crestUrl } from '@/shared/club'
import type { ClubAction, CrestProvenance } from '@/shared/club'

import { ActionStatus } from './action-status'

/**
 * The crest of one club: what is there, where it came from, and the three ways
 * to change it.
 *
 * The provenance is the point of the panel and not a detail. The main image of
 * a Wikipedia article is **not always a crest** — the English article of London
 * Caledonians FC answers a labelled team photograph from 1894 — and nothing in
 * the pipeline can tell the difference. Showing the source file next to the
 * image is what makes a wrong pick visible, and the upload below is the repair.
 *
 * The image is a plain `<img>` at a content-addressed URL, not `next/image`:
 * the bytes are already a thumbnail rendered by Wikimedia at a fixed width, and
 * an optimiser in front of an immutable URL would be a cache in front of a
 * cache.
 */
export function ClubCrestForm({
  clubId,
  crest,
  hasWikidataQid,
  uploadAction,
  extractAction,
  removeAction,
}: Readonly<{
  clubId: string
  crest: CrestProvenance | null
  /** No Wikidata id, no article to look an image up in: only the upload is left. */
  hasWikidataQid: boolean
  uploadAction: ClubAction
  extractAction: ClubAction
  removeAction: ClubAction
}>) {
  const [uploadState, upload, uploading] = useActionState(uploadAction, IDLE_CLUB_ACTION)
  const [extractState, extract, extracting] = useActionState(extractAction, IDLE_CLUB_ACTION)
  const [removeState, remove, removing] = useActionState(removeAction, IDLE_CLUB_ACTION)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <CrestPreview crest={crest} />
        <CrestProvenanceNote crest={crest} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form action={upload} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="clubId" value={clubId} />
          <label className="flex w-full flex-col gap-1 sm:w-auto">
            <span className="field-label">
              {crest === null ? 'Téléverser un blason' : 'Remplacer le blason'}
            </span>
            <input
              type="file"
              name="crest"
              required
              accept={ALLOWED_CREST_TYPES.join(',')}
              className="field-file w-full sm:w-80"
            />
          </label>
          <button
            type="submit"
            disabled={uploading}
            className="btn"
          >
            {uploading ? 'Envoi…' : 'Enregistrer'}
          </button>
        </form>

        {crest === null && hasWikidataQid ? (
          <form action={extract}>
            <input type="hidden" name="clubId" value={clubId} />
            <button
              type="submit"
              disabled={extracting}
              className="btn-quiet"
            >
              {extracting ? 'Recherche…' : 'Chercher sur Wikipédia'}
            </button>
          </form>
        ) : null}

        {crest === null ? null : (
          <form action={remove}>
            <input type="hidden" name="clubId" value={clubId} />
            <button
              type="submit"
              disabled={removing}
              className="btn-danger"
            >
              {removing ? 'Retrait…' : 'Retirer'}
            </button>
          </form>
        )}
      </div>

      <p className="hint">
        Images matricielles uniquement ({ALLOWED_CREST_TYPES.map((t) => t.replace('image/', '')).join(', ')}),{' '}
        {Math.round(MAX_CREST_BYTES / 1024 / 1024)} Mo au plus. L’extraction ne remplace
        jamais un blason déjà présent : pour en changer, téléversez-en un.
      </p>

      <ActionStatus state={uploadState} />
      <ActionStatus state={extractState} />
      <ActionStatus state={removeState} />
    </div>
  )
}

function CrestPreview({ crest }: Readonly<{ crest: CrestProvenance | null }>) {
  if (crest === null) {
    return (
      <div className="rounded-card border-line text-note text-crest-ink bg-crest flex size-24 shrink-0 items-center justify-center border border-dashed">
        aucun
      </div>
    )
  }

  // A plain `<img>`, not `next/image`: the bytes are already a thumbnail the
  // Wikimedia renderer produced at a fixed width, and the URL is
  // content-addressed and immutable. An optimiser in front of it would be a
  // cache in front of a cache, on an admin screen nobody measures LCP on.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={crestUrl(crest.key)}
      alt=""
      className="rounded-card border-line bg-white size-24 shrink-0 border object-contain p-1"
    />
  )
}

/**
 * Where the bytes came from. A crest with no `sourceWiki` was uploaded by hand,
 * which is also what says "this one has already been checked".
 */
function CrestProvenanceNote({ crest }: Readonly<{ crest: CrestProvenance | null }>) {
  if (crest === null) {
    return (
      <p className="text-body text-muted">
        Aucun blason. Cherchez-le sur Wikipédia, ou téléversez-en un.
      </p>
    )
  }

  return (
    <dl className="text-body grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      <dt className="field-label pt-1">Source</dt>
      <dd>
        {crest.sourceWiki === null
          ? 'téléversé à la main'
          : `Wikipédia (${crest.sourceWiki})`}
        {crest.sourceFile === null ? null : (
          <>
            {' — '}
            <span className="font-bold">{crest.sourceFile}</span>
          </>
        )}
      </dd>

      <dt className="field-label pt-1">Licence</dt>
      <dd>{crest.license ?? '—'}</dd>

      <dt className="field-label pt-1">Adresse</dt>
      <dd className="font-mono text-note text-muted break-all">
        {crest.key.slice(0, 24)}… · {Math.round(crest.byteSize / 1024)} ko
      </dd>
    </dl>
  )
}
