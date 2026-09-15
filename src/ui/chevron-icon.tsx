/**
 * Le chevron du voisin — la veille et le lendemain du jeu, le mois et le jour
 * d'à côté du back-office.
 *
 * Une seule pointe pour les deux moitiés de l'application, comme `Wordmark` :
 * elle était dessinée deux fois, aux deux bouts, et deux dessins de la même
 * pointe finissent par ne plus se ressembler — c'est l'objection que
 * `ui/admin/calendar-nav-link.tsx` écrit lui-même à propos de sa commande.
 *
 * Il ne dit que le **sens**, jamais la destination : un chevron seul n'apprend
 * à personne où l'on va. Le bouton qui l'entoure porte le nom du jour ou du
 * mois, et c'est lui que le lecteur d'écran annonce — d'où `aria-hidden` ici.
 *
 * `strokeWidth` est la seule chose que les deux appelants ne partagent pas : le
 * jeu trace à 1,8 comme les icônes de son en-tête, le back-office à 2 comme les
 * siennes. Une épaisseur imposée aurait fait de ce fichier un endroit où l'un
 * des deux jeux d'icônes se dépareille.
 */
export function ChevronIcon({
  direction,
  strokeWidth = 1.8,
}: Readonly<{ direction: 'previous' | 'next'; strokeWidth?: number }>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      aria-hidden
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points={direction === 'previous' ? '12,4 6,10 12,16' : '8,4 14,10 8,16'} />
    </svg>
  )
}
