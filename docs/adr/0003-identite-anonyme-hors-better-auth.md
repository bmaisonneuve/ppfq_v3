# L'identité anonyme est une table `players` à nous, pas le plugin `anonymous` de Better Auth

Un joueur — avec ou sans compte — est une ligne de `players`, identifiée par un UUID en cookie (`cookie_id`) et reliée à Better Auth par un `auth_user_id` nullable, renseigné à l'inscription. Le plugin `anonymous` de Better Auth ferait le travail en apparence, et a été écarté pour deux raisons.

D'abord il ouvre une **session d'authentification par visiteur** (180 jours d'expiration), soit des dizaines de millions de lignes pour des gens venus une fois. Ensuite, et c'est rédhibitoire, il **supprime la ligne anonyme après liaison** par défaut — ce qui effacerait exactement la progression que les specs promettent de reprendre à l'inscription.

## Consequences

La reprise de progression est un `UPDATE players SET auth_user_id`, pas une migration de données ni un merge `localStorage` ↔ base. Tout ce qui référence un joueur (`player_progress`, `player_stats`) pointe sur `players.id` et ne bouge pas à l'inscription.

Le cookie est **strictement nécessaire** au service demandé : pas de bandeau de consentement, 13 mois glissants, et la purge de `players` s'aligne sur cette durée. Contrainte qui en découle et qu'il ne faut pas casser plus tard : **aucun traceur analytique à cookie** sur le site, sinon le bandeau revient — et un joueur qui refuse perd sa progression.

Le cas du lien magique ouvert dans un autre navigateur reste à traiter séparément (`pending_claims`), le cookie n'étant alors pas présent au callback : c'est ce qui fait du code à 6 chiffres la voie principale, et du lien un simple raccourci pour ceux qui sont sur le même appareil.

> **Traité par [ADR-0014](./0014-le-compte-nos-portes-devant-better-auth.md).**
> `pending_claims` existe, elle est écrite **à la demande du code ou du lien** —
> dans l'onglet du jeu, où le cookie est encore là — et relue à la connexion.
> Et la reprise n'est pas le geste unique que ce paragraphe imaginait : c'est
> `resolvePlayer` qui, à **chaque** requête personnelle, répond « le joueur de
> ce compte » quand il y a un compte. Un `UPDATE … WHERE auth_user_id IS NULL`
> est idempotent, donc le rejouer ne coûte rien et le réparer n'a pas besoin
> d'un second mécanisme.
>
> Deux conséquences que ce document n'annonçait pas. Le **cookie du joueur est
> réécrit** à la connexion : la reprise peut désigner une autre ligne `players`
> que celle du cookie présenté, et sans cela la requête suivante repartirait sur
> l'ancienne. Et `players.auth_user_id` gagne une clé étrangère vers `users`, en
> `ON DELETE SET NULL` : supprimer un compte rend le joueur anonyme, il ne
> l'efface pas avec ses parties — ce qui est la même promesse que celle qui a
> écarté le plugin `anonymous`.
