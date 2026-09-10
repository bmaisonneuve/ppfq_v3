# L'état personnel est un POST après l'hydratation, et c'est lui qui crée la partie

La page de la grille ne lit aucun cookie (ADR-0008) : tout ce qui appartient à une personne arrive donc par une requête à elle, après l'hydratation. Cette ADR tranche la forme de cette requête, parce que trois choix y sont contre-intuitifs.

## Un Route Handler, et pas une Server Action

Le tableau des portes d'entrée (`docs/stack-technique.md` §4) réserve le Route Handler à « ce qui a besoin d'un contrat HTTP », et c'est exactement le cas : la réponse est personnelle et un CDN est devant l'origine, donc `Cache-Control: private, no-store` n'est pas un détail d'implémentation, c'est ce qui empêche de servir la progression d'un joueur à un autre. Elle pose aussi un cookie, ce qu'un rendu ne peut pas faire — HTTP n'autorise plus d'en-tête une fois le flux commencé.

S'y ajoute une raison de forme : la requête part d'un `useEffect`, pas d'un formulaire. Une Server Action appelée depuis un effet fait re-rendre la route à chaque appel pour une valeur de retour dont on n'utilise que le corps.

La liste « en quatre lignes » du §4 ne prévoyait pas cette route. Elle en compte cinq.

## POST, alors que la requête ressemble à une lecture

Parce qu'elle **crée**. Une partie naît à l'ouverture de l'énigme (`docs/modele-donnees.md` §4), et un GET qui crée une partie serait déclenché par tout ce qui parcourt le web sans qu'on le lui demande : un préchargement de lien, un crawler, un bot d'aperçu de messagerie. Chacun compterait comme une personne exposée à l'énigme — le dénominateur exact que lit le calibrage de difficulté (#12). Une méthode que personne n'emprunte par accident est le garde-fou le moins cher possible, et c'est le seul endroit du projet où le verbe HTTP porte une garantie métier.

## Une seule requête, qui lit tout et ouvre une énigme

`open` est facultatif : lire n'est pas ouvrir. Le client envoie `{ date, open }` et reçoit l'état des trois énigmes, celle qu'il ouvre comprise. Deux endpoints — un GET pour lire, un POST pour ouvrir — auraient été plus orthodoxes et coûteraient deux allers-retours à l'origine à la minute du pic, pour une réponse de même forme.

Corollaire tenu par l'interface et non par l'endpoint : les trois énigmes ne se déplient pas d'un coup. Le pli **est** le geste qui crée la partie, ce qui est la raison pour laquelle la liste des énigmes est devenue un composant client — avant ce ticket, le `<details>` fonctionnait sans JavaScript. Le parcours reste dans le premier rendu : un composant client est rendu côté serveur lui aussi, et ce qui attend l'hydratation n'est que la conséquence de l'ouverture.

## Ouvrir est refusé sur toute date qui n'est pas celle du jour

Ce n'est pas une validation, c'est la conséquence directe de l'ADR-0008. La page est prérendue et servie depuis un cache partagé pendant une minute : quelqu'un qui arrive à minuit peut tenir la grille de la veille. Ouvrir une énigme de cette grille créerait une partie que la règle de lecture échoue dans la seconde, et compterait un joueur comme exposé à l'énigme d'hier.

La réponse porte donc `today` en plus de `date`, et l'interface le dit — « la grille du jour a changé, recharger ». Le client n'est pas en position de le savoir : la seule horloge fiable est celle du serveur, et la page qu'il tient n'a pas d'âge visible.

## L'identité anonyme est résolue avant le service

`player.service.ts` est coupé en deux : la porte lit le cookie et le réécrit, `resolvePlayer` fait tout le reste et reçoit la valeur présentée en argument. Même échange que `auth/admin-session.ts` — un premier visiteur, un joueur qui revient, une ligne purgée, un cookie forgé et une rafale de requêtes simultanées deviennent cinq lignes dans un vrai Postgres au lieu de cinq réponses HTTP à fabriquer.

Trois décisions dans la résolution elle-même :

- **Un cookie bien formé dont la ligne a disparu est adopté**, pas remplacé. Garder la valeur présentée rend la fonction idempotente pour un joueur qui revient, quoi qu'il soit arrivé entre-temps, et laisse le navigateur avec le cookie qu'il avait déjà.
- **Tout ce qui n'est pas un UUID est remplacé sans erreur.** Un cookie abîmé n'est pas un incident : c'est quelqu'un qui reçoit une nouvelle identité, ce que reçoit de toute façon un premier visiteur.
- **`UPDATE … RETURNING` plutôt qu'un select puis un update.** `last_seen_at` est la seule chose sur laquelle la purge puisse s'appuyer, donc il bouge à chaque lecture personnelle — c'est le chemin le plus chaud du jeu, et ce serait un aller-retour de plus.

**Les requêtes du client sont enchaînées, une à la fois.** Ce n'est pas du rangement : un premier visiteur ne porte aucun cookie, donc *chaque* requête en vol sans cookie est un joueur qui se crée. Déplier le titulaire avant que la première réponse n'arrive donnerait deux lignes `players`, le navigateur garderait le `Set-Cookie` arrivé en dernier, et perdrait la partie attachée à l'autre — au rechargement même que ce ticket existe pour faire marcher. Rien côté serveur ne peut voir que deux requêtes sans cookie sont un seul navigateur : le correctif est donc dans le client, et la première requête établit l'identité que les suivantes portent.

**L'hydratation demande au DOM ce qui est déplié**, plutôt que de le supposer. Un `<details>` s'ouvre nativement : sur une page que 20 000 personnes ouvrent en cinq minutes, quelqu'un tapera le titulaire entre le premier rendu et l'hydratation, et le geste arrivera avant le gestionnaire qui crée la partie. React ne le sait pas et ne referme pas le pli : l'énigme resterait ouverte, sans partie, et rien ne la créerait ensuite. Le DOM est la seule trace de ce geste, donc on la lit. C'est le prix du pli qui a une conséquence serveur, et il se paie une fois, au montage.

L'enchaînement règle du même coup ce que le parallélisme rendait délicat : chaque réponse est l'état complet de la journée, donc la dernière exécutée est par construction la plus fraîche, et il n'y a plus de réponse hors d'ordre à détecter.

**Une journée sans grille ne crée aucune identité**, et c'est voulu. Aucune énigme n'est rendue, donc aucune requête ne part : la ligne `players` naîtrait sans rien à quoi la rattacher, et la purge l'effacerait. L'identité existe dès qu'il y a quelque chose à se rappeler.

Le cookie est réécrit à **chaque** réponse : c'est le « glissant » des 13 mois. Sa politique — nom, durée, attributs — est une valeur testée dans `server/auth/player-cookie.ts` et non un littéral en ligne, parce que la promesse qui y est attachée (strictement nécessaire, donc pas de bandeau, donc aucun traceur analytique à cookie sur le site) ne se vérifie pas en relisant un appel.

## Reprogrammer une journée ne détruit plus les parties du jour

Conséquence qu'il fallait traiter ici : une partie pend à sa ligne `challenge_items` par un `ON DELETE CASCADE`. `scheduleGrid` corrigeait une journée en supprimant les trois énigmes et en les réécrivant — sans conséquence tant que personne ne dépendait de leur identité. Depuis ce ticket, corriger un thème à quinze heures effacerait toutes les parties de la journée, pour tout le monde.

La programmation ne remplace donc que ce qui change : une position dont le footballeur est identique garde sa ligne. L'autre moitié de la décision est volontaire — une position dont le footballeur change est une autre question, et les parties qui portaient des essais dépensés sur le précédent s'en vont avec.

## Ce qui n'est pas fait

**Aucune limite de débit.** Cet endpoint crée une ligne `players` pour un appelant qui ne présente pas de cookie : le marteler gonfle une table. C'est la même exposition que le typeahead, traitée au bord et non dans l'application (`docs/stack-technique.md` §10, #16). Le jeu lui-même n'a rien à défendre — « quelqu'un qui rotate son cookie d'identité anonyme pour forcer une réponse ne pénalise que lui » (§4) — et c'est la table, pas la triche, qui est le sujet le jour où il faudra la poser.

**Aucun contrôle des 13 mois hors de la CI.** La durée est affirmée deux fois : `test/domain/player-cookie.test.ts` sur la constante, et un `grep` du `Max-Age` de la vraie réponse dans `.github/workflows/ci.yml`. La seconde n'est pas reliée à la première — c'est un littéral dans du YAML — et c'est assumé : ce qu'elle vérifie est une propriété de la *réponse*, que rien dans la suite ne peut voir. Les deux se croisent par commentaire, et changer la durée demande de toucher les deux.

**Aucun état personnel dans la page**, et c'est vérifié plutôt que retenu : `test/architecture/static-game-page.test.ts` échoue si la chaîne de segments de `/` importe `play.service`, `player.service` ou la politique de cookie. La règle qui interdisait déjà de lire un cookie l'aurait attrapé — on ne résout pas une identité sans en lire un — mais l'intention, elle, ne se lisait nulle part.
