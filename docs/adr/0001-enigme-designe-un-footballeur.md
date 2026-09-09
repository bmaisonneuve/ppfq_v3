# Une énigme désigne un footballeur, elle ne le copie pas

`challenge_items` porte une grille, une position et un `footballer_id` — rien d'autre. Le parcours, les durées, les matchs, les buts et la nationalité que voit le joueur sont lus dans `player_clubs`, `clubs` et `footballers` **au moment du rendu**. Programmer une grille, c'est choisir trois footballeurs et une date.

Le gain est un modèle et un back-office beaucoup plus simples : corriger une carrière corrige toutes les énigmes d'un coup, et il n'y a jamais deux versions d'un parcours à réconcilier.

## Considered Options

Un parcours figé à la programmation (`career_snapshot`, indices pré-calculés) a été explicitement écarté. Il protégerait les grilles publiées des mouvements du catalogue, au prix d'une copie à maintenir, d'un chemin d'invalidation à écrire, et d'une divergence silencieuse entre ce qui est affiché et ce qui est vrai.

## Consequences

**Un import qui modifie un parcours modifie toutes les grilles où ce footballeur apparaît** — y compris une grille d'archive, et y compris pendant la partie d'un joueur. Un transfert ajouté fait passer une grille de cinq à six clubs, et les résumés déjà partagés ne correspondent plus. C'est **assumé, sans garde-fou** : ni gel des footballeurs programmés, ni avertissement dans l'admin.

Si tu découvres qu'une grille d'archive a changé, ce n'est pas un bug : ne le « corrige » pas en ajoutant une copie du parcours, tu détruirais le modèle. Les parades disponibles, le jour où ça gênerait vraiment, sont de geler les footballeurs ayant une grille programmée, ou de ne rejouer l'import que sur ceux jamais utilisés.

Détail qui en découle : l'ordre d'affichage des passages n'est pas stocké non plus. Il est déterminé par `(start_year, end_year, id)`, et le seul moyen de corriger un ordre faux est d'ajuster une année — d'où l'absence de drag & drop dans l'éditeur de parcours, qui promettrait un ordre libre que le modèle ne porte pas.
