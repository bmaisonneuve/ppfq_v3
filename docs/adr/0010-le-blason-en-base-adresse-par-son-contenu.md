# Le blason vit dans Postgres, adressé par son contenu

`clubs.logo_s3_key` annonçait un stockage objet que rien n'a jamais écrit. Il fallait trancher où vivent les octets d'un blason avant d'écrire la première ligne qui en pose un, et la colonne mentait sur les deux points : ce n'est pas S3, et ce n'est pas une clé d'objet.

**Les octets vont dans Postgres**, dans une table `club_crests` dont la **clé primaire est le SHA-256 des octets**.

Le ticket a mesuré ~15-20 Ko par blason ; à la largeur que cette implémentation demande (`pithumbsize=128`, que le thumbnailer arrondit à sa propre grille, ~250 px), la moyenne relevée sur les 21 clubs du catalogue de développement est de ~35 Ko, extrêmes 51 et 98 Ko. Quelques milliers de clubs au grand maximum : ~140 Mo à cette moyenne, moins de ~200 Mo dans tous les cas — contre les 15-20 Go/an que `player_progress` prévoit au §9 de `docs/modele-donnees.md`. L'ordre de grandeur du ticket tient, et c'est lui qui tranche.

Postgres sort tout seul un `bytea` de plus de 2 Ko de la table vers TOAST, et le chemin de lecture est caché indéfiniment derrière Cloudflare : ce n'est pas un chemin chaud, c'est un chemin que l'origine cesse de voir.

Un stockage objet ferait entrer un compte, des clés, un service de développement de plus, et surtout une **seconde histoire de sauvegarde** — alors que #17 exige un restore complet vérifié. La procédure doit rester « on restaure Postgres ». C'est cette raison-là qui tranche, pas le volume.

**L'indirection que le modèle voulait est conservée** : `clubs.crest_key` est une **clé**, jamais une URL. Le domaine qui sert les octets doit pouvoir bouger sans réécrire la table, et le jour où le volume justifie la bascule vers un bucket, le même hash est le nom de l'objet.

## Ce que l'adressage par contenu donne, et qui n'est pas un bonus

Trois propriétés, et c'est pour elles que la clé est le hash plutôt qu'un uuid :

1. **Deux clubs au même blason partagent une ligne.** Réécrire la même image est un `ON CONFLICT DO NOTHING`, donc rejouer une extraction ne coûte rien.
2. **Remplacer un blason change son adresse**, donc son URL. Il n'y a rien à invalider : l'ancienne URL continue de servir les anciens octets à ce qui les avait mis en cache, et la nouvelle est neuve pour tout le monde.
3. **`Cache-Control: immutable` est donc vrai**, pas optimiste. C'est ce qui rend le stockage en base sans conséquence : à la deuxième requête, l'origine ne voit plus rien.

`/api/crests/<sha256>` est publique et sans `requireAdmin()`. Un CDN ne peut pas cacher ce qu'il doit authentifier, et il n'y a rien à protéger : l'adresse est le SHA-256 d'une image tirée d'un article public, et rien ne s'énumère.

## Ce qui est stocké à côté des octets

`source_file`, `source_url`, `source_wiki` et `license`. Chacun a une raison précise :

- l'**image principale d'un article n'est pas toujours le blason** — l'article anglais de London Caledonians FC répond une photo d'équipe légendée de 1894, et c'est mesuré, pas hypothétique. Rien dans le pipeline ne sait faire la différence, donc le nom du fichier source s'affiche sur la fiche du club et l'œil de l'admin est le rattrapage ;
- la **licence** est l'histoire du retrait. Le risque juridique est celui déjà évalué et **accepté** au §11 du doc technique ; ce qu'une décision d'accepter un risque impose, c'est qu'en sortir soit bon marché. Ici c'est **une ligne à supprimer** : `clubs.crest_key` est `ON DELETE SET NULL`, donc aucun club ne bloque l'effacement et aucun ne casse après.

Rien ne ramasse les lignes orphelines. Un blason remplacé laisse les siennes derrière lui : quelques dizaines de kilo-octets, un autre club peut les pointer, et un ramasse-miettes qui se trompe efface une image que quelqu'un avait curée.

## Ce qui est refusé à l'entrée

**Images matricielles uniquement** — PNG, JPEG, WebP, GIF. Pas de SVG : c'est du balisage exécutable, et il serait servi depuis l'origine du site. La restriction ne coûte rien parce que l'extraction n'en produit jamais : une vignette demandée au thumbnailer Wikimedia revient rendue en PNG, et c'est précisément ce qui évite de faire entrer une dépendance de traitement d'image dans le projet.

## Consequences

`clubs.logo_s3_key` disparaît (migration `0007`) et `clubs.crest_key` la remplace (`0006`), en clé étrangère vers `club_crests`. La colonne n'avait jamais été écrite par personne, donc il n'y a pas de reprise de données. `nationalities.flag_s3_key` porte le même mensonge et n'est **pas** touchée ici : aucun drapeau n'est encore servi, et la renommer sans rien qui l'écrive serait le même mensonge sous un autre nom.

`docs/modele-donnees.md` est la source de vérité du modèle : il porte la nouvelle table et la colonne renommée.

L'extraction **ne remplace jamais** un blason déjà présent. C'est la règle d'ADR-0005 appliquée telle quelle — un blason présent est de la donnée curée — et ce n'est pas une vérification dans une boucle : la requête ne sélectionne que les clubs sans blason, et l'`UPDATE` reporte la même condition, donc deux passes simultanées ne se marchent pas dessus non plus.

Un échec de téléchargement **ne fait jamais échouer un import de parcours**. L'extraction ouvre sa propre ligne de `job_runs`, après que celle de l'import a été fermée : un parcours à moitié écrit est une énigme fausse, un blason manquant n'est qu'une image manquante.

Et elle est **bornée quand elle tourne dans la requête de l'admin**. L'import de parcours n'a ni file ni worker (§7 du doc technique), donc ses blasons se récupèrent dans le POST que l'admin vient d'envoyer — et un footballeur amène jusqu'à une douzaine de clubs neufs. À la patience de la commande de rattrapage (trois tentatives, vingt secondes chacune, un club à la fois), un seul article injoignable ferait passer un import réussi pour un import bloqué. Cette passe-là a donc une tentative, un timeout court, et un budget qui l'empêche de *lancer* de nouveaux téléchargements au-delà : ce qu'elle laisse est compté à part — ni manquant, ni en échec — et repris par `pnpm crests:backfill`.

L'affichage du blason **côté joueur reste hors périmètre**. La grille du jour est prérendue et cachée pleine page (ADR-0008) ; y faire entrer des images est une décision de jeu, pas une conséquence de celle-ci. Le blason s'affiche dans le back-office, là où il sert à vérifier qu'il est le bon.
