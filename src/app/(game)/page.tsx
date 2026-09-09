import { SearchPreview } from './search-preview'

/**
 * Placeholder for the daily grid.
 *
 * The real page arrives with #7, and with it the daily revalidation and the
 * separate request that loads personal state after hydration. What this
 * placeholder already establishes is what the route does *not* do: it reads no
 * cookie, so it stays fully static and cacheable whole by Cloudflare
 * (docs/stack-technique.md §10) — the typeahead below does its own fetching
 * from the client, which is precisely what keeps that true.
 */
export default function GamePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">PPFQ</h1>
        <p className="text-neutral-600">
          Le quiz quotidien des parcours footballistiques. La grille du jour arrive.
        </p>
      </div>
      <SearchPreview />
    </main>
  )
}
