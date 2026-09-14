# La porte du back-office : un secret partagé maintenant, le compte plus tard

> **Périmé par [ADR-0014](./0014-le-compte-nos-portes-devant-better-auth.md).**
> « Plus tard » a eu lieu : la porte est le compte sans mot de passe de #13, et
> le rôle est `ADMIN_EMAILS` — une variable d'environnement plutôt qu'une
> colonne, pour qu'il n'y ait pas d'écran capable de l'accorder.
> `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`, `src/server/auth/admin-session.ts`
> et le verrou anti-devinage en mémoire ont disparu ; la limite de fréquence du
> compte remplace le dernier, en mieux, parce qu'elle compte aussi par adresse.
> Les sept jours de session sont revenus aux 180 du joueur : ils compensaient un
> secret partagé qui ne tourne pas, et il n'y en a plus.
>
> **Ce qui tient, et qui était le vrai contenu de cette décision** : le contrôle
> n'est pas dans un middleware, il est `await requireAdmin()` en première ligne
> de chaque page et de chaque action, et `test/architecture/admin-guard.test.ts`
> le garde. Le remplacement a bien été un seul seam,
> `services/admin-auth.service.ts`, et aucune page ni aucune action de curation
> n'a changé. Ce qui tient aussi : sans variable, la porte reste fermée.

Le back-office doit être fermé dès l'écran de curation (#5). Le compte sans mot de passe qui portera le rôle admin — code à six chiffres, lien magique, Better Auth — est #13, huit tickets plus loin, et il traîne derrière lui un provider d'email, un domaine avec SPF/DKIM/DMARC et un quota Scaleway à faire lever. L'éditeur ne peut pas attendre ça pour avoir une porte, et une porte ouverte « en attendant » est une porte qu'on oublie.

**La porte est donc un secret partagé et un cookie signé.** `ADMIN_PASSWORD` ouvre la session, `ADMIN_SESSION_SECRET` la signe, la valeur du cookie est une date d'expiration et son HMAC — pas d'identité, pas de rôle, pas de table : il y a un seul admin, et une signature valide **est** le contrôle de rôle. Sept jours, contre 180 pour la session d'un joueur : celle-ci donne les clés du catalogue, elle est provisoire, et se reconnecter coûte un mot de passe.

**Sans variable, la porte reste fermée.** Un back-office qui s'ouvre parce qu'une variable manque à l'environnement échoue en silence et du côté qui laisse entrer ; celui-ci échoue fermé, et l'exploitant s'en aperçoit parce qu'il ne peut pas entrer non plus. Un secret vide ne correspond à rien, pas même à la chaîne vide. Un verrou en mémoire — dix échecs par quart d'heure — rend le devinage lent, sur le seul réplica que l'infrastructure a, comme le fait déjà le rate limit du lien magique (`docs/stack-technique.md` §4bis).

**Le contrôle n'est pas dans un middleware,** et c'est une divergence assumée avec `docs/stack-technique.md` §4bis et §6, qui écrivent « check de rôle en middleware ». Depuis Next 16 la documentation du framework est explicite sur deux points qui retirent au middleware — renommé *proxy* — le rôle d'autorisation :

- une Server Action est joignable par un POST direct, quelle que soit la page autour d'elle ;
- un layout **ne décide pas** si ses segments enfants s'affichent. C'est le routeur qui les rend, donc un layout qui remplacerait ses enfants par un formulaire de connexion n'empêcherait pas la page en dessous de lancer ses requêtes ni d'atteindre le RSC payload.

Ce qui reste, c'est la page et l'action elles-mêmes : `await requireAdmin()` en première ligne de chacune. Une règle appliquée à la main dans une douzaine de fichiers est une règle qu'on oublie, donc elle est **testée** — `test/architecture/admin-guard.test.ts` fait échouer la CI quand un export nouveau l'oublie, exactement comme le marqueur `server-only` est vérifié plutôt que rappelé. Deux exemptions, nommées et elles-mêmes vérifiées : la page de connexion, et les deux actions de session.

Aucun `proxy.ts` n'est ajouté. Sa seule valeur ici serait de protéger des routes statiques, et toutes les routes d'admin lisent un cookie donc sont dynamiques : il ne ferait que dupliquer la règle sous une forme plus faible.

## Consequences

Qui a le mot de passe a le back-office. C'est le même arbitrage que celui déjà acté pour le lien magique — « qui contrôle la boîte mail contrôle le back-office », ni passkey ni second facteur — avec un secret de moins bonne nature : il ne tourne pas tout seul, il peut être partagé, il ne dit pas qui est entré. Rotation de `ADMIN_SESSION_SECRET` = déconnexion immédiate de toutes les sessions ouvertes ; c'est le seul mécanisme de révocation qu'il y a.

Le remplacement est **un seul seam** : `src/server/services/admin-auth.service.ts`. `requireAdmin()`, `isAdmin()` et les deux actions de session gardent leur signature, `src/server/auth/admin-session.ts` disparaît, et aucune page ni aucune action de curation ne change. Le test d'architecture, lui, survit tel quel et continue de garder la règle.

Le verrou anti-devinage est en mémoire et repart à zéro au redémarrage du processus. Acceptable pour un dispositif censé rendre le devinage lent plutôt qu'impossible, et aligné sur la décision « en mémoire tant qu'il y a un réplica ». Le jour du second réplica, il migre avec le rate limit du lien magique, pas avant.

`ADMIN_PASSWORD` et `ADMIN_SESSION_SECRET` s'ajoutent aux variables que le déploiement doit fournir. Elles sont dans `.env.example` avec la conséquence écrite noir sur blanc : sans elles, `/admin` refuse tout le monde.
