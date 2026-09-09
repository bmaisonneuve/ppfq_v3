# Couverture Wikidata des carrières de footballeurs — FAITS MESURÉS

Endpoint : `https://qlever.dev/api/wikidata` (GET, `query` urlencodé, `Accept: text/csv`).
Snapshot QLever interrogé le 2026-09-09. Toutes les mesures via `p:P54 ?st . ?st ps:P54 ?club` (jamais `wdt:P54`).
Aucun repli sur query.wikidata.org n'a été nécessaire.

Préfixes utilisés dans toutes les requêtes ci-dessous (à préfixer à chaque requête) :

```sparql
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
```

---

## 0. Périmètre

| Mesure | Valeur |
|---|---|
| Footballeurs (`wdt:P106 wd:Q937857`) | **391 014** |
| dont ≥ 1 déclaration `p:P54` avec valeur | **262 332** (67,1 %) |
| Déclarations `p:P54` (tous rangs, avec valeur) | **1 110 217** |
| Déclarations `p:P54` sans valeur (novalue/somevalue) | 93 |
| Footballeurs sitelinks ≥ 5 / ≥ 10 / ≥ 20 / ≥ 40 | 116 319 / **45 549** / **16 135** / **3 025** |

```sparql
SELECT (COUNT(?p) AS ?c) WHERE { ?p wdt:P106 wd:Q937857 }
SELECT (COUNT(DISTINCT ?p) AS ?c) WHERE { ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club }
SELECT (COUNT(DISTINCT ?st) AS ?c) WHERE { ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club }
```

### Note méthodologique validée : compteur de sitelinks

`COUNT(?s schema:about ?p)` et `wikibase:sitelinks` donnent **exactement** le même résultat
(16 135 footballeurs à ≥ 20 par les deux méthodes ; Q615 → 225 par les deux).
`wikibase:sitelinks` est typé `xsd:int` : sur QLever, `FILTER(?sl >= 20)` renvoie **0** silencieusement.
Il faut écrire `FILTER(xsd:integer(?sl) >= 20)`. **Piège à retenir.**

```sparql
# méthode de référence (lente)
SELECT (COUNT(?p) AS ?c) WHERE {
  { SELECT ?p (COUNT(?s) AS ?sl) WHERE { ?p wdt:P106 wd:Q937857 . ?s schema:about ?p } GROUP BY ?p }
  FILTER(?sl >= 20) }
# méthode équivalente retenue (rapide)
SELECT (COUNT(?p) AS ?c) WHERE { ?p wdt:P106 wd:Q937857 ; wikibase:sitelinks ?sl . FILTER(xsd:integer(?sl)>=20) }
```

---

## 1. Couverture par déclaration — TOUTES les déclarations P54

Dénominateur : 1 110 217.

| Qualificateur | Déclarations | % |
|---|---|---|
| `pq:P580` (début) | 936 906 | 84,4 % |
| `pq:P582` (fin) | 842 112 | 75,9 % |
| `pq:P1350` (matchs) | 680 701 | 61,3 % |
| `pq:P1351` (buts) | 679 054 | 61,2 % |
| P1350 **et** P1351 | 674 992 | 60,8 % |
| **P580 + P1350 + P1351** | **674 198** | **60,7 %** |
| P580 + P582 + P1350 + P1351 | 663 305 | 59,7 % |

```sparql
-- gabarit ; <COND> vaut "" / "?st pq:P580 ?a ." / "?st pq:P582 ?e ." /
--   "?st pq:P1350 ?b ." / "?st pq:P1351 ?g ." / "?st pq:P580 ?a . ?st pq:P1350 ?b . ?st pq:P1351 ?g ."
SELECT (COUNT(DISTINCT ?st) AS ?cnt) WHERE {
  ?p wdt:P106 wd:Q937857 ; p:P54 ?st .
  ?st ps:P54 ?club .
  <COND>
}
```
`COUNT(DISTINCT ?st)` est obligatoire : plusieurs valeurs d'un même qualificateur sur une déclaration
gonfleraient un `COUNT(*)`. (Attention aussi : QLever refuse `?c` comme cible de `AS` si `?c` est déjà lié dans le corps.)

---

## 2. Même mesure restreinte par notoriété (sitelinks)

| Qualificateur | sl ≥ 10 | % | sl ≥ 20 | % | sl ≥ 40 | % |
|---|---|---|---|---|---|---|
| Déclarations P54 (total) | 297 138 | 100 % | 116 792 | 100 % | 26 460 | 100 % |
| `pq:P580` | 278 241 | 93,6 % | 111 538 | 95,5 % | 26 001 | 98,3 % |
| `pq:P582` | 249 871 | 84,1 % | 100 782 | 86,3 % | 24 231 | 91,6 % |
| `pq:P1350` | 217 965 | 73,4 % | 91 676 | 78,5 % | 24 138 | 91,2 % |
| `pq:P1351` | 217 724 | 73,3 % | 91 560 | 78,4 % | 24 115 | 91,1 % |
| **P580+P1350+P1351** | **216 553** | **72,9 %** | **91 241** | **78,1 %** | **24 070** | **91,0 %** |

```sparql
SELECT (COUNT(DISTINCT ?st) AS ?cnt) WHERE {
  ?p wdt:P106 wd:Q937857 ; wikibase:sitelinks ?sl ; p:P54 ?st .
  FILTER(xsd:integer(?sl) >= 20)          # 10 / 20 / 40
  ?st ps:P54 ?club .
  ?st pq:P580 ?a . ?st pq:P1350 ?b . ?st pq:P1351 ?g .
}
```

La notoriété améliore beaucoup la couverture : 60,7 % → 91,0 % pour le triplet complet.

---

## 4. Distinguer club senior / jeunes / réserve / sélection nationale

*(traité avant le §3 car le §3 en dépend)*

### 4.1 Ce qui marche : `P31/P279*` — mais avec un piège majeur

Distribution mesurée des `P31` des équipes citées en P54 (extrait, 45 premières classes) :

| Classe | Libellé | Déclarations | Équipes |
|---|---|---|---|
| Q476028 | association football club | 884 592 | 18 328 |
| Q135408445 | men's national association football team | 54 009 | 271 |
| Q847017 | sports club | 53 407 | 2 115 |
| Q103229495 | men's association football team | 49 081 | 182 |
| Q6979593 | national association football team | 46 770 | 718 |
| Q94579592 | defunct association football club | 43 391 | 974 |
| Q15944511 | association football team | 32 321 | 1 067 |
| Q20639856 | professional sports team | 13 603 | 30 |
| Q28140340 | women's association football team | 11 105 | 696 |
| … | | | |
| Q2412834 | **reserve team** | **3 746** | **155** |
| Q166118 | archives | 692 | 5 |
| Q17633526 | Wikinews article | 617 | 2 |

```sparql
SELECT ?type ?typeLabel (COUNT(DISTINCT ?st) AS ?stmts) (COUNT(DISTINCT ?club) AS ?teams) WHERE {
  ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club .
  ?club wdt:P31 ?type . ?type rdfs:label ?typeLabel . FILTER(LANG(?typeLabel)='en')
} GROUP BY ?type ?typeLabel ORDER BY DESC(?stmts) LIMIT 45
```

**PIÈGE MESURÉ** : `Q135408445` (« men's national association football team ») est une sous-classe de
`Q103229495` (« men's association football team ») qui est elle-même sous-classe de **`Q476028`**
(« association football club »). Donc `?club wdt:P31/wdt:P279* wd:Q476028` **inclut les sélections
nationales masculines**.

```sparql
ASK { wd:Q135408445 wdt:P279* wd:Q476028 }   # -> true  (!!)
ASK { wd:Q6979593    wdt:P279* wd:Q476028 }  # -> false
ASK { wd:Q2412834    wdt:P279* wd:Q476028 }  # -> false
```

### 4.2 Mesure des trois critères candidats

| Règle | Déclarations | % de 1 110 217 |
|---|---|---|
| `?club wdt:P31 wd:Q476028` (exact) | 884 592 | 79,7 % |
| `?club wdt:P31/wdt:P279* wd:Q476028` | 1 002 961 | 90,3 % |
| … dont en réalité des sélections nationales | **54 010** | 4,9 % |
| `?club wdt:P31/wdt:P279* wd:Q6979593` (**national**) | **121 845** | **11,0 %** |
| `P31` exact Q476028 **∩** national | **0** | 0 % |
| ni club (P279*) ni national | 39 421 | 3,6 % |
| équipe sans aucun `P31` | 174 | 0,02 % |
| **CLUB = P279*Q476028 MOINS national** | **948 951** | **85,5 %** |

Cohérence : 948 951 + 121 845 + 39 421 = 1 110 217 ✔

```sparql
-- national
SELECT (COUNT(DISTINCT ?st) AS ?cnt) WHERE {
  ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club .
  ?club wdt:P31/wdt:P279* wd:Q6979593 }
-- contamination
SELECT (COUNT(DISTINCT ?st) AS ?cnt) WHERE {
  ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club .
  ?club wdt:P31/wdt:P279* wd:Q6979593 . ?club wdt:P31/wdt:P279* wd:Q476028 }
-- CLUB (définition retenue, dite "CLUB-STRICT")
SELECT (COUNT(DISTINCT ?st) AS ?cnt) WHERE {
  ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club .
  ?club wdt:P31/wdt:P279* wd:Q476028 .
  FILTER NOT EXISTS { ?club wdt:P31/wdt:P279* wd:Q6979593 } }
```

**VERDICT SÉLECTION NATIONALE : `?club wdt:P31/wdt:P279* wd:Q6979593` fonctionne et est fiable.**
Il capture les A, les U15→U23, les olympiques, les « B », les féminines (toutes ces classes ont
`P279` remontant à Q6979593), soit 121 845 déclarations (11,0 %). Recoupement nul avec `P31` exact Q476028.
Le critère à NE PAS utiliser seul est `P31/P279* Q476028` (4,9 % de faux positifs = sélections).

**VERDICT CLUB SENIOR : `P31` exact `Q476028` est précis mais insuffisant en rappel.**
Contre-exemple mesuré : **FC Barcelona (Q7156) n'est PAS `P31 Q476028`** — ses `P31` sont
Q103229495 / Q10651067 (representation team) / Q20639856 (professional sports team).
Les 39 421 déclarations « ni club ni national » sont majoritairement de vrais clubs seniors
mal typés : sports club 12 735, association football team 10 593, women's association football team 7 839,
college sports team 6 054, multisports club 4 007 — et du bruit franc (rugby 777, cricket 391,
handball 302, ice hockey 320, « archives », « Wikinews article »).

### 4.3 Équipe réserve : AUCUN critère fiable — c'est le point faible

Les équipes réserve sont typées « association football club » comme les seniors.
Contre-exemple mesuré chez Messi : `FC Barcelona Atlètic` (Q10467) est bien `P31 = reserve team`,
mais `FC Barcelona C` (Q2346842) est `P31 = association football club` **uniquement**.

Trois signaux mesurés, sur les 948 951 déclarations CLUB :

| Signal | Déclarations | % de CLUB |
|---|---|---|
| A. `?club wdt:P31/wdt:P279* wd:Q2412834` (reserve team) | 3 145 | 0,33 % |
| B. `?club (wdt:P361\|wdt:P749) ?par . ?par P31/P279* Q476028` (équipe rattachée à un club parent) | 7 996 | 0,84 % |
| C. libellé anglais matchant ` II$`,` B$`,` C$`,`Reserve`,`youth`,`U-1x`,`U-2x`,`Amateure`,`Atlètic`,`Castilla`,`^Jong ` | 11 062 | 1,17 % |
| A∩B / A∩C / B∩C | 2 366 / 2 224 / 4 388 | |
| **Union A∪B∪C (encadrement)** | **13 225 – 15 449** | **1,4 – 1,6 %** |

L'union exacte n'est pas calculable : A∩B∩C et la requête `UNION`/`OR-of-EXISTS` **dépassent le
timeout de 30 s de QLever**. L'encadrement vient de l'inclusion-exclusion avec A∩B∩C ∈ [0 ; 2 224].

```sparql
-- signal B, le plus intéressant qualitativement
SELECT ?cl (COUNT(DISTINCT ?st) AS ?c) WHERE {
  ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club .
  ?club wdt:P31/wdt:P279* wd:Q476028 .
  FILTER NOT EXISTS { ?club wdt:P31/wdt:P279* wd:Q6979593 }
  ?club (wdt:P361|wdt:P749) ?par . ?par wdt:P31/wdt:P279* wd:Q476028 .
  ?club rdfs:label ?cl . FILTER(LANG(?cl)='en')
} GROUP BY ?cl ORDER BY DESC(?c) LIMIT 25
```
Top du signal B (précision correcte à l'œil) : Athletic Bilbao B 487, **IFK Norrköping FK 486 (faux positif :
section football d'un club omnisport)**, FC Barcelona Atlètic 401, Real Madrid Castilla 392,
**Örgryte IS Fotboll 349 (faux positif)**, Real Sociedad B 313, FC Bayern Munich II 281, Jong Ajax 146,
Jong PSV 111, **Paris Saint-Germain Féminine 115 (faux positif : équipe féminine senior)**.

**Conclusion §4.3 : 1,4–1,6 % des passages « club » sont identifiables comme réserve. La prévalence
réelle est certainement bien supérieure (tout joueur allemand/espagnol formé au pays a un passage
« II » / « B »). Aucun critère structurel fiable n'existe ; le libellé est le meilleur des trois mais
il est linguistiquement fragile et bruité.**

### 4.4 Équipe de jeunes : quasi absente de P54

Vérifié sur les 5 joueurs du §6 : **aucun** n'a de passage en équipe de jeunes dans P54.
Messi commence à FC Barcelona C (2003) — Newell's Old Boys 1995-2000 et la Masia 2000-2003 sont absents.
Zidane commence à AS Cannes (1989). Cantona à AJ Auxerre (1983, ses années jeunes absentes).
Ronaldinho à Grêmio (1998). Cristiano Ronaldo au Sporting CP (2002).
Le seul marqueur explicite existant, `pq:P1642 = wd:Q1711289` (« youth association football »),
n'apparaît que sur **385** déclarations (0,03 %).

**Le problème « jeunes » n'existe donc pratiquement pas dans P54. Le problème est la RÉSERVE.**

---

## 3. Complétude PAR JOUEUR (la mesure qui compte)

Définition du passage : **CLUB-STRICT** (§4.2) = `P31/P279* Q476028` moins sélections nationales.
Un joueur est « complet » si **tous** ses passages club portent `P580` + `P1350` + `P1351`.

| Cohorte | ≥ 3 passages club | dont TOUS complets | % | (< 3 passages) |
|---|---|---|---|---|
| Tous footballeurs | 123 294 | **27 510** | **22,3 %** | 126 328 |
| sitelinks ≥ 10 | 30 813 | **9 149** | **29,7 %** | 12 267 |
| sitelinks ≥ 20 | 12 026 | **4 854** | **40,4 %** | 3 557 |
| sitelinks ≥ 40 | 2 484 | **1 683** | **67,8 %** | 420 |

```sparql
SELECT ?bucket (COUNT(?p) AS ?players) WHERE {
  { SELECT ?p (COUNT(DISTINCT ?st) AS ?n) (COUNT(DISTINCT ?stok) AS ?nok) WHERE {
      ?p wdt:P106 wd:Q937857 ; wikibase:sitelinks ?sl ; p:P54 ?st .
      FILTER(xsd:integer(?sl) >= 20)                      # retirer ces 2 lignes pour "tous"
      ?st ps:P54 ?club .
      ?club wdt:P31/wdt:P279* wd:Q476028 .
      FILTER NOT EXISTS { ?club wdt:P31/wdt:P279* wd:Q6979593 }
      OPTIONAL { ?st pq:P580 ?a . ?st pq:P1350 ?b . ?st pq:P1351 ?g . BIND(?st AS ?stok) }
    } GROUP BY ?p }
  BIND(IF(?n >= 3, IF(?n = ?nok, 'ge3_complete', 'ge3_incomplete'), 'lt3') AS ?bucket)
} GROUP BY ?bucket
```

### 3.1 Variantes de robustesse

| Variante | tous | sl ≥ 20 | sl ≥ 40 |
|---|---|---|---|
| CLUB-STRICT, P580+P1350+P1351 (référence) | 27 510 | 4 854 | 1 683 |
| + `P582` sur tous les passages sauf au plus un (club actuel) | 27 268 | 4 748 | 1 650 |
| + contrôles de vraisemblance (aucun buts > matchs) | **26 987** | **4 753** | **1 651** |
| CLUB-BROAD (Q476028 ∪ Q847017 ∪ Q15944511 ∪ Q13580678, moins national) | 26 573 | 4 782 | 1 675 |

Exiger `P582` ne coûte quasiment rien (−0,9 %) : la date de fin est presque toujours là quand
le triplet est là. Le choix de la définition de « club » ne change le résultat que de ±3 %.
**Le chiffre est donc robuste : ~27 000 footballeurs, dont ~4 800 à sl ≥ 20 et ~1 650 à sl ≥ 40.**

### 3.2 Plancher mesuré sur les passages MANQUANTS

Une carrière « complète » au sens des qualificateurs peut quand même avoir un club qui manque.
Mesure sur les carrières entièrement closes (≥ 3 passages, tous avec P580+P582+P1350+P1351) :
un trou est détecté si Σ(durées) < (max(fin) − min(début)) − 1.

| Cohorte | Carrières closes complètes | avec trou ≥ 2 ans | % |
|---|---|---|---|
| sl ≥ 20 | 3 650 | **785** | **21,5 %** |
| sl ≥ 40 | 1 143 | **183** | **16,0 %** |

```sparql
SELECT ?bucket (COUNT(?p) AS ?players) WHERE {
 { SELECT ?p (COUNT(DISTINCT ?st) AS ?n) (COUNT(DISTINCT ?stok) AS ?nok)
          (SUM(?dur) AS ?cov) (MIN(?sy) AS ?mn) (MAX(?ey) AS ?mx) WHERE {
     ?p wdt:P106 wd:Q937857 ; wikibase:sitelinks ?sl ; p:P54 ?st .
     FILTER(xsd:integer(?sl)>=20)
     ?st ps:P54 ?club .
     ?club wdt:P31/wdt:P279* wd:Q476028 .
     FILTER NOT EXISTS { ?club wdt:P31/wdt:P279* wd:Q6979593 }
     OPTIONAL { ?st pq:P580 ?a ; pq:P582 ?e2 ; pq:P1350 ?b ; pq:P1351 ?g .
                BIND(?st AS ?stok) BIND(YEAR(?a) AS ?sy) BIND(YEAR(?e2) AS ?ey)
                BIND(YEAR(?e2)-YEAR(?a) AS ?dur) } } GROUP BY ?p }
 FILTER(?n >= 3 && ?n = ?nok)
 BIND(IF(?cov < (?mx - ?mn) - 1, 'HAS_GAP', 'no_gap') AS ?bucket)
} GROUP BY ?bucket
```

C'est un **plancher** : les prêts se chevauchent et bouchent artificiellement les trous, donc la
détection sous-estime. Résultat : **au moins 1 carrière « complète » sur 5 est en fait amputée d'un club.**
Le cas Cantona/Marseille (§6) en est l'illustration exacte.

---

## 5. Marquage des prêts

**Le prédicat est `pq:P1642` et la valeur est `wd:Q2914547` (« loan »).**
La valeur suggérée dans le cahier des charges, `Q2955465`, est en réalité
« **UCI Para-cycling World Championships** » et est utilisée **0 fois**.

```sparql
SELECT ?l WHERE { wd:Q2955465 rdfs:label ?l . FILTER(LANG(?l) IN ('en','fr')) }
-- -> "UCI Para-cycling World Championships" / "Championnats du monde de paracyclisme"
```

Distribution complète des valeurs de `pq:P1642` sur les P54 de footballeurs (89 006 déclarations = 8,0 %) :

| Valeur | Libellé | Déclarations |
|---|---|---|
| **Q2914547** | **loan** | **87 202** |
| Q1811518 | transfer | 696 |
| Q3622633 | free transfer | 587 |
| Q1711289 | youth association football | 385 |
| Q31532 | farm team | 91 |
| Q157171 | renting | 8 |
| Q3246603 / Q18627859 / Q10530881 / Q719599 / … | trade / free agent signing / rental agreement / option contract | ≤ 5 chacun |
| Q25245 (« 2016 »), Q49628 (« 2021 »), Q7307930 (« Regalado »), Q231766 (« Free ») | **erreurs de saisie** | 1–2 chacun |

```sparql
SELECT ?v ?vLabel (COUNT(DISTINCT ?st) AS ?cnt) WHERE {
  ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club ; pq:P1642 ?v .
  OPTIONAL { ?v rdfs:label ?vLabel . FILTER(LANG(?vLabel)='en') }
} GROUP BY ?v ?vLabel ORDER BY DESC(?cnt) LIMIT 20
```

**Attention : `EXISTS { ?st pq:P1642 ?x }` ≠ « c'est un prêt ».** 1 804 déclarations portent P1642
avec une valeur qui n'est pas un prêt (transfer, free transfer, draft…). Il faut tester la valeur
`wd:Q2914547` explicitement. Cas concret vérifié : le passage de Messi au PSG porte
`pq:P1642 = Q1811518` (transfer) — un transfert sec, pas un prêt.

Proportion de prêts, sur les déclarations CLUB-STRICT :

| Cohorte | Déclarations club | dont `P1642 = Q2914547` | % |
|---|---|---|---|
| Toutes | 948 951 | 85 620 | **9,0 %** |
| sl ≥ 10 | 231 767 | 30 951 | **13,4 %** |
| sl ≥ 20 | 88 272 | 13 161 | **14,9 %** |
| sl ≥ 40 | 18 740 | 2 820 | **15,0 %** |

Joueurs distincts avec ≥ 1 prêt marqué : **43 202**.
Passages en prêt disposant du triplet P580+P1350+P1351 : 73 798 / 85 620 = **86,2 %**
(les prêts sont *mieux* renseignés que la moyenne des passages, 60,5 %).

Le plateau à ~15 % dès sl ≥ 20 est cohérent avec la réalité du football (un prêt sur six/sept passages),
ce qui suggère un rappel correct du marquage chez les joueurs notoires. **Mais je n'ai aucune vérité
terrain : je ne peux pas mesurer le rappel, seulement constater la plausibilité de l'ordre de grandeur.**

---

## 5bis. Défauts de qualité mesurés (sur les 948 951 déclarations CLUB-STRICT)

| Anomalie | Déclarations |
|---|---|
| `YEAR(P580) < 1880` | 131 |
| `YEAR(P580) > 2026` | 0 |
| `P582 < P580` (fin avant début) | 181 |
| `P1350 > 1200` matchs | 7 |
| **`P1351 > P1350` (plus de buts que de matchs)** | **2 989** (0,31 %) |
| Groupes (joueur, club, même `P580`) avec > 1 déclaration → **doublons** | **6 721** |

```sparql
SELECT (COUNT(DISTINCT ?st) AS ?c) WHERE {
  ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club ; pq:P1350 ?m ; pq:P1351 ?g .
  ?club wdt:P31/wdt:P279* wd:Q476028 .
  FILTER NOT EXISTS { ?club wdt:P31/wdt:P279* wd:Q6979593 }
  FILTER(?g > ?m) }

SELECT (COUNT(*) AS ?c) WHERE {
  { SELECT ?p ?club ?d (COUNT(DISTINCT ?st) AS ?n) WHERE {
      ?p wdt:P106 wd:Q937857 ; p:P54 ?st . ?st ps:P54 ?club ; pq:P580 ?d .
      ?club wdt:P31/wdt:P279* wd:Q476028 } GROUP BY ?p ?club ?d }
  FILTER(?n > 1) }
```

### 5ter. Rangs des déclarations

Mesuré le même jour, un peu plus tard :

| Rang | Déclarations |
|---|---|
| `wikibase:NormalRank` | 1 106 212 |
| `wikibase:PreferredRank` | 3 904 |
| **`wikibase:DeprecatedRank`** | **116** |

```sparql
SELECT ?rank (COUNT(DISTINCT ?st) AS ?cnt) WHERE {
  ?p wdt:P106 wd:Q937857 ; p:P54 ?st .
  ?st ps:P54 ?club ; wikibase:rank ?rank .
} GROUP BY ?rank
```

La somme fait **1 110 232**, contre 1 110 217 au §0 : quinze déclarations de plus en quelques heures.
C'est l'ordre de grandeur de la dérive de la source, et la raison pour laquelle aucun test n'épingle un chiffre.

Le rang déprécié est **marginal** (0,01 %) et signale une déclaration que la communauté tient pour fausse.
Le rang préféré, lui, est ce qui rend `wdt:P54` inutilisable (§0) : 3 904 déclarations préférées suffisent
à masquer la carrière entière des joueurs concernés.

---

## 6. Test qualitatif : cinq parcours

### 6.0 Les identifiants du cahier des charges sont FAUX (3 sur 4)

| Q-id demandé | Contenu réel mesuré | Vrai Q-id |
|---|---|---|
| Q615 | **Lionel Messi** ✔ | Q615 |
| Q11571 | **Cristiano Ronaldo** (Sporting → Man Utd → Real → Juve → Man Utd → Al-Nassr, Portugal) | Zidane = **Q1835** |
| Q42816 | **« Corte de' Frati »**, commune italienne (48 sitelinks) | Cantona = **Q170328** |
| Q170453 | **« Amazonas »** (73 sitelinks) | Ronaldinho = **Q39444** |

```sparql
SELECT ?p ?l WHERE { VALUES ?l { 'Zinedine Zidane'@en 'Eric Cantona'@en 'Ronaldinho'@en }
                     ?p rdfs:label ?l . ?p wdt:P106 wd:Q937857 }
```
(Note : Q615 et Q11571 n'ont pas de `rdfs:label` avec balise de langue dans l'index QLever —
leurs libellés y sont des littérales sans langue, ex. « Leo Messi », « Lionel Andrés Messi ».)

Joueur moyennement notoire choisi : **Q102035**, 10 sitelinks, 6 passages club.

Requête de sortie de parcours utilisée pour les cinq :

```sparql
SELECT ?clubLabel ?start ?end ?matches ?goals ?loan ?rank ?isNat ?isClub WHERE {
  wd:Q1835 p:P54 ?st . ?st ps:P54 ?club .
  OPTIONAL { ?club rdfs:label ?clubLabel . FILTER(LANG(?clubLabel)='en') }
  OPTIONAL { ?st pq:P580 ?s0 . BIND(YEAR(?s0) AS ?start) }
  OPTIONAL { ?st pq:P582 ?e0 . BIND(YEAR(?e0) AS ?end) }
  OPTIONAL { ?st pq:P1350 ?matches }
  OPTIONAL { ?st pq:P1351 ?goals }
  OPTIONAL { ?st pq:P1642 ?loan }
  OPTIONAL { ?st wikibase:rank ?rank }
  BIND(EXISTS { ?club wdt:P31/wdt:P279* wd:Q6979593 } AS ?isNat)
  BIND(EXISTS { ?club wdt:P31 wd:Q476028 } AS ?isClub)
} ORDER BY ?start ?end
```

### 6.1 Q615 — Lionel Messi (8 déclarations)

| Équipe | début | fin | M | B | P1642 | national | P31=Q476028 |
|---|---|---|---|---|---|---|---|
| FC Barcelona C | 2003 | 2004 | 10 | 5 | | non | oui |
| FC Barcelona Atlètic | 2004 | 2005 | 22 | 6 | | non | oui |
| Argentina U-20 | 2004 | 2005 | 18 | 14 | | **oui** | non |
| FC Barcelona | 2004 | 2021 | 520 | 474 | | non | **non** |
| Argentina A | 2005 | 2026 | 207 | 125 | | **oui** | non |
| Argentina U-23 | 2008 | 2008 | 5 | 2 | | **oui** | non |
| Paris Saint-Germain | 2021 | 2023 | 58 | 22 | **Q1811518 transfer** | non | oui |
| Inter Miami | 2023 | — | 72 | 68 | | non | oui |

Anomalies : (a) **carrière jeunes absente** (Newell's Old Boys 1995-2000, Barça jeunes 2000-2003) ;
(b) 2 équipes réserve (Barça C, Barça Atlètic) mélangées aux clubs seniors, dont **Barça C non typée réserve** ;
(c) 3 sélections mélangées ; (d) FC Barcelona **n'est pas** `P31 Q476028` ; (e) chevauchement légitime
Barça Atlètic 2004-2005 / Barça 2004-2021 ; (f) `P582 = 2026` sur l'Argentine = date de fin factice
pour un passage en cours ; (g) `P1642` présent mais valant « transfer », pas « loan ».

### 6.2 Q11571 — Cristiano Ronaldo (12 déclarations)

Sporting CP 2002-03 (25/3), Man Utd 2003-09 (196/84), Real Madrid 2009-18 (292/311),
Juventus 2018-21 (98/81), Man Utd 2021-22 (40/19), Al-Nassr 2023-— (110/104),
+ 6 sélections portugaises (U15, U17, U20, U21, A 2003-— 233/146, Olympique 2004).

Anomalies : 6 sélections sur 12 déclarations ; **trou 2022→2023** entre Man Utd et Al-Nassr
(réel : il était libre puis Al-Nassr en janvier 2023 — le trou est structurel, pas une erreur) ;
`pq:P1642 = Q1811518 transfer` sur 4 passages, aucun prêt.
**Aucun passage manquant. Les 6 passages club portent tous le triplet complet.**

### 6.3 Q1835 — Zinedine Zidane (9 déclarations)

| Équipe | début | fin | M | B |
|---|---|---|---|---|
| France U-17 | 1988 | 1989 | 4 | 1 |
| France U-18 | 1989 | 1990 | 6 | 0 |
| **AS Cannes** | 1989 | 1992 | 61 | 6 |
| France U-21 | 1990 | 1994 | 20 | 3 |
| **Girondins de Bordeaux** | 1992 | 1996 | 139 | 28 |
| France A | 1994 | 2006 | 108 | 31 |
| France B | 1995 | 1995 | — | — |
| **Juventus** | 1996 | 2001 | 151 | 24 |
| **Real Madrid** | 2001 | 2006 | 155 | 37 |

4 passages club, tous complets, aucun manquant, aucun doublon. 5 sélections mélangées, dont
« France B » sans matchs ni buts. Carrière jeunes absente.

### 6.4 Q170328 — Eric Cantona (10 déclarations) — LE CAS LE PLUS INSTRUCTIF

| Équipe | début | fin | M | B | P1642 |
|---|---|---|---|---|---|
| AJ Auxerre | 1983 | 1988 | 82 | 23 | |
| FC Martigues | 1985 | 1986 | 15 | 4 | **loan** |
| France A | 1987 | 1995 | 45 | 20 | |
| Girondins de Bordeaux | 1989 | 1989 | 11 | 6 | **loan** |
| Montpellier HSC | 1989 | 1990 | 33 | 10 | **loan** |
| Nîmes Olympique | 1991 | 1991 | 17 | 2 | |
| Leeds United | 1992 | 1992 | 28 | 9 | |
| Manchester United | 1992 | 1997 | 143 | 64 | |
| France beach soccer | 1997 | 2005 | — | — | |
| France beach soccer | 2005 | 2005 | 1 | 1 | |

**ANOMALIE MAJEURE : l'Olympique de Marseille (1988-1991) est totalement ABSENT.** Vérifié par
énumération exhaustive de toutes ses déclarations P54, tous rangs confondus (10 déclarations, aucune Marseille),
et par `SELECT ?prop WHERE { wd:Q170328 ?prop wd:Q132885 }` → aucun résultat (Q132885 = Olympique de Marseille,
item par ailleurs bien utilisé : il apparaît dans le P54 de 884 footballeurs).
Conséquence : les 3 prêts (Martigues, Bordeaux, Montpellier) sont rattachés à… rien —
ils chevauchent Auxerre ou flottent dans le trou 1988-1991. **Un joueur dont les 7 passages club
portent tous le triplet complet, et dont la carrière est pourtant fausse.**
Anomalie secondaire : « France beach soccer » **en doublon** avec périodes qui se chevauchent
(1997-2005 et 2005-2005) — et le beach soccer classé en « sélection nationale ».

### 6.5 Q39444 — Ronaldinho (14 déclarations)

Grêmio 1998-2001 (89/47), PSG 2001-03 (55/17), FC Barcelona 2003-08 (145/70), AC Milan 2008-10 (76/20),
Flamengo 2011-12 (56/23), Atlético Mineiro 2012-14 (58/20), Querétaro 2014-15 (25/8),
Fluminense 2015 (7/0), **+ « S.C. Ravenna Sport, début 2026, 0 match, 0 but »**,
+ 4 sélections brésiliennes (U15, U17, U20, U23) + Brésil A 1999-2013 (97/33).

Anomalies : (a) **« S.C. Ravenna Sport 2026 » est absurde** — Ronaldinho a arrêté en 2015 ;
c'est du vandalisme ou une confusion d'homonyme, et ce n'est PAS attrapé par mon filtre
`YEAR(P580) > 2026` (2026 est l'année courante) ; (b) « Brazil U-15 » n'a **ni P580 ni P582**
mais a 5 matchs / 8 buts ; (c) FC Barcelona à nouveau non typé `P31 Q476028`.

### 6.6 Q102035 — joueur moyennement notoire (10 sitelinks, 6 passages club)

| Équipe | début | fin | M | B |
|---|---|---|---|---|
| Alemannia Aachen | 2012 | 2013 | 8 | 7 |
| Schalke 04 | 2013 | 2013 | 0 | 0 |
| FC Schalke 04 **II** | 2013 | 2014 | 35 | 20 |
| 1. FC Heidenheim | 2014 | 2016 | — | — |
| FC Ingolstadt 04 | 2016 | 2019 | — | — |
| 1. FC Heidenheim | 2019 | — | — | — |

**3 passages sur 6 sans aucune statistique**, dont les 3 derniers (les plus récents).
Un passage senior à 0 match / 0 but. Une réserve (« Schalke 04 II ») mélangée au senior,
non typée réserve. Aucun prêt marqué. **Ce joueur est injouable en l'état** — et c'est le profil
médian de la tranche sitelinks ≈ 10.

### 6.7 Anomalie sémantique transversale : `P1350` = matchs de CHAMPIONNAT seulement

Vérifié sur 4 cas indépendants :

| Passage | Wikidata P1350/P1351 | Championnat seul | Total toutes compétitions |
|---|---|---|---|
| Messi / FC Barcelona | 520 / 474 | **520 / 474 (Liga)** | 778 / 672 |
| Zidane / Real Madrid | 155 / 37 | **155 / 37 (Liga)** | 227 / 49 |
| C. Ronaldo / Real Madrid | 292 / 311 | **292 / 311 (Liga)** | 438 / 450 |
| C. Ronaldo / Man Utd (1er) | 196 / 84 | **196 / 84 (Premier League)** | 292 / 118 |

`P1350`/`P1351` reprennent le chiffre de l'infobox Wikipédia = **championnat national uniquement**,
sans qu'aucun qualificateur ne le documente (`pq:P642` « of » : **0** occurrence ;
`pq:P518` « applies to part » : 125 occurrences seulement).
**Un quiz qui annonce « nombre de matchs » sans préciser « en championnat » donnera des réponses
que le joueur croira fausses.**

---

## Réserves méthodologiques

1. **Snapshot QLever**, pas Wikidata live. L'index QLever de wikidata peut avoir quelques jours/semaines
   de retard. Aucune mesure n'a été recoupée sur query.wikidata.org (non nécessaire, mais donc non vérifiée).
2. **`xsd:int` vs `xsd:integer`** : sans le cast `xsd:integer(?sl)`, tous les filtres de sitelinks
   renvoient 0 **silencieusement** sur QLever. Toute reprise de ces requêtes doit conserver le cast.
3. **Timeout QLever = 30 s.** Trois mesures sont hors de portée et ne sont PAS estimées :
   l'intersection triple A∩B∩C des signaux « réserve » (d'où l'encadrement 13 225–15 449) ;
   l'énumération de tous les prédicats `pq:` par scan de prédicat non lié ; la détection exacte
   des trous par balayage année par année.
4. **Le rappel du marquage des prêts n'est pas mesurable** sans vérité terrain externe.
   Les 9 %–15 % mesurés sont une *présence*, pas une *exhaustivité*.
5. **La prévalence réelle des équipes réserve n'est pas mesurable** avec les données Wikidata seules :
   les trois signaux ne captent que 1,4–1,6 % des passages club, ce qui est certainement très inférieur
   à la vérité, mais je ne peux pas chiffrer l'écart.
6. Les **passages manquants** ne sont mesurables que par le proxy « trou temporel », qui est un
   **plancher** (les prêts qui se chevauchent masquent les trous) : ≥ 21,5 % à sl ≥ 20.
   Le taux réel est supérieur, de combien je ne sais pas.
7. « Notoriété » = nombre de sitelinks. C'est un proxy, biaisé en faveur des joueurs européens
   et des joueurs récents. Les 4 vérifications d'identité du §6.0 ont d'ailleurs montré que le
   nombre de sitelinks ne dit rien de la nature de l'item (Q170453 « Amazonas » : 73 sitelinks).
8. `COUNT(DISTINCT ?st)` a été utilisé partout pour neutraliser les qualificateurs multi-valués.
   Les `OPTIONAL` du §3 sont écrits en un seul bloc conjonctif pour que `?stok` ne se lie que si
   les trois qualificateurs sont présents simultanément.
