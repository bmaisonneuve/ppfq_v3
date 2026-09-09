#!/usr/bin/env python3
"""
Extraction du référentiel élargi de footballeurs (specs §10.1).

Source : Wikidata, interrogé via QLever (endpoint SPARQL tiers, beaucoup plus
rapide que le WDQS officiel : l'extraction complète tient en ~15 s, là où le
WDQS coupe à 60 s et imposerait une pagination).

Périmètre : toute entité ayant P106 = Q937857 (« joueur de football »),
soit ~391 000 personnes. Aucun filtre de notoriété n'est appliqué ici : le
tri se fait en aval, via les colonnes `sitelinks` et `clubs`.

Sorties (dans --out, CSV UTF-8) :
  footballers.csv         qid, name, lang, sex, wiki_fr, wiki_en, sitelinks, teams
  footballer_aliases.csv  qid, alias   (surnoms : Pelé, Ronaldinho, Chicharito…)

Licence des données : CC0 (Wikidata). Attribution non obligatoire.
"""

import argparse
import collections
import csv
import io
import sys
import urllib.parse
import urllib.request

ENDPOINT = "https://qlever.dev/api/wikidata"
USER_AGENT = "PPFQ-referentiel/1.0 (contact: bmaisonneuve@gencovery.com)"

# Langues à écriture latine, par ordre de préférence pour le nom retenu.
LANGS = ["mul", "en", "fr", "es", "pt", "it", "de", "nl", "pl"]
LANG_LIST = ", ".join(f'"{l}"' for l in LANGS)

PREFIXES = """
PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX schema: <http://schema.org/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX ps: <http://www.wikidata.org/prop/statement/>
"""

Q_LABELS = PREFIXES + f"""
SELECT ?p ?label ?lg WHERE {{
  ?p wdt:P106 wd:Q937857 .
  ?p rdfs:label ?label .
  BIND(lang(?label) AS ?lg)
  FILTER(?lg IN ({LANG_LIST}))
}}
"""

Q_WIKI = PREFIXES + """
SELECT ?p ?frwiki ?enwiki WHERE {
  ?p wdt:P106 wd:Q937857 .
  OPTIONAL { ?frwiki schema:about ?p ; schema:isPartOf <https://fr.wikipedia.org/> }
  OPTIONAL { ?enwiki schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }
}
"""

Q_SITELINKS = PREFIXES + """
SELECT ?p (COUNT(?s) AS ?n) WHERE {
  ?p wdt:P106 wd:Q937857 .
  ?s schema:about ?p .
} GROUP BY ?p
"""

# ATTENTION : `wdt:P54` ne renvoie que les déclarations de rang préféré. Pour
# un joueur en activité, Wikidata marque son club actuel comme préféré et
# `wdt:` masque alors TOUT le reste de la carrière (Messi n'y a qu'un club).
# Il faut passer par les déclarations complètes, p:P54/ps:P54.
# Le compte inclut sélections nationales et équipes réserve : c'est un simple
# indicateur de richesse de la fiche, pas le parcours au sens des specs.
Q_CLUBS = PREFIXES + """
SELECT ?p (COUNT(DISTINCT ?club) AS ?n) WHERE {
  ?p wdt:P106 wd:Q937857 .
  ?p p:P54 ?st . ?st ps:P54 ?club .
} GROUP BY ?p
"""

# Q937857 est neutre en genre : hommes et femmes partagent la même occupation
# (aucun item « joueuse de football » distinct n'est utilisé sur Wikidata).
# La colonne `sex` permet donc de filtrer ou d'équilibrer en aval.
SEX = {"Q6581097": "m", "Q6581072": "f"}

Q_SEX = PREFIXES + """
SELECT ?p ?sex WHERE {
  ?p wdt:P106 wd:Q937857 ; wdt:P21 ?sex .
}
"""

Q_ALIASES = PREFIXES + f"""
SELECT ?p ?alias WHERE {{
  ?p wdt:P106 wd:Q937857 ; skos:altLabel ?alias .
  FILTER(lang(?alias) IN ({LANG_LIST}))
}}
"""


def sparql(query: str, label: str) -> list[dict]:
    """Exécute une requête SPARQL et renvoie les lignes du CSV en dicts."""
    url = ENDPOINT + "?" + urllib.parse.urlencode({"query": query})
    req = urllib.request.Request(
        url, headers={"Accept": "text/csv", "User-Agent": USER_AGENT}
    )
    print(f"  … {label}", file=sys.stderr, flush=True)
    with urllib.request.urlopen(req, timeout=600) as resp:
        body = resp.read().decode("utf-8")
    if not body.startswith(("p,", "?p")):
        raise RuntimeError(f"réponse inattendue de l'endpoint : {body[:300]}")
    rows = list(csv.DictReader(io.StringIO(body)))
    print(f"    {len(rows):>7} lignes", file=sys.stderr)
    return rows


def qid(uri: str) -> str:
    return uri.rsplit("/", 1)[-1]


def label_lang(labels_by_qid: dict, q: str) -> tuple[str, str]:
    """Nom retenu + langue d'origine, selon l'ordre de préférence LANGS."""
    got = labels_by_qid.get(q, {})
    for lang in LANGS:
        if lang in got:
            return got[lang], lang
    return "", ""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data", help="répertoire de sortie")
    ap.add_argument(
        "--min-sitelinks",
        type=int,
        default=0,
        help="ne garder que les footballeurs présents dans au moins N "
        "versions de Wikipédia (0 = tout garder)",
    )
    ap.add_argument("--no-aliases", action="store_true")
    args = ap.parse_args()

    import os

    os.makedirs(args.out, exist_ok=True)

    print("Extraction Wikidata via QLever :", file=sys.stderr)

    # Les labels arrivent en une ligne par (joueur, langue) : on replie.
    labels: dict[str, dict[str, str]] = collections.defaultdict(dict)
    for r in sparql(Q_LABELS, "libellés"):
        # La sérialisation CSV supprime le tag de langue : on le sélectionne
        # explicitement (?lg) plutôt que de le parser depuis le littéral.
        labels[qid(r["p"])][r["lg"]] = r["label"]

    sitelinks = {qid(r["p"]): int(r["n"]) for r in sparql(Q_SITELINKS, "sitelinks")}
    clubs = {qid(r["p"]): int(r["n"]) for r in sparql(Q_CLUBS, "équipes (P54)")}
    sexes = {
        qid(r["p"]): SEX.get(qid(r["sex"]), "x") for r in sparql(Q_SEX, "genre (P21)")
    }
    wiki = sparql(Q_WIKI, "liens Wikipédia fr/en")

    kept: set[str] = set()
    path = os.path.join(args.out, "footballers.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(
            ["qid", "name", "lang", "sex", "wiki_fr", "wiki_en", "sitelinks", "teams"]
        )
        for r in wiki:
            q = qid(r["p"])
            n = sitelinks.get(q, 0)
            if n < args.min_sitelinks:
                continue
            name, lang = label_lang(labels, q)
            if not name:
                continue  # ni nom latin, ni fallback exploitable
            kept.add(q)
            w.writerow(
                [
                    q,
                    name,
                    lang,
                    sexes.get(q, ""),
                    urllib.parse.unquote(r["frwiki"]),
                    urllib.parse.unquote(r["enwiki"]),
                    n,
                    clubs.get(q, 0),
                ]
            )
    print(f"→ {path} : {len(kept)} footballeurs", file=sys.stderr)

    if not args.no_aliases:
        path = os.path.join(args.out, "footballer_aliases.csv")
        # Le même surnom est souvent déclaré dans plusieurs langues : on
        # dédoublonne sur (qid, alias) en conservant les variantes de casse et
        # d'accentuation, qui servent justement à la tolérance de saisie.
        seen = 0
        emitted: set[tuple[str, str]] = set()
        with open(path, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["qid", "alias"])
            for r in sparql(Q_ALIASES, "alias / surnoms"):
                q = qid(r["p"])
                key = (q, r["alias"])
                if q not in kept or key in emitted:
                    continue
                emitted.add(key)
                w.writerow(key)
                seen += 1
        print(f"→ {path} : {seen} alias", file=sys.stderr)

    return 0


if __name__ == "__main__":
    sys.exit(main())
