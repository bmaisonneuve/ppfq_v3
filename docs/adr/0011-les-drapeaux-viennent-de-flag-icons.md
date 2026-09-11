# Les drapeaux viennent de `flag-icons`, pas de Wikidata `P41`

Tout le catalogue vient de Wikidata, et l'import de nationalité lit déjà `P1532` et `P27` sur l'item du pays. Prendre `P41`, « image du drapeau », dans la même requête était le choix par défaut : une source de moins, une dépendance de moins, et les fichiers sont sur Commons, donc libres.

Mesuré sur les dix pays qui comptent pour ce jeu, `P41` ne tient pas.

**La propriété est multivaluée et historique.** La France répond **dix** drapeaux, dont une bannière du XII<sup>e</sup> siècle en première valeur ; l'Espagne dix aussi, la Serbie sept, l'URSS six. Choisir parmi elles demande de lire les qualificatifs `P580`/`P582` ou le rang préféré, c'est-à-dire d'écrire une règle dont le mode de défaillance est un drapeau faux.

**Elle répond parfois à côté.** L'item Tchécoslovaquie donne `Flag of the Czech Republic.svg`. C'est ici historiquement juste — la Tchéquie a gardé le drapeau tchécoslovaque — mais rien dans la donnée ne le dit, et une source qui a raison par coïncidence n'est pas une source.

**Et elle manque précisément là où le football a besoin d'elle.** L'Irlande du Nord n'a **aucun `P41`** : elle n'a pas de drapeau officiel depuis 1973. Or les quatre nations britanniques sont exactement la raison pour laquelle la nationalité sportive prime sur la citoyenneté (`docs/modele-donnees.md` §3). La source se tait sur le cas qui justifie le reste du dispositif.

Ces trois échecs tombent tous du même côté : ils produisent une image plausible et fausse, jamais une absence. Or l'indice 3 tombe au milieu d'une partie, et le modèle a déjà tranché cet arbitrage — **un mauvais drapeau est une énigme fausse, un drapeau manquant n'est qu'un footballeur non programmable**.

## `flag-icons`, parce que son jeu de codes est le nôtre

Le paquet (MIT, 271 fichiers) livre **un** drapeau courant par code, et ses codes sont exactement ceux que produit la chaîne alpha-2 → subdivision → alpha-3 : les pays, plus `gb-eng`, `gb-sct`, `gb-wls`, `gb-nir`. Il donne à l'Irlande du Nord l'Ulster Banner, qui est ce que le football utilise — l'IFA joue sous ce drapeau — et qu'aucune source ISO ne fournira jamais. Tous les fichiers sont dessinés sur un viewBox `0 0 640 480`, donc le cadre est uniforme sans qu'on ait à le normaliser.

La curation est faite, par des humains, en amont. C'est tout ce qu'on lui demande.

**Le trou est assumé et nommé** : les pays disparus. `YUG`, `CSK` et `SUN` sont des codes que le paquet n'a jamais eus, et ce sont précisément les nationalités qu'une grille rétro veut. Ils vivent en SVG du domaine public dans `scripts/flags/`, repris de Commons, et le répertoire l'emporte sur le paquet — c'est aussi par là qu'on corrige un rendu qui déplairait. Un code sans fichier nulle part n'est pas une erreur du seed : c'est une ligne de son rapport, et un pays qu'un admin doit traiter.

## Rendus une fois, jamais servis en SVG

Le seed rasterise en WebP 192×144 et stocke le rendu, jamais la source. Deux raisons, et la seconde suffirait.

**Un SVG est du balisage exécutable**, et celui-ci serait servi depuis notre propre origine. La même règle vaut pour les blasons de clubs et pour la même raison.

**Le vecteur est un mauvais format à cette taille.** Le SVG de la Serbie fait 182 Ko à cause d'un blason que personne ne distingue à 48 px ; rendu, il fait 4 Ko. La France passe de 231 octets à 88. Sur l'ensemble : 1,3 Ko de médiane, 12 Ko au pire, **491 Ko le tout**.

L'encodage essaie le sans perte et le avec perte et garde le plus petit. Ce n'est pas de l'indécision : un tricolore est de l'aplat, où le sans perte gagne d'un ordre de grandeur, tandis qu'un drapeau à blason est une photographie du point de vue de l'encodeur.

L'image est **ajustée** dans le cadre 4:3 et non étirée à lui. Les 271 fichiers du paquet le remplissent déjà exactement ; les trois drapeaux historiques sont à leur ratio propre — la Yougoslavie est en 2:1 — et sont centrés sur des bandes transparentes. Un cadre commun aligne une liste ; l'ajustement garde l'étoile yougoslave ronde.

## Le rendu est de l'outillage, pas de l'application

`sharp` est une `devDependency` et ne vit que dans `scripts/flags.ts`, à côté du chargeur de référentiel et pour la même raison : c'est un amorçage qui lit des fichiers sur disque une fois, au déploiement, comme une migration. L'application ne fait jamais que **lire** un drapeau. C'est ce qui garde vraie l'affirmation « aucune dépendance de traitement d'image dans l'app », que la chaîne des blasons tient autrement, en demandant ses vignettes au rendu de Wikimedia.

## Consequences

Le seed est à lancer après un import qui crée des nationalités — `pnpm db:seed-flags`, sans effet la deuxième fois. Une nationalité sans drapeau n'est aujourd'hui bloquée par rien : quand l'indice 3 existera, elle devra entrer dans le contrôle avant programmation de `docs/modele-donnees.md` §4, au même titre que les matchs et les buts.

Une montée de version de `flag-icons` ne se propage pas toute seule : une ligne existante n'est jamais réécrite, son drapeau étant curé. `--force` est la façon délibérée de repasser dessus, et elle laisse derrière elle les anciennes lignes de `nationality_flags` que plus personne ne référence. Rien ne les ramasse pour l'instant ; à ~2 Ko la ligne, le jour où cela compte est loin.

Le paquet est une `devDependency` : rien de lui n'entre dans le bundle, mais `pnpm install` le tire en CI. Sa notice MIT est citée dans l'en-tête de `scripts/flags.ts`, et c'est l'endroit à ne pas perdre le jour où le fichier bouge.
