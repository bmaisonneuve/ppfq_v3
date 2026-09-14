# Le compte : nos portes devant Better Auth, et la reprise à chaque requête

Better Auth est acté depuis `docs/stack-technique.md` §4bis, plugins `magicLink`
et `emailOTP`. Ce ticket l'installe, et trois choses n'y ressemblent pas à ce que
sa documentation propose. Elles sont ici parce qu'aucune n'est un détail
d'implémentation : chacune protège une promesse des specs.

## Aucune route de Better Auth n'est montée

Le §4 annonçait `app/api/auth/[...all]/route.ts`. Il n'existe pas. Le compte a
quatre portes à nous — `POST /api/account/{state,request,sign-in,sign-out}` —
qui appellent `auth.api.*` en direct, et le plugin `nextCookies()` pose les
cookies par `next/headers`.

Trois raisons, dont la première suffirait :

- **la limite de fréquence des specs est par IP _et_ par adresse email.** Celle
  de Better Auth compte par chemin. Sans la seconde dimension on bombarde la
  boîte d'un tiers en tapant son adresse, et c'est exactement celle qui manque ;
- **le callback du lien magique doit être GET → confirmation → POST.** Celui de
  Better Auth consomme le jeton en GET, ce qui le rend vulnérable aux scanners
  de liens — le second des deux problèmes que le §4bis a identifiés ;
- **la règle de layering** veut que `app/` n'atteigne le serveur que par un
  service. Un `[...all]` qui réexporte le handler la contournerait sans rien
  apporter : il n'y a pas de client Better Auth dans ce jeu, donc personne pour
  appeler ces chemins.

Ce que Better Auth reste, du coup : le magasin des comptes, des sessions et des
jetons, la génération et le hachage du code et du jeton, l'usage unique, le
cookie de session signé, et les 180 jours glissants. C'est-à-dire tout ce qu'on
aurait mal écrit. Ce qu'il n'est pas : la politique.

Conséquence à connaître : `auth.api.*` lève sur un refus au lieu de rendre une
valeur, et un refus n'est pas une panne. Les services attrapent et traduisent en
`AccountRefusal` — un mot, pas un message d'une bibliothèque tierce.

### L'envoi du code est à nous aussi, et il a fallu le découvrir

`sendVerificationOTP` — le chemin évident, celui de la documentation — passe le
rappel d'envoi par `runInBackgroundOrAwait`, qui **attrape l'exception, la
journalise et répond quand même `{ success: true }`**. Un relais SMTP absent ou
en panne serait donc rapporté au joueur comme un envoi réussi, et il attendrait
un code qui n'existe pas. Sans mot de passe, c'est l'impossibilité de se
connecter, annoncée comme une réussite : la panne exacte que
`server/email/mailer.ts` existe pour rendre visible.

La demande appelle donc `createVerificationOTP` — un endpoint `serverOnly` qui
écrit la même ligne de `verifications`, même identifiant, même hachage, même
échéance — et envoie l'email elle-même, ce qui lui rend l'échec. Le lien magique
n'a pas le problème : `signInMagicLink` attend `sendMagicLink` directement.

C'est la même frontière que le reste de cette ADR, trouvée une fois de plus au
même endroit : Better Auth fabrique et range le secret, il ne décide pas ce
qu'on répond quand le monde extérieur refuse.

Le rappel reste branché, parce que le plugin l'exige, et il envoie pour de bon :
un chemin futur qui l'emprunterait doit poster un email plutôt que tomber dans le
vide. `test/services/account.service.test.ts` tient la règle en pointant le
relais sur un port mort — la demande est refusée, et aucun message n'est parti.

## La reprise de progression se rejoue à chaque requête personnelle

La forme attendue était un `databaseHook` sur la création de session. Elle est
ailleurs : `resolvePlayer` reçoit le compte de la requête en cours, et la
question « quel joueur est-ce ? » a **une** réponse quand il y a un compte —
celui que `auth_user_id` désigne.

Ce que ça change tient en une phrase : la reprise cesse d'être un geste de
connexion qui peut manquer, pour devenir un invariant. Un hook ne s'exécute
qu'une fois, donc il ne s'est pas exécuté quand il a raté ; et il ne répare rien
des cas d'après — un cookie effacé, un appareil de plus, un navigateur qui n'a
jamais joué. Un `UPDATE … WHERE auth_user_id IS NULL` est idempotent par
construction : le premier appel lie, les suivants relisent. C'est le critère
« la rejouer ne duplique ni ne détruit rien » obtenu par la forme plutôt que par
une précaution.

Trois sources, dans cet ordre, et l'ordre est la décision :

1. **le joueur que le compte porte déjà.** Une fois lié, c'est lui, et rien ne le
   remplace ;
2. **`pending_claims`**, écrite dans l'onglet du jeu au moment de la demande.
   Elle passe devant le cookie présenté parce que le navigateur qui ouvre un lien
   magique a souvent une identité anonyme à lui, qui ne porte rien ;
3. **le cookie présenté**, pour qui demande un code sans avoir encore joué.

Et le cookie du joueur est **réécrit** à la connexion. C'est la moitié qu'on
oublie : la reprise vient peut-être de désigner une autre ligne `players` que
celle du cookie — celle qui portait la partie, restée dans l'onglet du jeu — et
sans réécriture la requête suivante repartirait sur l'ancienne. C'est aussi
pourquoi la connexion passe par **la file cliente** des trois portes du jeu :
une requête d'état qui reviendrait après elle reposerait la valeur d'avant.

Le prix est une lecture de session sur le chemin du pic. Il est presque nul et
pour une raison mesurable : sans cookie de session Better Auth ne touche pas la
base, et la quasi-totalité du trafic n'en porte pas — le jeu est entièrement
jouable sans compte (specs §6). Avec, le cache de cookie signé de cinq minutes
évite l'aller-retour la plupart du temps.

## Le rôle d'admin est une variable d'environnement

L'ADR-0006 annonçait que le compte de ce ticket porterait le rôle. Il le porte,
et le rôle n'est pas une colonne : `ADMIN_EMAILS` liste les adresses qui ouvrent
`/admin`.

Une colonne `role` aurait ajouté un état à administrer, donc un écran pour le
changer, donc une façon de plus de se donner le rôle. Une variable n'est
modifiable que par qui déploie, ce qui est exactement la population visée. Le
prix est qu'ajouter un admin demande un redéploiement ; il y en a un, et le §6
n'en prévoit pas d'autre.

**Une adresse qui n'est pas dans la liste ne reçoit rien et ne l'apprend pas.**
C'est le seul endroit du projet où l'on refuse sans le dire, et la différence
avec le jeu est nette : côté jeu, demander un code pour une adresse inconnue
crée un compte, donc il n'y a rien à révéler ; ici, envoyer un code apprendrait
à celui qui essaie des adresses laquelle est celle de l'admin.

## Consequences

`ADMIN_PASSWORD` et `ADMIN_SESSION_SECRET` disparaissent, avec
`src/server/auth/admin-session.ts` et son test. `BETTER_AUTH_SECRET`, `APP_URL`,
`MAIL_SMTP_URL`, `MAIL_FROM` et `ADMIN_EMAILS` s'ajoutent à ce que le
déploiement doit fournir, et le comportement sans elles est écrit dans
`.env.example` : le compte reste fermé, `/admin` refuse tout le monde, aucun
email ne part. Le verrou anti-devinage en mémoire de l'ADR-0006 disparaît aussi
— la limite de fréquence du compte le remplace, en mieux, parce qu'elle compte
aussi par adresse.

`session.expiresIn` est à 180 jours pour l'admin comme pour le joueur, là où
l'ADR-0006 avait mis sept jours. Ce n'est plus le même arbitrage : sept jours
compensaient un secret partagé qui ne tourne pas ; le code à six chiffres, lui,
ne se partage pas, et se reconnecter coûte désormais un aller-retour par email.

**Un seul relais SMTP pour tous les environnements** — Mailpit en local,
Scaleway TEM en production — plutôt que l'API HTTP de Scaleway. Un seul chemin
de code, donc ce qui est exercé mille fois en local est ce qui tourne là-bas.
Ce que SMTP ne sait pas dire — statut d'un envoi, rebonds, `email_events` —
reste à faire et demandera l'API : c'est le sujet du ticket des jobs, pas de
celui-ci.

**La suite lit une vraie boîte mail.** Le code est haché en base exprès, donc il
n'y a pas d'autre façon honnête de le connaître que celle du joueur : ouvrir le
message. Mailpit est donc démarré par `pnpm test` comme Postgres l'est déjà, et
`test/services/account.service.test.ts` exerce la demande, le rendu du message,
le relais et le code tel qu'il arrive.

**La limite de fréquence est en mémoire**, comme le §4bis l'a décidé et tant
qu'il y a un réplica. Elle repart à zéro au redémarrage, et migrera le jour du
second réplica. Conséquence visible dans les tests : elle survit à la remise à
zéro de la base, donc chaque test part d'une adresse et d'une IP à lui.

**Le schéma est coupé en deux.** Les cinq tables du compte ont poussé
`src/server/db/schema.ts` au-delà du plafond de longueur ; le catalogue part
dans `catalogue-schema.ts`, réexporté. La coupure tombe juste parce que la
dépendance ne va que dans un sens — une énigme désigne un footballeur, et le
catalogue ne sait rien des grilles.
