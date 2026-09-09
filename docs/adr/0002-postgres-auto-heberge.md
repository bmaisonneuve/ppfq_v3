# Postgres auto-hébergé sur Coolify, pas de base managée

Postgres tourne sur le même VPS que l'application, déployé par Coolify, plutôt que sur une base managée (Neon a été le candidat sérieux).

La raison est la latence, sur une requête précise : le typeahead. La saisie étant une sélection dans une liste de 382 703 footballeurs, chaque essai déclenche plusieurs recherches trigramme, soit ~35 requêtes par joueur et par jour — l'endpoint le plus sollicité du site, devant l'essai lui-même. Colocalisé, Postgres répond en sous-milliseconde ; une base managée ajoute un aller-retour réseau inter-fournisseur à chaque frappe de clavier.

## Consequences

Les sauvegardes sont à notre charge, et une sauvegarde jamais restaurée n'est pas une sauvegarde. Deux conditions non négociables : un **volume dédié**, et un **restore effectivement testé avant la première grille publiée** — pas avant l'ouverture de l'archive comme on l'avait d'abord écrit, car dès la première grille il y a de la progression joueur à perdre.

Fixer une **limite mémoire explicite** au conteneur Postgres, pour qu'il ne soit jamais le candidat désigné de l'OOM killer : le build Next tourne sur la même machine et consomme 2 à 4 Go.
