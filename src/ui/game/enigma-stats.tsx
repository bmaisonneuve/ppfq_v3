import { betterThanPercent, enigmaRatePercent, hasEnoughPlays } from '@/shared/enigma-stats'
import { distributionBars } from '@/shared/stats'
import { essais } from '@/shared/play'
import type { EnigmaPlay } from '@/shared/play'
import type { EnigmaStats } from '@/shared/enigma-stats'

import { BarsIcon } from './chrome'
import { DistributionList } from './distribution'
import { closes } from './verdict'
import type { Verdict } from './verdict'

/**
 * Comment les autres s'en sont sortis, en bas de l'écran.
 *
 * Sous le parcours et non sous la carte réponse : la carte donne le nom, le
 * parcours est ce que le joueur vient de passer six essais à lire, et les
 * chiffres des autres sont un après-coup. Les intercaler aurait poussé le
 * tableau hors de l'écran au moment précis où la réponse invite à le relire.
 *
 * Le pendant de `player-stats.tsx` sur l'autre axe : celui-là dit ce qu'un
 * joueur a derrière lui, celui-ci dit ce qu'une énigme a fait à tout le monde.
 * Il arrive au seul moment où il ne coûte rien — la partie est finie, le nom
 * est tombé, et il ne reste plus rien à deviner sur cet écran.
 *
 * Ce qu'il apporte n'est pas le même dans les deux issues, et c'est voulu :
 * après un échec, « 12 % l'ont trouvée » console, et c'est souvent la seule
 * chose vraie qu'on puisse dire à quelqu'un qui vient de perdre ; après une
 * réussite sur la même énigme, c'est ce qui donne sa valeur au trait vert.
 *
 * ## Il se tait plutôt que de dire n'importe quoi
 *
 * Trois silences, et aucun ne se distingue des autres à l'écran : les chiffres
 * ne sont pas encore arrivés, ils n'ont pas pu être lus, ou trop peu de monde a
 * joué pour qu'ils veuillent dire quelque chose (`MIN_ENIGMA_SAMPLE`). Aucun ne
 * mérite une phrase : personne n'a ouvert ce panneau — il s'affiche seul —
 * donc rien n'a été promis et il n'y a rien à excuser. C'est l'inverse exact de
 * la fenêtre des statistiques du joueur, qu'on ouvre exprès et qui ne peut donc
 * pas rester blanche.
 */
export function EnigmaStatsPanel({
  stats,
  play,
  verdict,
}: Readonly<{
  stats: EnigmaStats | undefined
  /** La partie, une fois finie, et `undefined` tant qu'elle ne l'est pas. */
  play: EnigmaPlay | undefined
  /** Le dernier essai, s'il est celui qui vient de terminer cette partie. */
  verdict: Verdict | null
}>) {
  const rate = stats === undefined ? null : enigmaRatePercent(stats)

  if (play === undefined || stats === undefined || rate === null || !hasEnoughPlays(stats)) {
    return null
  }

  const solved = play.status === 'solved'
  const better = solved ? betterThanPercent(stats, play.triesUsed) : null

  return (
    <section
      // Après la récompense et pas pendant, comme le bouton du niveau suivant :
      // des chiffres qui se posent au milieu de la gerbe transforment la fête
      // en bilan. Le délai est dans `animate-rise`.
      className={`rounded-card flex flex-col gap-3 bg-white p-[14px] ${
        closes(verdict) ? 'animate-rise' : ''
      }`}
    >
      <h3 className="field-label flex items-center gap-2">
        <BarsIcon size={13} />
        Statistiques
      </h3>

      {/* En tête du panneau : c'est la seule ligne qui parle du joueur, et la
          seule qu'il relira. Posée en bas, en petit et en gris, elle passait
          pour une note de bas de page sur les chiffres des autres. Sur son
          fond vert, au corps du texte courant, elle se lit avant eux — et sa
          couleur est déjà celle de la réussite, partout ailleurs dans le jeu. */}
      {better === null ? null : (
        <p className="rounded-row bg-found-soft text-body text-found-ink flex items-center gap-2 px-[10px] py-[8px]">
          <MedalIcon />
          <span>
            Trouvée en <span className="font-bold">{essais(play.triesUsed)}</span> : mieux que{' '}
            <span className="font-bold tabular-nums">{better} %</span> des joueurs
          </span>
        </p>
      )}

      <p className="flex items-baseline gap-2">
        <span className="text-score tabular-nums">{rate} %</span>
        <span className="text-body text-muted">des joueurs l’ont trouvée</span>
      </p>

      <div className="flex flex-col gap-2">
        {/* Le libellé nomme le dénominateur, ce qu'un pourcentage seul ne fait
            pas. C'est le même que celui du taux juste au-dessus — les parties
            conclues — donc les barres s'additionnent jusqu'à lui, et les trois
            nombres du panneau parlent de la même population. */}
        <p className="field-label">Part des joueurs, par nombre d’essais</p>

        {/* Marquée seulement s'il a trouvé : une partie perdue n'a pas de place
            dans une répartition de réussites, et une barre désignée à tort
            dirait « vous êtes ici » d'un rang que le joueur n'a pas atteint. */}
        <DistributionList
          bars={distributionBars(stats)}
          of={stats.finishedCount}
          mark={solved ? play.triesUsed : null}
        />
      </div>
    </section>
  )
}

/**
 * La médaille de la ligne de rang : un disque et deux rubans.
 *
 * Dessinée ici plutôt que prise à `chrome.tsx` : les icônes de l'en-tête sont
 * des boutons, celle-ci est une ponctuation dans une phrase. Elle ne se clique
 * pas, elle ne s'annonce pas — `aria-hidden`, parce que la phrase dit déjà tout
 * ce que la médaille suggère.
 */
function MedalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      aria-hidden
      focusable="false"
      className="shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="10" cy="12.6" r="4.6" />
      <path d="M6.6 2.8 8.4 8.4" />
      <path d="M13.4 2.8 11.6 8.4" />
    </svg>
  )
}
