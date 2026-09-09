# Spécifications fonctionnelles — Quiz de parcours footballistiques

Version web, successeur de PPFQ (Pro Player Football Quiz).
Document niveau utilisateur : décrit ce que voit et fait le joueur, sans considération technique.

---

## 1. Concept

Le joueur doit identifier un footballeur à partir de son parcours en clubs. Le parcours est affiché intégralement dès le départ : c'est l'énigme elle-même, pas une information à déverrouiller. Ce qui se dévoile progressivement, ce sont les informations périphériques (époque, nationalité, statistiques).

Le jeu est quotidien : une nouvelle grille chaque jour, la même pour tous les joueurs.

---

## 2. La grille du jour

Chaque jour propose **trois joueurs à trouver**, présentés dans un ordre de difficulté croissante :

| Position | Nom | Profil |
|---|---|---|
| 1 | L'échauffement | Parcours reconnaissable, joueur notoire |
| 2 | Le titulaire | Le cœur du jeu, demande de la réflexion |
| 3 | La légende | Parcours atypique ou joueur pointu |

**Règles de présentation**

- Les trois joueurs sont accessibles immédiatement, sans déverrouillage séquentiel. Bloquer sur le premier ne prive pas du reste de la journée.
- Les trois fonctionnent avec **exactement la même mécanique** : mêmes essais, mêmes indices, même ordre de dévoilement. Seule la difficulté du joueur à trouver change.
- La grille est identique pour tous les utilisateurs, et change à minuit (heure de Paris).

---

## 3. Mécanique de jeu

### Ce qui est affiché au départ

Le parcours complet du joueur, dans l'ordre chronologique :

- Le nom de chaque club, du premier au dernier
- L'annotation **(prêt)** à côté des clubs concernés
- Rien d'autre : ni dates, ni nationalité, ni statistiques

Un joueur passé deux fois par le même club voit ce club apparaître deux fois, à sa place dans la chronologie, avec l'annotation de prêt sur le passage concerné.

Le nombre de clubs est donc visible d'emblée, par construction.

### Les essais

Le joueur dispose de **6 essais** par footballeur. Il saisit un nom ; à chaque erreur, une information supplémentaire se dévoile.

| Après | Information dévoilée |
|---|---|
| — (départ) | Parcours complet, clubs seuls, prêts annotés |
| 1ʳᵉ erreur | Décennie de début de carrière |
| 2ᵉ erreur | Durée passée dans chaque club (en saisons) |
| 3ᵉ erreur | Nationalité |
| 4ᵉ erreur | Nombre de matchs joués par club |
| 5ᵉ erreur | Nombre de buts marqués par club |
| 6ᵉ erreur | Fin de partie : la réponse est révélée |

Un tour passé compte comme une erreur dans ce tableau.

Les informations dévoilées restent affichées jusqu'à la fin de la partie.

### Passer son tour

À tout moment, le joueur peut **passer** : l'indice suivant se dévoile sans qu'il ait à proposer un nom. Passer **consomme un essai**, exactement comme une erreur — sinon les six indices s'obtiendraient gratuitement en six clics.

C'est le filet de sécurité du joueur bloqué, et il remplace le coup de pouce initialement envisagé.

### La saisie des réponses

- Le joueur tape quelques lettres et **choisit un footballeur dans une liste de suggestions**. Un essai est donc toujours un footballeur existant.
- La liste couvre l'ensemble des footballeurs professionnels, très au-delà de ceux qui sont jouables : les suggestions ne révèlent donc rien.
- Les résultats sont classés par notoriété, et les surnoms usuels (« Chicharito », « Pelé ») retrouvent le bon footballeur.
- Chaque essai consomme un essai, y compris un footballeur **déjà proposé** sur la même énigme.

---

## 4. Les thèmes

Une grille peut porter un **thème**, qui qualifie la journée entière et est **annoncé explicitement** au joueur.

| Thème | Ce qu'il annonce |
|---|---|
| Standard | Rien de particulier. C'est le cas par défaut |
| Rétro | Les trois carrières sont anciennes. Sans les dates au départ, rien ne le signalerait et la devinette serait injuste |
| Mercato | Les trois footballeurs sont récemment transférés ou dans l'actualité |
| Hors-série | Grille exceptionnelle liée à un vrai événement |

**Aucun thème n'est attaché à un jour de la semaine.** Un thème peut être posé n'importe quand, un vendredi peut être parfaitement classique, et rien ne vérifie automatiquement que les footballeurs choisis correspondent au thème annoncé : c'est l'admin qui en répond.

Le reste de la mécanique est strictement inchangé quel que soit le thème : mêmes 6 essais, même échelle d'indices.

---

## 5. Progression

### La série (streak)

- La série compte les jours consécutifs où le joueur a trouvé **le titulaire** (position 2).
- L'échauffement et la légende n'affectent pas la série. Un joueur ne perd pas 60 jours de série sur une légende impossible.
- Un jour manqué remet la série à zéro.

### Le carton plein

Trouver les trois footballeurs du jour donne un **carton plein**, avec son propre compteur, indépendant de la série.

### Statistiques personnelles

Le joueur voit : nombre de cartons pleins, nombre de parties jouées, répartition des réussites par nombre d'essais, et son taux de réussite global.

Ces statistiques sont affichées au joueur à titre informatif. Elles n'entrent pas dans l'équilibrage du jeu.

---

## 6. Compte utilisateur

**Le jeu est intégralement jouable sans inscription.** Aucun mur à l'entrée.

| Sans compte | Avec compte |
|---|---|
| Grille du jour complète | Grille du jour complète |
| Statistiques conservées sur l'appareil | Statistiques conservées entre appareils |
| Archive limitée aux sept derniers jours | **Archive complète** |

L'inscription est proposée au moment où elle a une valeur évidente : après plusieurs jours de jeu, ou lorsque le joueur tente d'accéder à l'archive. La progression déjà réalisée sans compte est reprise à l'inscription.

---

## 7. L'archive

Permet de rejouer les grilles des jours passés.

Les **sept derniers jours sont ouverts à tous** ; au-delà, il faut un compte.

- Les grilles jouées en archive **n'alimentent pas les compteurs de la grille du jour** (cartons pleins et série). Sinon une série de 200 jours se reconstruit en une soirée.
- Les statistiques d'archive sont comptées séparément.
- Une grille déjà jouée reste consultable, mais non rejouable pour le score.

---

## 8. Partage

À la fin de la grille du jour, le joueur peut copier un résumé de son résultat : trois lignes (une par footballeur), chacune représentant le nombre d'essais consommés, sous forme de symboles. Le résumé ne révèle aucun nom.

---

## 9. Formats en réserve

Prévus au concept, hors périmètre de la première version — mais le champ thème les accueille sans changement (§4).

**Le mercato** — à activer quand le catalogue de transferts récents sera suffisant.

**Le hors-série** — lié à un vrai événement (tirage au sort, finale, ouverture du mercato). Il **remplace** la grille du jour. Sans jour fixe et sans annonce à l'avance : c'est ce qui préserve l'effet de surprise.

---

## 10. Points tranchés

| Point | Arbitrage |
|---|---|
| **Saisie des réponses** | Recherche avec sélection. Un extract quasi exhaustif des footballeurs existe, ce qui lève l'objection initiale : la liste couvre bien plus que les footballeurs jouables |
| **Réponse non reconnue** | Le cas disparaît : on ne peut proposer qu'un footballeur de la liste |
| **Répétition d'un nom déjà tenté** | Consomme un essai |
| **La série** | Retenue, sur le titulaire (position 2) uniquement |
| **Le coup de pouce** | Écarté, remplacé par le bouton « passer » qui consomme un essai |
| **Profondeur d'archive ouverte** | Les sept derniers jours sont ouverts à tous |

## 11. Arbitrages actés

- **Poste des joueurs** : non nécessaire, l'échelle d'indices s'en passe.
- **Estimation de la difficulté** : manuelle, relative à la journée. Aucune dette de maintenance.
- **Taux de réussite** : suivi et affiché au joueur dans ses statistiques. Il n'entre pas dans l'équilibrage.
- **Carrières mono-club** : pas de traitement particulier.
- **Prêts** : information disponible, simplement annotée à côté du club dans l'interface.
- **Thèmes** : libres, sans jour imposé et sans contrôle automatique. Mécanique et nombre d'essais identiques quel que soit le thème.
- **Retour sur mauvaise réponse** : écarté, pas d'indication de points communs.
- **Fuseau horaire de référence** : Europe/Paris.
- **Périmètre du parcours** : carrière senior en club uniquement. Ni équipes de jeunes, ni réserves, ni sélections nationales.
- **Nationalité** : une seule, la nationalité sportive, même pour un binational.
- **Grille non terminée** : une grille du jour laissée en cours bascule en archive au changement de jour et compte comme un échec. Elle ne se reprend pas le lendemain.
- **Nom des clubs** : le nom actuel, pas le nom d'époque.
