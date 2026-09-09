# Un chevauchement n'est pas une passation

L'écran de curation signale visuellement « deux passages qui se chevauchent » (#5), parce que c'est le seul cas où l'ordre du parcours est réellement ambigu (`docs/stack-technique.md` §6). Restait à décider ce que « se chevaucher » veut dire, et la définition naïve ne marche pas.

Les années sont des entiers, pas des dates, et un passage couvre `[start_year, end_year]` **bornes comprises** — c'est ce que dit le calcul de durée du modèle, `end - start + 1`. Prise au mot, l'intersection de deux intervalles fermés fait de **toute carrière normale** une carrière chevauchée : Cannes 1988-1992 puis Bordeaux 1992-1996 partagent 1992, comme les trois passages suivants de Zidane partagent chacun leur charnière. Une alerte qui se déclenche sur les quatre lignes de tout le monde n'est pas une alerte, c'est du bruit — et le bruit ferait manquer le doublon de la source, qui est exactement ce qu'on veut voir.

**Une passation n'est donc pas un chevauchement** : un club qui finit l'année où le suivant commence est la forme ordinaire d'un transfert d'été, et les années se touchent sans que rien ne se superpose.

**L'exclusion s'arrête là où les deux passages ne se croisent pas.** C'est la nuance qui coûte une ligne et sans laquelle la règle rate sa cible :

- même année de début — un prêt qui part la saison où le contrat est signé : **chevauchement** ;
- même année de fin : **chevauchement** ;
- un passage **imbriqué** dans l'autre — 1990-1992 à côté de 1992-1992 : **chevauchement**, personne n'a passé la main à personne, et c'est précisément la forme prêt-dans-son-contrat ;
- plus d'une année en commun : **chevauchement** ;
- exactement une année en commun, et les deux passages se croisent : **passation**, rien n'est signalé.

Un passage en cours (`end_year` nul) court jusqu'à l'infini : tout ce qui commence après le chevauche — une carrière en cours ne peut pas avoir été suivie d'un autre club — et deux passages laissés ouverts se chevauchent l'un l'autre, ce qui est la situation la plus ambiguë qui soit puisque leur ordre ne tient plus qu'à leur `id`.

## Consequences

La règle est pure, dans `src/server/domain/curation.ts`, et testée comme une matrice de cas : c'est le genre de règle dont chaque clause vient d'un contre-exemple réel, et une clause perdue au refactoring ne se voit pas à l'œil.

Vérifiée contre la vraie donnée : Zidane (quatre passages, quatre charnières) ne déclenche rien ; Cantona en déclenche six sur sept — trois prêts, et un transfert en cours de saison 1992 vers Manchester United — ce qui est honnête, sa carrière est réellement pleine de superpositions. Messi importé fait apparaître le chevauchement Barcelone B / Barcelone.

Ce que l'alerte ne voit pas, et ne verra jamais : le **trou**. Les années de Cantona à l'OM sont absentes de la source, donc il n'y a rien à faire se chevaucher, et le parcours est complet et faux. Le seul garde-fou reste le lien Wikipédia en haut de l'écran.

L'écart avec l'arithmétique de la durée est assumé : `end - start + 1` compte 1992 dans les deux passages d'une passation, et l'alerte n'en signale aucun. Les deux répondent à des questions différentes — combien de saisons afficher au joueur, et où l'admin doit poser les yeux — et le modèle qualifie déjà la durée d'« approximation assumée ».
