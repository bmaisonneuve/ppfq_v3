# L'import du référentiel de recherche est de l'outillage, pas un service

Les services sont la seule porte d'entrée du serveur (`docs/stack-technique.md` §3). L'import des 382 703 footballeurs et 225 886 alias de `.data/` n'en est pourtant pas un : il vit dans `scripts/referential.ts`, à côté du lanceur de migrations, et rien dans `src/` ne l'importe.

Trois raisons, dans cet ordre. Ce n'est pas un cas d'usage de l'application mais un **amorçage** : deux fichiers lus depuis le disque, une fois, au déploiement — exactement le statut d'une migration. Il doit tourner sous **Node nu**, où `import 'server-only'` lève, donc aucun fichier de `src/server/` ne lui est accessible. Et il n'a **aucun appelant applicatif** : ni routage, ni Server Action, ni task de worker.

À ne pas confondre avec l'ingest Wikidata des **parcours** (#4), qui sera un service : celui-là est déclenché par l'admin depuis le back-office, footballeur par footballeur, et passe donc par une porte d'entrée.

## Consequences

La seule chose partagée avec l'application est la définition d'un terme de recherche : `normalizeSearchTerm`, dans `src/shared/search.ts`, appelée par l'import **et** par la requête. C'est tout le contrat entre les deux moitiés — un terme normalisé autrement est un footballeur que personne ne trouve — et c'est la raison pour laquelle cette fonction est dans `shared/` plutôt que dans `server/domain/`.

Ses tests vivent dans `test/database/`, à côté de ceux des migrations, et non sur le seam des services : ce sont deux natures différentes de code, et le seam principal reste ce que la spec dit qu'il est.

Le déploiement doit lancer `pnpm db:import-referential` comme il lance `pnpm db:migrate`. L'import est idempotent, le relancer ne duplique rien.

Le jour où rafraîchir le référentiel devient une action de l'admin dans le back-office, il devient un service et cette décision est à rouvrir.
