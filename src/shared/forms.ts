/**
 * Lire un formulaire, et rien d'autre.
 *
 * Ces quatre-là vivaient dans `shared/admin.ts`, quand le back-office était le
 * seul endroit du site avec des formulaires. Depuis que la connexion en a un
 * côté joueur (#13), une page du jeu importait « la couche isomorphe du
 * back-office » pour lire un champ : le signe qu'un fichier changeait pour deux
 * raisons.
 *
 * Ce qui est ici ne sait rien de qui soumet. Ce qui reste dans `shared/admin.ts`
 * est ce qui parle d'écrans d'admin.
 */
import type { z } from 'zod'

/** The first message of a Zod error — a form field has one thing wrong at a time. */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Saisie invalide.'
}

/**
 * A text field, read out of a `FormData`.
 *
 * `FormData.get` answers `string | File | null`: a file input, or no field at
 * all, are as much a possible answer as the text the admin typed. Passing that
 * straight to `String()` turns an uploaded file into the id `"[object File]"`,
 * which then reaches a query as a perfectly well-formed nonsense value. This
 * is the one place that narrowing happens; a `File` reads as the empty string
 * and every caller already refuses that.
 */
export function textField(form: FormData, name: string): string {
  const value = form.get(name)
  return typeof value === 'string' ? value : ''
}

/**
 * A file field, read out of a `FormData` — the mirror of `textField`, and the
 * reason that one exists.
 *
 * An untouched `<input type="file">` still submits: the browser sends a `File`
 * with an empty name and no bytes. That is "no file", not a file of length
 * zero, so it reads as null and every caller is spared the distinction.
 */
export function fileField(form: FormData, name: string): File | null {
  const value = form.get(name)
  return value instanceof File && value.size > 0 ? value : null
}

/** The same narrowing for a field submitted several times, in document order. */
export function textFields(form: FormData, name: string): string[] {
  return form.getAll(name).map((value) => (typeof value === 'string' ? value : ''))
}
