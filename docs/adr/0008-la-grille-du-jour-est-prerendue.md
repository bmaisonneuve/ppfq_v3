# La grille du jour est prérendue, et le build lit donc la base

La page de la grille ne lit **aucun cookie** : c'est la décision d'architecture centrale du projet (`docs/stack-technique.md` §10, #7). Elle reste donc entièrement statique, Next la prérend et l'annonce avec un `Cache-Control` qu'un CDN comprend — Cloudflare cache la page entière, un HIT ne coûte rien à l'origine, et le pic de minuit (20 000 personnes en cinq minutes, pas 15 req/s de moyenne) est absorbé par du cache. La propriété qu'on gagne au passage vaut autant que la performance : une page qui ne contient structurellement ni indice ni donnée personnelle ne peut pas en faire fuir par un cache partagé.

Ce qui suit est la conséquence que personne n'a choisie : **prérendre la grille, c'est lire `daily_challenges` pendant `next build`**. Un build sans base joignable échoue, et échoue bruyamment — `Error occurred prerendering page "/"`, la trace pointant sur `DATABASE_URL is not set`. Ce n'est pas un bug : rendre du contenu à l'avance demande que le contenu existe à l'avance.

Deux échappatoires ont été écartées.

**Rendre le build tolérant** — attraper l'erreur de lecture et prérendre « aucune grille aujourd'hui » — coûte plus cher qu'il n'y paraît. Chaque image livrée porterait alors une page d'accueil que l'on sait fausse, servie aux premiers visiteurs après chaque déploiement, et rediffusée par le CDN aussi longtemps que son `s-maxage` : l'entrée prérendue a l'âge du build, donc la première requête après le démarrage du conteneur sert du périmé pendant qu'une régénération part derrière. Absorber une contrainte d'infrastructure en publiant une page fausse est le mauvais échange.

**Rendre la route dynamique** rendrait le problème sans objet et abandonnerait exactement ce que le ticket protège : l'origine reprendrait le pic de plein fouet, et une page qui varie par visiteur derrière un cache partagé est la façon dont les indices d'un joueur finissent sur l'écran d'un autre.

**Le build a donc besoin de `DATABASE_URL` et d'un Postgres joignable.** En CI, le conteneur de service est déjà là : il est migré puis laissé vide avant `pnpm build`, ce qui prérend « aucune grille » — suffisant pour ce que l'étape vérifie, à savoir que la route est bien statique (`○ /` dans la sortie de build). En production, `docs/stack-technique.md` §8 note que **le build tourne sur le VPS de prod**, à côté de Postgres : la variable devient une *build variable* Coolify, et #16 doit donner au build son accès réseau. C'est la contrainte à ne pas découvrir le jour du premier déploiement.

## La bascule tient à une horloge, pas à un minuit

`revalidate` est à **60 secondes** et non à un jour, alors que `docs/stack-technique.md` §10 tranche « revalidée une fois par jour » et que le ticket le reprend, pour une raison mécanique : l'horloge de revalidation démarre quand l'entrée est *générée*, pas à minuit heure de Paris. `revalidate = 86400` garderait la grille rendue pendant une journée pleine à partir de n'importe quelle heure, et la bascule tomberait donc à une heure arbitraire du lendemain — le seul moment de la journée où se tromper se voit de tout le monde à la fois.

Soixante secondes bornent l'écart à une minute et ne coûtent presque rien : Next répond `s-maxage=60, stale-while-revalidate=…`, donc une entrée périmée continue d'être servie depuis le bord pendant qu'un rendu la rafraîchit. L'origine voit une requête par minute et aucun joueur n'attend jamais.

La bascule exacte est le travail du job quotidien de pré-chauffage (#15, `cache_revalidate`) : une invalidation à la demande est la seule chose qui puisse tomber sur une horloge. Il revalidera ce chemin juste après minuit et purgera le CDN dans le même mouvement, et ce nombre pourra alors remonter à la journée — la grille basculera parce que quelque chose l'a dit, non parce qu'un minuteur a expiré.

## Ce que `status` ne garde pas

La grille est lue **par sa date et rien d'autre**. `docs/modele-donnees.md` §4 donne pourtant à `daily_challenges.status` une valeur par défaut `draft` et une colonne `published_at`, et le document du modèle prime sur tout le reste : le noter ici est donc obligatoire.

Rien dans l'application n'écrit `draft` ni `published`. L'écran de programmation écrit `scheduled`, il n'existe aucune étape de publication, et **l'absence de ligne est le trou** — la même absence que liront l'alerte hebdomadaire et la route de santé (#14, #15). Filtrer sur `status = 'published'` livrerait donc un site vide tous les jours de l'année, et filtrer sur `scheduled` reviendrait à filtrer sur « ce que l'application écrit ».

Les deux colonnes restent donc inertes, et c'est un état à assumer explicitement : une ligne insérée à la main avec les valeurs par défaut serait servie aux joueurs bien qu'elle se dise `draft`. Le jour où une publication devient une vraie étape — un hors-série préparé à l'avance, par exemple (specs §9) —, c'est ce paragraphe qu'il faudra contredire, et la lecture par date qui devra apprendre à filtrer.

## Consequences

L'étape `pnpm build` de la CI n'est plus indépendante de la base : elle est précédée d'un `pnpm db:migrate` sur le conteneur de service. Une suite de tests supprimée ou déplacée ne casse plus le build, mais une migration non générée le casse — ce qui est le bon sens de la dépendance.

L'archive (#11) multipliera cet effet : une route statique par date prérendrait autant de pages au build. Le jour venu, c'est le moment de choisir entre `generateStaticParams` sur une fenêtre courte et une génération à la première visite.

Rien de tout cela ne s'applique au back-office, dynamique par nature (`ƒ` dans la sortie de build) : il lit une session à chaque requête et n'est prérendu nulle part.
