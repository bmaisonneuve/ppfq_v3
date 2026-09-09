import type { PassageFlag } from '@/shared/curation'

/**
 * The three things worth looking at on a passage, spelled out.
 *
 * All three are *reading aids*, and the wording says so — a question mark on
 * the reserve badge, "chevauchement" rather than "erreur". None of them is a
 * rejection and none of them blocks a save: the catalogue holds the row either
 * way, and the admin is the one who decides.
 */
const LABELS: Record<PassageFlag, { text: string; title: string; className: string }> = {
  'likely-reserve': {
    text: 'réserve ?',
    title:
      'Le libellé du club ressemble à une équipe réserve. Wikidata ne les distingue pas des clubs seniors, donc c’est une heuristique — elle se trompe, et rien n’est supprimé automatiquement.',
    className: 'bg-amber-100 text-amber-900',
  },
  overlap: {
    text: 'chevauchement',
    title:
      'Ce passage partage des années avec un autre. Normal pour un prêt pendant son contrat ; sinon c’est le seul cas où l’ordre du parcours est ambigu, et il se corrige en ajustant une année.',
    className: 'bg-sky-100 text-sky-900',
  },
  'missing-figures': {
    text: 'matchs / buts manquants',
    title:
      'Il manque les matchs ou les buts de championnat. Le footballeur n’est pas programmable tant qu’ils manquent : le palier correspondant serait vide.',
    className: 'bg-neutral-200 text-neutral-800',
  },
}

export function PassageFlags({ flags }: { flags: readonly PassageFlag[] }) {
  if (flags.length === 0) return null

  return (
    <ul className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <li
          key={flag}
          title={LABELS[flag].title}
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${LABELS[flag].className}`}
        >
          {LABELS[flag].text}
        </li>
      ))}
    </ul>
  )
}
