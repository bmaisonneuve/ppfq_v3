'use client'

import { SIGN_IN_CODE_LENGTH } from '@/shared/account'

/**
 * Le champ des six chiffres — un seul, pour les deux écrans qui en ont un.
 *
 * Le jeu et le back-office se connectent désormais par la même porte, donc ils
 * ont le même champ ; et ce champ porte trois réglages que personne ne
 * retrouverait deux fois de suite :
 *
 * - **`inputMode` et pas `type="number"`.** Un code est une suite de chiffres,
 *   pas un nombre : un champ numérique mangerait un zéro initial et afficherait
 *   des flèches d'incrément sur une valeur qu'on n'incrémente pas.
 * - **`autoComplete="one-time-code"`**, qui est ce qui fait proposer le code par
 *   iOS et Android depuis la notification, sans ouvrir le client mail — donc
 *   sans quitter l'onglet où l'on joue, ce qui est tout l'intérêt du code.
 * - **une longueur maximale d'un caractère de plus**, parce que la saisie est
 *   normalisée côté serveur et qu'un code collé arrive régulièrement avec une
 *   espace au milieu.
 *
 * Il vit à la racine de `ui/` et non dans `ui/game` ou `ui/admin` : il appartient
 * aux deux, comme `footballer-typeahead.tsx` à côté.
 */
export function SignInCodeField({
  id,
  value,
  onChange,
}: Readonly<{
  id: string
  /** Fourni pour un champ contrôlé ; absent quand un formulaire le poste seul. */
  value?: string
  onChange?: (value: string) => void
}>) {
  return (
    <input
      id={id}
      name="code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={SIGN_IN_CODE_LENGTH + 1}
      required
      autoFocus
      value={value}
      onChange={
        onChange === undefined
          ? undefined
          : (event) => {
              onChange(event.target.value)
            }
      }
      className="field"
    />
  )
}
