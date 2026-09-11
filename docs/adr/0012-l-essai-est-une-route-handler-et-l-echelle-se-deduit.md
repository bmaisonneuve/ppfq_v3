# L'essai est un Route Handler, et l'échelle de dévoilement ne se stocke pas

Deux décisions dans ce ticket contredisent ce qui était écrit avant lui, ou ce qu'on aurait fait par défaut. Elles sont indépendantes ; elles tiennent ici parce qu'elles concernent le même geste.

## L'essai n'est pas une Server Action

`docs/stack-technique.md` §4 range l'essai sous « écriture depuis l'UI », donc sous Server Action, et va jusqu'à en donner le squelette. Ce ticket en fait une septième route, `app/api/game/try/route.ts`, à côté de l'état personnel.

**Une Server Action appelée depuis un composant client rafraîchit la route d'où elle part.** Et la route d'où elle partirait est la grille du jour : prérendue, servie entière depuis un cache partagé, ouverte par 20 000 personnes en cinq minutes (ADR-0008). Le jeu compte ~13 requêtes par joueur ; chacune ramènerait en plus un payload RSC de la page, pour une valeur que le client tient déjà dans sa main. C'est exactement l'argument que l'ADR-0009 posait pour l'état personnel — « une Server Action appelée depuis un effet fait re-rendre la route à chaque appel » — et il vaut ici sans l'effet.

**La seconde raison suffirait seule : l'essai doit faire la queue derrière l'état personnel.** Un premier visiteur ne porte aucun cookie, donc *chaque* requête en vol sans cookie crée un joueur (ADR-0009). Un essai qui double la requête qui ouvre l'énigme donnerait deux lignes `players`, et le navigateur en perdrait une. Le client sérialise ses requêtes dans une seule file ; une Server Action est hors de cette file par construction. Un client, une file, une identité.

S'y ajoute une raison de forme : `private, no-store` devant un CDN n'est pas un détail d'implémentation sur une réponse qui contient des indices, et sur le dernier essai, la réponse.

Le tableau du §4 en compte donc **sept**.

## Trois formes de réponse, et ce sont trois statuts

La réponse d'un essai est un `EnigmaPlay` — exactement la valeur que sert déjà la route d'état — et non un type `TryResult` à part. Les trois formes que demandent les specs sont ses trois statuts : `in_progress` un faux, `solved` trouvé, `failed` la sixième erreur. Il n'y en a pas de quatrième, parce que la saisie est une sélection dans une liste : « pas un footballeur » n'existe pas (specs §10).

Une seule forme plutôt que deux, et c'est une décision de sécurité avant d'être une décision de goût : **il n'y a qu'un endroit d'où un indice ou un nom peut sortir trop tôt**, donc un seul endroit à tester. Deux formes auraient donné deux chemins et deux jeux d'assertions, dont l'un aurait fini par diverger.

Le refus, lui, n'est pas une forme de réponse : `TryRefusedError` et un 409. Le septième essai, une énigme jamais ouverte, une grille qui a tourné — le serveur sait pourquoi, le client n'a pas besoin de le savoir et relit l'état.

## L'échelle de dévoilement ne se stocke nulle part

`player_progress` n'a pas de colonne `hints_revealed` et ne doit pas en gagner une. Le nombre d'indices dévoilés **est** le nombre d'erreurs commises : le stocker serait stocker deux fois le même fait, et deux copies d'un fait divergent à la première écriture qui en oublie une. Toute la garantie « une erreur dévoile exactement un indice, le suivant » tient à ce que `server/domain/reveal-ladder.ts` soit la seule chose qui en décide.

Conséquence directe : **la réponse porte les indices cumulés, pas l'indice du jour**. C'est ce que réclame « les informations dévoilées restent affichées jusqu'à la fin de la partie » (specs §3) sur une page qu'un rechargement jette. Ce qui garantit le « un seul indice » n'est donc pas le format de la réponse mais l'échelle : une réponse à six indices serait une partie à six erreurs.

Le corollaire à ne pas perdre : **l'essai qui trouve ne compte pas comme une erreur**. Trouver au deuxième essai, c'est une erreur, donc un indice. Sans cette soustraction, on offrirait un palier pour avoir eu raison.

Les deux points ci-dessus contredisent `docs/modele-donnees.md` §8, qui tabule trois formes `correct` / `wrong` / `exhausted` dont `wrong` porte « **un seul** indice, le suivant », et qui indexe l'échelle sur `tries_used`. Le document du modèle prime sur tout le reste : la correction y est donc notée, comme l'ADR-0008 a dû le faire pour `status`. Ce que la phrase « le serveur ne renvoie jamais la liste complète des indices ni la réponse avant la fin » protégeait reste vrai, et c'est ce qui est testé : **aucune réponse ne contient un indice qui n'a pas été payé, ni le nom avant la fin**. Ce qui change est le porteur de la garantie — l'échelle plutôt que le format du message.

### Le catalogue n'est lu que quand il y a quelque chose à montrer

Une partie naît à l'ouverture de l'énigme (`docs/modele-donnees.md` §4), donc la requête qui en ouvre une porte sur une partie à zéro erreur : ni indice, ni réponse. À la minute du pic, c'est presque toute la circulation. `needsCareer` est la règle qui dit que cette requête-là ne lit **aucun nom de footballeur** — ce n'est pas une optimisation avec un effet de bord heureux, c'est l'effet de bord qui compte : ce qui n'est pas lu ne peut pas être sérialisé par erreur. C'est la même règle que suit `grid.service.ts` pour la page cachée, appliquée à une requête personnelle.

## Ce qui n'est pas fait

**Aucune limite de débit**, pour les raisons que donne déjà l'ADR-0009 : c'est la table `players` qui est exposée, pas la triche, et cela se traite au bord (#16). Le jeu lui-même n'a rien à défendre — la réponse ne sort pas avant la fin, le service refuse le septième essai, et « quelqu'un qui rotate son cookie d'identité anonyme ne pénalise que lui » (`docs/stack-technique.md` §4).

**Aucun `skips_used`.** Un tour passé est une erreur comme une autre une fois écrit, et rien ne permettra de les distinguer après coup. C'est ce que dit le modèle, et la statistique qui voudrait la différence n'existe pas.

**Aucun test d'interface.** Le dépôt n'en a aucun, et ce ticket n'en introduit pas le premier : « les paliers 4 et 5 sont libellés en championnat » est donc affirmé sur la constante `HINT_LABELS` (`test/shared/play.test.ts`), et le composant la lit au lieu d'écrire les mots. C'est le maillon qui reste non vérifié, et il tient à une seule ligne de `revealed-hints.tsx`.

**Aucune vérification que le footballeur proposé est dans le référentiel.** Un essai est une sélection dans la liste de suggestions ; un identifiant qui ne désigne personne n'est simplement pas la réponse, ce qui est le sort de toute autre mauvaise proposition.
