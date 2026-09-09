# L'import d'un parcours remplace tout, et refuse une réponse maigre

L'ingest des parcours écrit directement sur le footballeur (`docs/modele-donnees.md` §10). Restait à décider ce que « écrire » veut dire quand il y a déjà quelque chose, et ce qu'il faut faire quand la source répond peu.

**Il remplace.** Les `player_clubs` du footballeur sont supprimés puis réécrits, dans une transaction. Un parcours est ce que la source en dit à un instant donné, pas l'empilement de deux imports : fusionner passage par passage demanderait une identité stable côté Wikidata que les déclarations n'ont pas, et laisserait grossir un parcours à chaque exécution.

Conséquence assumée, et c'est la plus visible : **une réserve retirée à la main revient**. Rien dans la source ne dit que « FC Schalke 04 II » est une réserve — c'est le point faible mesuré du §4.3 de `docs/research/wikidata-coverage.md` — donc l'import la ramène. C'est précisément pour ça que l'import est un **acte volontaire sur un footballeur** et jamais un job nocturne : le modèle accepte un catalogue qui bouge sous une grille publiée (§11) parce que rien ne le bouge en silence.

**Il refuse trois choses**, et chacune protège de la donnée curée contre une réponse maigre :

1. un item qui n'est **pas un footballeur** (`P106 = Q937857` absent) — trois des quatre Q-id du cahier des charges initial désignaient une commune italienne et deux États brésiliens, et l'un d'eux importé donnerait « Amazonas » avec un parcours d'apparence plausible ;
2. une carrière **sans aucun passage en club** — sinon un snapshot en cours d'édition, ou un footballeur qui n'a que des sélections, viderait un parcours qu'un admin a mis une heure à curer ;
3. un footballeur **inconnu du référentiel et que la source ne nomme pas** — sa ligne serait introuvable par le typeahead, donc improposable comme essai.

**Il écarte une déclaration de rang déprécié**, et c'est la seule règle qui ne vienne pas du ticket : ce rang dit que la communauté tient la déclaration pour *fausse*, et la garder mettrait un club connu comme faux dans un parcours. Elle ne coûte rien — 116 déclarations sur 1 110 232, 0,01 % (§5ter de `docs/research/wikidata-coverage.md`, mesuré le même jour) — et chacune est comptée dans la trace, donc un parcours qui perd un passage par là le dit.

Tout le reste est écrit tel quel. Les valeurs invraisemblables (`goals > matches`, fin avant début, début avant 1880) sont **signalées et conservées** : le référentiel de recherche reste exhaustif et le contrôle vit à la programmation, pas à l'entrée.

## Consequences

Le seul verrou du pipeline est un `SELECT … FOR UPDATE` sur la ligne du footballeur, pris dans la transaction. Sans lui, deux imports simultanés — un double-clic sur le bouton — suppriment tous les deux le parcours puis insèrent tous les deux le leur : aucun ne voit les lignes non committées de l'autre, et le footballeur finit avec chaque club en double, ce qui ressemble exactement à un vrai double passage.

`job_runs` gagne une colonne `target` : l'import tourne pour un footballeur à la fois, et la trace est écrite hors de la transaction pour survivre à son rollback. Une course qui a échoué et n'a rien laissé derrière elle est justement celle qu'on vient lire.

Le jour où la curation à la main devient coûteuse à refaire, la parade n'est pas de fusionner : c'est de ne rejouer l'import que sur les footballeurs jamais programmés, ou de geler ceux qui ont une grille (§11 le prévoit déjà).

Les tests hors ligne rejouent des réponses **enregistrées** (`test/fixtures/wikidata/`, capturées par `pnpm fixtures:wikidata`) : les règles sont confrontées à ce que la source contient vraiment, `"28.0"` et libellés manquants compris, sans que la suite dépende du réseau. Ce que l'enregistrement ne peut pas vérifier — que les requêtes sont toujours du SPARQL valide et que l'endpoint répond encore — est le rôle de `pnpm test:live`, hors de `pnpm test`.
