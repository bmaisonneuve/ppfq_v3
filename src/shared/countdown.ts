/**
 * « Nouvelle grille dans 07 h 12 » : le temps qui reste avant que la journée
 * tourne.
 *
 * Le compte à rebours vise **minuit à Paris** et non minuit chez le joueur : la
 * grille change à l'heure de Paris pour tout le monde (docs/stack-technique.md
 * §4), donc un joueur à Montréal doit lire les mêmes heures qu'un joueur à
 * Lyon. C'est aussi pourquoi ce calcul ne peut pas vivre au serveur : la page
 * de la grille est prérendue et mise en cache partagé, alors une durée calculée
 * au rendu serait servie figée à tous ceux qui arrivent ensuite. Elle est donc
 * calculée dans le navigateur, après l'hydratation.
 *
 * `server/domain/challenge-calendar.ts` répond à une autre question — *quel
 * jour sommes-nous à Paris* — et son `todayInParis` reste là-bas : il est lu
 * par les services, sous `server-only`, et rien de ce fichier-ci ne le
 * remplace.
 */

/**
 * L'heure murale parisienne d'un instant, décomposée.
 *
 * `en-CA` pour l'ordre année-mois-jour et `h23` pour que minuit se lise `00` et
 * non `24` — les deux seuls réglages dont dépend la lecture des parties.
 */
const PARIS_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

type WallClock = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

function parisWallClock(instant: Date): WallClock {
  const parts = new Map(
    PARIS_CLOCK.formatToParts(instant).map((part) => [part.type, Number(part.value)]),
  )

  return {
    year: parts.get('year') ?? 0,
    month: parts.get('month') ?? 1,
    day: parts.get('day') ?? 1,
    hour: parts.get('hour') ?? 0,
    minute: parts.get('minute') ?? 0,
    second: parts.get('second') ?? 0,
  }
}

function asUtcInstant(wall: WallClock): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
}

/** De combien Paris est en avance sur UTC à cet instant : une heure, ou deux. */
function parisOffsetMs(instant: Date): number {
  return asUtcInstant(parisWallClock(instant)) - instant.getTime()
}

/**
 * L'instant du prochain minuit parisien.
 *
 * Deux passes, et la seconde n'est pas une précaution de style : le décalage
 * change à 2 h du matin le dernier dimanche de mars et d'octobre, donc un
 * joueur qui regarde l'écran à 1 h ce dimanche-là verrait, avec le seul
 * décalage d'aujourd'hui, un compte à rebours faux d'une heure entière. La
 * seconde passe relit le décalage *au minuit visé* et pose l'instant exact.
 */
export function nextParisMidnight(now: Date): Date {
  const wall = parisWallClock(now)
  // `Date.UTC` normalise le 32 du mois : le dernier jour d'un mois n'a pas de
  // cas à part, ni le 31 décembre.
  const midnight = Date.UTC(wall.year, wall.month - 1, wall.day + 1)

  const firstGuess = new Date(midnight - parisOffsetMs(now))

  return new Date(midnight - parisOffsetMs(firstGuess))
}

export function msUntilNextGrid(now: Date): number {
  return Math.max(0, nextParisMidnight(now).getTime() - now.getTime())
}

/**
 * La durée telle que la maquette l'écrit : « 07 h 12 », deux chiffres partout.
 *
 * Tronquée à la minute et non arrondie : à 7 h 12 min 45 s il reste bien
 * 7 h 12, et un arrondi afficherait 7 h 13 — une minute qui n'existe pas.
 */
export function formatCountdown(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000)

  return `${pad(Math.floor(minutes / 60))} h ${pad(minutes % 60)}`
}

const pad = (value: number): string => String(value).padStart(2, '0')
