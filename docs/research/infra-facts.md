# Faits vérifiés — infra auto-hébergée VPS + Coolify

**Date de vérification : 9 septembre 2026.**
**Méthode : inspection directe des manifestes OCI (`docker manifest inspect`, Docker Engine 29.7.2) + API des registres (Docker Hub v2, GHCR v2) + API GitHub/GitLab + documentation officielle des éditeurs.** Aucun blog, aucun comparatif tiers.

Convention : « OUI » = un index de manifeste multi-arch contenant `linux/arm64` a été observé pour le tag cité, à la date ci-dessus.

---

## Ce qui est périmé ou abandonné (à lire en premier)

| Élément | État | Conséquence |
|---|---|---|
| `grafana/promtail` | **EOL depuis le 2 mars 2026** (annonce officielle) | Utiliser `grafana/alloy`. Outil de conversion de config fourni |
| SigNoz `install.sh` + `deploy/` docker-compose | **Déprécié depuis v0.130.0**, fichiers plus distribués | Plus de compose officiel à donner à Coolify → il faut le générer via Foundry |
| `bitnami/zookeeper` | **0 tag sur Docker Hub** (catalogue public retiré) | Sans objet : les installations neuves utilisent ClickHouse Keeper |
| `bitnamilegacy/zookeeper` | Archive **gelée** (tout poussé le 2025-07-02) | Aucun correctif de sécurité à attendre |
| `signoz/query-service`, `signoz/frontend` | Plus publiés depuis **mars 2025** | Fusionnés dans `signoz/signoz` |
| Umami tags `postgresql-*` / `mysql-*` | Convention **abandonnée** en v3 | Utiliser les tags de version nus (`3.3.1`) |
| Resend `eu-west-1` comme « région UE » | **Trompeur** : n'affecte que l'envoi | Les données et logs restent aux États-Unis |

**Rien d'autre n'est périmé** : Grafana, Prometheus, Loki, Alloy, OTel Collector, SigNoz, ClickHouse, Uptime Kuma, Umami, PostgreSQL et Coolify ont tous été publiés dans les 30 derniers jours.

---

## SUJET A — Disponibilité `linux/arm64`

### Tableau de synthèse

| Outil | arm64 | Image / registre | Version vérifiée | Dernière publication de l'image |
|---|---|---|---|---|
| GlitchTip | **OUI** | `docker.io/glitchtip/glitchtip` | `6.2.6` / `6.2` / `6` / `latest` | 2026-08-08 |
| Grafana | **OUI** | `docker.io/grafana/grafana` | `13.2.1`, `latest` | 2026-09-01 |
| Prometheus | **OUI** | `docker.io/prom/prometheus` | `v3.14.0`, `latest` | 2026-08-18 |
| Loki | **OUI** | `docker.io/grafana/loki` | `3.7.7`, `latest` | 2026-08-27 |
| Promtail | OUI mais **EOL** | `docker.io/grafana/promtail` | `latest` | 2026-03-25 — **fin de vie** |
| Grafana Alloy | **OUI** | `docker.io/grafana/alloy` | `v1.19.2`, `latest` | 2026-08-26 |
| OTel Collector | **OUI** | `docker.io/otel/opentelemetry-collector[-contrib]` | `0.160.0`, `latest` | 2026-09-02 |
| SigNoz | **OUI** | `docker.io/signoz/signoz` | `v0.141.1`, `latest` | 2026-09-09 |
| SigNoz OTel Collector | **OUI** | `docker.io/signoz/signoz-otel-collector` | `v0.144.9`, `latest` | 2026-08-26 |
| SigNoz schema migrator | **OUI** | `docker.io/signoz/signoz-schema-migrator` | `latest` | 2026-08-19 |
| ClickHouse server | **OUI** | `docker.io/clickhouse/clickhouse-server` | `25.5.6`, `latest` | 2026-09-01 |
| ClickHouse Keeper | **OUI** | `docker.io/clickhouse/clickhouse-keeper` | `25.5.6`, `latest` | vérifié 2026-09-09 |
| ZooKeeper (Bitnami) | **N/A — retiré** | `docker.io/bitnami/zookeeper` | **0 tag** | catalogue public supprimé |
| ZooKeeper (legacy) | OUI mais **figé** | `docker.io/bitnamilegacy/zookeeper` | `3.9.x` | archive gelée (2025-07-02) |
| Uptime Kuma | **OUI** | `docker.io/louislam/uptime-kuma` | `2.5.3`, `2`, `latest`, `1` | 2026-09-09 (repo) |
| Umami | **OUI** | `ghcr.io/umami-software/umami` | `3.3.1`, `3.3`, `latest` | v3.3.1 le 2026-08-20 |
| PostgreSQL (officiel) | **OUI** (`arm64/v8`) | `docker.io/library/postgres` | `16`, `17`, `18` | 2026-08-26 |
| Coolify | **OUI** | `ghcr.io/coollabsio/coolify` | `4.3.18`, `latest` | v4.3.18 le 2026-09-08 |
| Valkey (dép. GlitchTip, option.) | **OUI** | `docker.io/valkey/valkey` | `8-alpine`, `9-alpine` | vérifié 2026-09-09 |

**Conclusion SUJET A : aucun trou arm64.** Les 100 % des composants demandés disposent d'une image `linux/arm64` officielle publiée par l'éditeur. Aucun build communautaire n'est nécessaire pour aucun des outils de la liste.

---

### A.1 — GlitchTip (point le plus incertain → verdict : arm64 solide et de première classe)

**Réponse : OUI, arm64 officiel, natif, et continu depuis mai 2022.**

Image exacte : `docker.io/glitchtip/glitchtip` (Docker Hub, compte officiel du projet).
⚠️ **Les tags n'ont pas de préfixe `v`** : `6.2.6`, `6.2`, `6`, `latest`. Les tags `v6.2.6` / `v6.2` **n'existent pas** côté Docker (alors que les tags Git, eux, sont préfixés `v`). C'est un piège de configuration à connaître.

Preuve par inspection du manifeste :

```
$ docker manifest inspect glitchtip/glitchtip:6.2.6
{
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "manifests": [
    { "digest": "sha256:b88013c8e5327fc1d49bd432516746e2eedb9d3cf6dcf739ec9da24be65f74be",
      "platform": { "architecture": "amd64", "os": "linux" } },
    { "digest": "sha256:189cdb55246899dc141989459e1cd08fe9ba72d9bf2404b76b551c90a55a2070",
      "platform": { "architecture": "arm64", "os": "linux" } }
  ]
}
```

Le `latest` (digest `sha256:a3d8eb1b36c1e…`) a été poussé le **2026-08-08T20:21:46Z** et expose `[amd64, arm64]`.
Source (API registre) : `https://hub.docker.com/v2/repositories/glitchtip/glitchtip/tags/latest`

Des tags **mono-arch dédiés** sont aussi publiés à chaque release, ce qui confirme un pipeline arm64 de premier ordre et non un sous-produit :
`6.2.6-arm64` (poussé 2026-08-08T20:21:10Z), `6.2.5-arm64`, `6.2.3-arm64`, `6.2.2-arm64`, `6.2.1-arm64`.
Source : `https://hub.docker.com/v2/repositories/glitchtip/glitchtip/tags?page_size=100`

**Antériorité de l'arm64** : la première image arm64 est `v1.12.4`, poussée le **2022-05-28**. Le support arm64 est donc ininterrompu depuis plus de quatre ans.

**Preuve que le build arm64 est NATIF (non émulé)** — le `.gitlab-ci.yml` officiel du backend :

- job `release_build_arm64` avec `BUILD_PLATFORM: linux/arm64`, exécuté sur le runner `saas-linux-medium-arm64` (runner ARM natif GitLab SaaS) ;
- job `release_build_amd64` symétrique ;
- puis fusion du manifeste multi-arch : `docker buildx imagetools create … "${REGISTRY}:${VERSION_FULL}-amd64" "${REGISTRY}:${VERSION_FULL}-arm64"`.

Il existe même un job de validation `validate_build_arm64` distinct, donc l'image arm64 est testée à chaque pipeline.
Source : `https://gitlab.com/glitchtip/glitchtip-backend/-/blob/master/.gitlab-ci.yml`

**La doc officielle affirme explicitement arm64** — verbatim depuis la page d'installation :
> « Recommended system requirements: 512 MB RAM, **x86 or arm64 CPU** »
Source : `https://glitchtip.com/documentation/install`

**Vitalité du projet (pas abandonné)** : `glitchtip/glitchtip-backend` dernière activité **2026-09-08**, `glitchtip-frontend` **2026-09-08**, tag Git le plus récent `v6.2.6` (commit du 2026-08-07). Le dépôt n'est pas archivé.
Sources : `https://gitlab.com/api/v4/projects/glitchtip%2Fglitchtip-backend` et `…/repository/tags`

**Dépendances GlitchTip**, verbatim de la doc :
> « GlitchTip requires PostgreSQL (14+) and a single service (or separate web and worker services for scaling). Valkey (or redis) 7+ is optional. »
PostgreSQL officiel et Valkey sont tous deux arm64 (voir tableau). **La chaîne GlitchTip complète est donc arm64 de bout en bout.**
Source : `https://glitchtip.com/documentation/install`

À noter : un `glitchtip/glitchtip-rust` existe et est actif (dernière activité 2026-09-06), mais ce n'est pas l'image de production distribuée ; à ne pas confondre.
Source : `https://gitlab.com/api/v4/groups/glitchtip/projects`

---

### A.2 — Stack Grafana

Toutes vérifiées par `docker manifest inspect`, le 2026-09-09 :

| Image | Plateformes observées |
|---|---|
| `grafana/grafana:13.2.1` et `:latest` | `linux/amd64`, `linux/arm64`, `linux/arm/v7` |
| `prom/prometheus:v3.14.0` et `:latest` | `amd64`, `arm64`, `arm/v7`, `ppc64le`, `riscv64`, `s390x` |
| `grafana/loki:3.7.7` et `:latest` | `linux/amd64`, `linux/arm64`, `linux/arm/v7` |
| `grafana/alloy:v1.19.2` et `:latest` | `linux/amd64`, `linux/arm64`, `ppc64le`, `s390x` |
| `otel/opentelemetry-collector:0.160.0` / `-contrib:0.160.0` | `386`, `amd64`, `arm64`, `arm/v7`, `ppc64le`, `riscv64`, `s390x` |

Versions confirmées comme étant les dernières releases officielles (API GitHub `/releases/latest`) :
- Grafana **13.2.1**, publiée 2026-09-02 — `https://api.github.com/repos/grafana/grafana/releases/latest`
- Prometheus **3.14.0**, publiée 2026-08-18 — `https://api.github.com/repos/prometheus/prometheus/releases/latest`
- Loki **3.7.7**, publiée 2026-08-27 — `https://api.github.com/repos/grafana/loki/releases/latest`
- Alloy **1.19.2**, publiée 2026-08-26 — `https://api.github.com/repos/grafana/alloy/releases/latest`
- OTel Collector **0.160.0**, publiée 2026-09-02 — `https://api.github.com/repos/open-telemetry/opentelemetry-collector-releases/releases/latest`

Le variant GHCR de l'OTel Collector est également multi-arch :
`ghcr.io/open-telemetry/opentelemetry-collector-releases/opentelemetry-collector-contrib:0.160.0` → `386, amd64, arm, arm64, ppc64le, riscv64, s390x`.

#### ⚠️ PÉRIMÉ — Promtail est en fin de vie

Verbatim de la documentation officielle Grafana :
> « **Promtail is end of life (EOL) as of March 2, 2026.** Commercial support has ended. No future support or updates will be provided. All future feature development will occur in Grafana Alloy. »
> « If you are currently using Promtail, you must migrate to Alloy or another supported client. »
> (précision : « the deprecation of Promtail does NOT include the lambda-promtail client »)

Source : `https://grafana.com/docs/loki/latest/send-data/promtail/`

Cohérent avec les données du registre : `grafana/promtail:latest` n'a plus été poussé depuis le **2026-03-25** et le dépôt n'a plus bougé depuis le 2026-05-13, alors que `grafana/loki` est mis à jour quotidiennement.
Source : `https://hub.docker.com/v2/repositories/grafana/promtail/tags/latest`

→ **Recommandation factuelle : utiliser `grafana/alloy`, pas `grafana/promtail`.** Grafana fournit un outil de conversion automatique de configuration Promtail → Alloy. Source : `https://grafana.com/docs/alloy/latest/set-up/migrate/from-promtail/`

---

### A.3 — SigNoz et ses dépendances

**arm64 : OUI pour l'intégralité de la chaîne.** Vérifié par manifeste le 2026-09-09 :

| Image | Plateformes |
|---|---|
| `signoz/signoz:v0.141.1` et `:latest` | `linux/amd64`, `linux/arm64` |
| `signoz/signoz-otel-collector:v0.144.9` et `:latest` | `linux/amd64`, `linux/arm64` |
| `signoz/signoz-schema-migrator:latest` | `linux/amd64`, `linux/arm64` |
| `clickhouse/clickhouse-server:25.5.6` et `:latest` | `linux/amd64`, `linux/arm64` |
| `clickhouse/clickhouse-keeper:25.5.6` et `:latest` | `linux/amd64`, `linux/arm64` |
| `postgres:16` (métastore) | `arm64/v8` + 6 autres |

Version courante SigNoz : **v0.141.1**, publiée 2026-09-09T13:02:37Z. Image `signoz/signoz:latest` poussée le même jour à 13:15:39Z.
Sources : `https://api.github.com/repos/SigNoz/signoz/releases/latest` et `https://hub.docker.com/v2/repositories/signoz/signoz/tags/latest`

SigNoz OTel Collector publie aussi des tags mono-arch dédiés (`v0.144.9-linux-arm64`, `latest-linux-arm64`), donc arm64 de première classe.
Source : `https://hub.docker.com/v2/repositories/signoz/signoz-otel-collector/tags?page_size=100`

**Le CLI d'installation Foundry supporte arm64** — extrait verbatim du script d'installation officiel :
```sh
raw_arch="$(uname -m)"
case "${raw_arch}" in
  x86_64 | amd64) PLATFORM_ARCH="amd64" ;;
  aarch64 | arm64) PLATFORM_ARCH="arm64" ;;
  *) die "Unsupported architecture: ${raw_arch}" ;;
esac
```
Source : `https://signoz.io/foundry.sh`
La doc de déploiement confirme : « Foundry has support for **different platforms and architectures** ».
Source : `https://github.com/SigNoz/signoz/blob/main/deploy/README.md`

#### ⚠️ ABANDONNÉ — SigNoz a déprécié docker-compose (impact direct sur Coolify)

Verbatim de la doc officielle :
> « The legacy install script (`install.sh`) and the Docker Compose files bundled under `deploy/` in the SigNoz repository are deprecated as of **SigNoz v0.130.0** and are no longer maintained or distributed. »
Source : `https://signoz.io/docs/install/docker/`

Verbatim du `deploy/README.md` du dépôt :
> « **Note:** The `install.sh` script and the `docker-compose` manifests have been deprecated. SigNoz now installs and runs through Foundry. »
Source : `https://github.com/SigNoz/signoz/blob/main/deploy/README.md`

Et le guide de migration avertit :
> « Keep a copy of your existing `docker-compose.yaml` / stack file (and any config it references). **SigNoz no longer distributes these files, so this copy is your only way to roll back.** »
Source : `https://github.com/SigNoz/signoz/blob/main/deploy/MIGRATION.md`

**Conséquence pratique pour Coolify** (qui déploie à partir d'un docker-compose) : il n'y a plus de compose officiel à pointer. Le chemin documenté consiste à faire générer le compose par Foundry puis à l'utiliser :
```
foundryctl gauge -f casting.yaml
foundryctl forge -f casting.yaml
cd pours/deployment && docker compose up -d
```
Source : `https://signoz.io/docs/install/docker/`
Le compose généré peut ensuite être fourni à Coolify, mais c'est un artefact généré et non versionné par l'éditeur : chaque montée de version exige de régénérer et de rediffer le compose. C'est le vrai coût de SigNoz sur Coolify, pas l'architecture CPU.

#### ZooKeeper / Keeper — état exact

- **`bitnami/zookeeper` est inutilisable : le dépôt Docker Hub public ne contient plus AUCUN tag.** Vérifié : `docker manifest inspect bitnami/zookeeper:latest` → `no such manifest: docker.io/bitnami/zookeeper:latest`, et l'API renvoie `"count": 0` sur la liste des tags. Métadonnées du dépôt : `last_updated = 2025-09-03`, description « Bitnami Secure Image for zookeeper ».
  Sources : `https://hub.docker.com/v2/repositories/bitnami/zookeeper/tags` et `https://hub.docker.com/v2/repositories/bitnami/zookeeper/`
- `bitnamilegacy/zookeeper` existe, est bien multi-arch (`amd64`, `arm64`), mais c'est une **archive gelée** : tous les tags ont été poussés en bloc le 2025-07-02 et rien depuis. À considérer comme non maintenu (aucun correctif de sécurité à attendre).
  Source : `https://hub.docker.com/v2/repositories/bitnamilegacy/zookeeper/tags?page_size=100`
- **ZooKeeper n'est plus nécessaire.** Le déploiement Foundry courant utilise `clickhouse/clickhouse-keeper:25.5.6` (arm64 confirmé). ZooKeeper n'apparaît plus que dans le `casting.yaml` de *migration* d'une ancienne installation (`telemetrykeeper: kind: zookeeper`), pour réattacher les volumes existants.
  Sources : `https://signoz.io/docs/install/docker/` et `https://github.com/SigNoz/signoz/blob/main/deploy/MIGRATION.md`

→ **Sur une installation neuve, choisir ClickHouse Keeper et le problème Bitnami disparaît.**

Preuve : le `docker ps` de référence publié dans la doc officielle d'installation liste exactement cinq conteneurs, avec ClickHouse **Keeper** et sans ZooKeeper (extrait verbatim) :

```
clickhouse/clickhouse-server:25.5.6   …  signoz-telemetrystore-clickhouse-0-0
postgres:16                           …  signoz-metastore-postgres-0
clickhouse/clickhouse-keeper:25.5.6   …  signoz-telemetrykeeper-clickhousekeeper-0
signoz/signoz-otel-collector:latest   …  signoz-ingester-1
signoz/signoz:latest                  …  signoz-signoz-0
```
Source : `https://signoz.io/docs/install/docker/`

Les cinq images ci-dessus ont été vérifiées arm64 (tableau plus haut). Noter aussi que le métastore par défaut est désormais **`postgres:16`** (et non plus SQLite comme dans l'installation legacy).

#### Images SigNoz périmées à ne pas utiliser

`signoz/query-service` et `signoz/frontend` sont **obsolètes** : dernières mises à jour respectivement **2025-03-24** et **2025-03-18**, soit ~18 mois sans publication. Elles ont été fusionnées dans l'image unique `signoz/signoz`. (Leurs derniers tags sont bien arm64, mais elles ne doivent pas être déployées.)
Sources : `https://hub.docker.com/v2/repositories/signoz/query-service/` et `https://hub.docker.com/v2/repositories/signoz/frontend/`

---

### A.4 — Uptime Kuma

**OUI.** `docker.io/louislam/uptime-kuma`. Tags `1`, `2`, `2.5.3` et `latest` exposent tous `linux/amd64`, `linux/arm64`, `linux/arm/v7`.
Dernière release : **2.5.3**, publiée 2026-08-22. Dépôt Docker Hub mis à jour le 2026-09-09.
Sources : `https://api.github.com/repos/louislam/uptime-kuma/releases/latest`, `https://hub.docker.com/v2/repositories/louislam/uptime-kuma/`

Note : la branche 1.x reste publiée (`:1`, dernier push 2025-10-20) mais la 2.x est la ligne courante.

### A.5 — Umami

**OUI.** `ghcr.io/umami-software/umami`, tags `3.3.1`, `3.3`, `3.2.0`, `latest` → `linux/amd64`, `linux/arm64`.
Dernière release : **v3.3.1**, publiée 2026-08-20. Source : `https://api.github.com/repos/umami-software/umami/releases/latest`

⚠️ **Changement de convention de tags** : jusqu'en v2.x les tags étaient préfixés par la base de données (`postgresql-v2.20.2`, `mysql-v2.20.2`). Depuis la v3 les tags sont de simples versions (`3.3.1`, `3.3`). Le tag `postgresql-latest` existe encore mais relève de l'ancienne convention — préférer un tag de version explicite.
Source (liste des tags GHCR) : `https://ghcr.io/v2/umami-software/umami/tags/list` (148 tags), consultée avec un token anonyme `https://ghcr.io/token?scope=repository:umami-software/umami:pull`

### A.6 — PostgreSQL (image officielle)

**OUI.** `docker.io/library/postgres`, tags `16`, `17`, `18` → `linux/arm64/v8` (plus `386`, `amd64`, `arm/v5`, `arm/v7`, `ppc64le`, `riscv64`, `s390x`). Poussés le 2026-08-26.
Source : `https://hub.docker.com/v2/repositories/library/postgres/tags/16` (idem `/17`, `/18`)

Noter la variante `arm64/v8` (et non `arm64` nu) : sans effet pratique sur un VPS ARM Neoverse/Graviton, mais peut surprendre un script qui filtre sur la chaîne exacte `arm64`.

### A.7 — Coolify lui-même

**OUI.** `ghcr.io/coollabsio/coolify`, tags `latest` et `4.3.18` → `linux/amd64`, `linux/arm64`. Coolify publie en plus des tags mono-arch suffixés `-aarch64`.
Dernière release : **v4.3.18**, publiée 2026-09-08. Source : `https://api.github.com/repos/coollabsio/coolify/releases/latest`

ARM64 est un support officiel de premier rang, verbatim de la doc :
> « Coolify runs on 64-bit systems: **AMD64** / **ARM64** »

Aucune mention d'un caractère expérimental ou limité. Raspberry Pi OS 64-bit est explicitement listé parmi les OS supportés.
Source : `https://coolify.io/docs/get-started/installation`

---

## SUJET B — Empreinte mémoire annoncée par la documentation officielle

Rappel de la consigne : ne rapporter que ce qui est **documenté**, et écrire « non trouvé » sinon. Beaucoup de ces projets ne publient délibérément pas de minimum.

### B.1 — Grafana + Prometheus + Loki + OTel Collector

**Grafana — documenté.** Verbatim de la page d'installation :
> « Grafana requires the following minimum system resources: **Minimum recommended memory: 512 MB** / **Minimum recommended CPU: 1 core** »

La même page précise que ces chiffres relèvent de l'évaluation et non de la production, et fournit des paliers. Palier « Small » (verbatim, colonne « Minimum ») :
> CPU : **2 cores** — Memory : **2 – 4 GB** — Disk : **10 – 20 GB SSD (database host)** — Instances : 1

Palier « Medium » (colonne « Recommendation ») : CPU 4 – 8 cores, Memory 8 – 16 GB, Disk 20 – 50 GB SSD, 2 instances load-balancées.
La doc ajoute pour « Small » : « SQLite works for local development and small evaluation instances, but isn't recommended for production environments. For production use, consider an external MySQL or PostgreSQL instance ».
Source : `https://grafana.com/docs/grafana/latest/setup-grafana/installation/`

**Prometheus — RAM : non trouvé. Disque : formule documentée.**
Aucun minimum de RAM n'est publié (ni sur la page d'installation, ni sur la page de stockage, ni dans la FAQ). Ce qui est documenté, verbatim :
> « Prometheus stores an average of only **1-2 bytes per sample**. »
> « `needed_disk_space = retention_time_seconds * ingested_samples_per_second * bytes_per_sample` »
> « we recommend setting the retention size to, at most, **80-85 %** of your allocated Prometheus disk space » (le reste couvrant le surcoût de compaction)

La doc précise aussi que « The current block for incoming samples is kept in memory and is not fully persisted » et que « Prometheus will retain a minimum of three write-ahead log files » — ce qui explique une consommation mémoire dépendante du taux d'ingestion, mais sans chiffre absolu.
Sources : `https://prometheus.io/docs/prometheus/latest/storage/`, `https://prometheus.io/docs/prometheus/latest/installation/`, `https://prometheus.io/docs/introduction/faq/`

**Loki — non trouvé pour le mode monolithique.**
La page de dimensionnement l'indique explicitement, verbatim :
> « Please use this document as a rough guide to specify CPU and Memory requests in your deployment. **This is only documented for microservices/distributed mode at this time.** »

Les seuls chiffres publiés concernent des volumes hors sujet ici : palier « Small » = **< 100 To/mois**, 40 cœurs et 60 Gi de mémoire *au total sur le cluster*. Ces valeurs ne sont pas transposables à un VPS mono-nœud et ne doivent pas être citées comme « exigence Loki ».
**Aucune exigence minimale n'est documentée pour un déploiement single-binary / monolithique.**
Source : `https://grafana.com/docs/loki/latest/setup/size/`

**OpenTelemetry Collector — non trouvé.**
Aucun minimum de RAM, CPU ou disque n'est publié. La page « Scaling the Collector » ne contient aucune valeur absolue ; elle traite du choix des composants à mettre à l'échelle et des signaux de saturation. La doc oriente vers le processeur `memory_limiter` pour *plafonner* la mémoire, et vers le batching et le dimensionnement des files pour absorber les pics — c'est-à-dire une mémoire à contraindre selon la charge, sans chiffre de référence.
Sources : `https://opentelemetry.io/docs/collector/scaling/`, `https://opentelemetry.io/docs/collector/configuration/`

**Total documenté pour la stack Grafana : non calculable.** Seul Grafana publie un chiffre (512 Mo mini ; 2–4 Go au palier « Small »). Prometheus, Loki et l'OTel Collector ne publient aucun minimum de RAM. Toute somme du type « la stack tient dans X Go » serait une estimation, pas un fait sourcé — donc non fournie ici, conformément à la consigne.

### B.2 — SigNoz

**Documenté, et c'est le seul chiffre global de tout le SUJET B.** Verbatim de la doc d'installation Docker :
> « At least **4GB of memory** allocated to Docker »

Ports requis : 8080 (UI), 4317–4318 (OTLP), 8000 (MCP, optionnel).
**CPU : non trouvé. Disque : non trouvé** — la doc d'installation Docker ne donne ni minimum CPU ni minimum disque.
Source : `https://signoz.io/docs/install/docker/`

#### Nuance importante : ce que ClickHouse dit de lui-même

SigNoz annonce 4 Go, mais son moteur de stockage obligatoire est ClickHouse, dont l'éditeur documente des exigences bien supérieures. Verbatim :
> « **The recommended amount of RAM is 32 GB or more.** »
> « **If your system has less than 16 GB of RAM, you may experience various memory exceptions because default settings do not match this amount of memory.** You can use ClickHouse in a system with a small amount of RAM (**as low as 2 GB**), but these setups **require additional tuning and can only ingest at a low rate**. »
> « For small amounts of data (up to ~200 GB compressed), it is best to use as much memory as the volume of data. »
> Disque : « If your budget allows you to use SSD, use SSD. If not, use HDD. SATA HDDs 7200 RPM will do. »

Source : `https://clickhouse.com/docs/operations/tips` (section « RAM »)

→ Les deux affirmations ne se contredisent pas formellement (ClickHouse *peut* tourner à 2 Go), mais elles se tendent : le 4 Go de SigNoz suppose un ClickHouse en dessous du seuil de 16 Go où son propre éditeur annonce des « memory exceptions » avec les réglages par défaut, et un débit d'ingestion volontairement bas. **C'est un fait à peser avant de dimensionner le VPS**, et il est sourcé des deux côtés.
La doc ClickHouse consultée ne mentionne pas AArch64/ARM64 dans cette page — mais l'image `clickhouse/clickhouse-server` est bien multi-arch arm64 (vérifié par manifeste, cf. SUJET A.3).

### B.3 — Point de comparaison utile : GlitchTip

GlitchTip est le seul outil de tout le périmètre à publier des chiffres bas et explicites, verbatim :
> « Recommended system requirements: **512 MB RAM**, x86 or arm64 CPU »
> « Minimum system requirements: **256 MB RAM** when using all-in-one setup. Careful configuration will allow **128 MB + swap**. »
> « Disk usage varies on usage and event size. As a rough guide, a **1 million event per month instance may require 30GB of disk**. »

Source : `https://glitchtip.com/documentation/install`

### B.4 — Coolify (socle, à provisionner en plus)

Verbatim : CPU **2 cores**, RAM **2 GB**, Storage **30 GB of free space**.
Source : `https://coolify.io/docs/get-started/installation`

### Récapitulatif SUJET B

| Composant | RAM documentée | Disque documenté | Source |
|---|---|---|---|
| Coolify (socle) | 2 GB | 30 GB | doc officielle |
| Grafana | 512 MB mini ; 2–4 GB palier Small | 10–20 GB SSD (hôte BDD, palier Small) | doc officielle |
| Prometheus | **non trouvé** | formule `retention × samples/s × 1-2 o/sample` | doc officielle |
| Loki (monolithique) | **non trouvé** | **non trouvé** | doc officielle (explicitement hors périmètre) |
| OTel Collector | **non trouvé** | **non trouvé** | doc officielle |
| **SigNoz (bloc entier)** | **4 GB** | **non trouvé** | doc officielle |
| └ ClickHouse (dép. SigNoz) | 32 GB recommandé ; « memory exceptions » sous 16 GB ; 2 GB possible avec tuning et faible ingestion | SSD conseillé (pas de taille) | doc ClickHouse |
| GlitchTip | 512 MB recommandé / 256 MB mini | ~30 GB / 1 M événements/mois | doc officielle |

Fait notable : **SigNoz est le seul à annoncer un plancher, et il est à 4 Go pour lui seul**, hors Coolify (2 Go) et hors le reste de l'application. C'est le seul élément de comparaison mémoire réellement sourçable entre les deux options.

---

## SUJET C — Email transactionnel : Resend vs Postmark vs Scaleway TEM

Cas d'usage : magic link + code à 6 chiffres. La délivrabilité est un chemin critique.
Convention : les prix marqués **« affiché »** sont lus tels quels sur la page de tarifs officielle ; ceux marqués **« dérivé »** sont calculés à partir des paliers officiels (prix de base + dépassement) — c'est de l'arithmétique sur des chiffres sourcés, pas une estimation.

### C.0 — Verdict d'entrée : le critère 1 élimine deux candidats sur trois

**Resend et Postmark stockent tous deux les données et les logs aux États-Unis. Aucun des deux n'offre de résidence UE.** Ce n'est pas une déduction : les deux le disent explicitement dans leur propre documentation (verbatim ci-dessous). Si la résidence UE est une exigence du projet, **Scaleway TEM est le seul des trois à la satisfaire.**

---

### C.1 — Resend

#### 1. Région d'hébergement des données et des logs → **hors UE ; la « région UE » est un leurre**

Quatre régions d'**envoi** existent : « North Virginia (us-east-1), Ireland (eu-west-1), São Paulo (sa-east-1), Tokyo (ap-northeast-1) ».

Mais la doc précise, sous le titre « Data Residency » — verbatim :
> « Region selection controls where your emails are **routed and sent from**. **It does not control where customer data is stored.** »
> « **All account data, including email metadata, logs, and API records, is stored in the United States regardless of the sending region you select.** Choosing `eu-west-1` means your emails are dispatched from Ireland, but your Resend account data still resides in the US. »

Source : `https://resend.com/docs/dashboard/domains/regions` (vérifié verbatim dans le HTML de la page)

Confirmé sur la page GDPR : « Resend stores customer data in the United States, including message content, delivery logs, webhook payloads, and account records » et « **there is no setting today that moves stored data to the EU** ».
Source : `https://resend.com/security/gdpr`

**Quand se fait le choix ?** À la création du **domaine**, pas du compte. Réversible uniquement par destruction/recréation : « Delete your current domain… Add the same domain again, selecting the new region. Update your DNS records ». Même source.
Base légale des transferts : SCC dans le DPA + EU-U.S. Data Privacy Framework (avec extension UK). Rétention des logs : « 30 days on Free, Pro, and Scale plans ». Source : `https://resend.com/security/gdpr`

→ **Sélectionner `eu-west-1` ne rend pas Resend conforme à une exigence de résidence UE.** C'est le piège principal de ce comparatif.

#### 2. Tarif — **affiché**

Table officielle (USD/mois), vérifiée verbatim sur `https://resend.com/pricing.md` :

| Plan | Prix affiché | Emails/mois inclus | Dépassement / 1 000 |
|---|---|---|---|
| Free | $0/mo | 3 000 | — |
| **Pro** | **$20/mo** | **50 000** | $0.90 |
| **Pro** | **$35/mo** | **100 000** | $0.90 |
| Scale | $90/mo | 100 000 | $0.90 |
| Scale | $160/mo | 200 000 | $0.80 |

- **30 000/mois → Pro $20/mo** (50 000 inclus, donc couvert sans dépassement).
- **100 000/mois → Pro $35/mo.**

Inclus : Pro = 10 domaines, 5 endpoints webhook, pas de limite journalière ; Scale = 1 000 domaines, 10 endpoints webhook. Rétention 30 jours. Add-ons : IP dédiée **$30/mo**, SSO $150/mo.
Nombre d'utilisateurs par plan : **non trouvé** sur la page de tarifs.

#### 3. Webhooks bounce/complaint → **oui, les plus riches des trois**

18 types d'événements documentés, dont `email.bounced`, `email.complained`, `email.delivered`, `email.delivery_delayed`, `email.failed`, `email.opened`, `email.clicked`, `email.suppressed`, `suppression.added/removed`. POST HTTP direct.
Source : `https://resend.com/docs/dashboard/webhooks/event-types`

#### 4. Réputation → pool partagé par défaut ; **pas de séparation imposée**

> « By default, all Resend users use our shared IPs, which are a collection of IPs shared across many senders »
Source : `https://resend.com/docs/knowledge-base/how-do-dedicated-ips-work`

IP dédiée : **$30/mo**, « Available on the Scale plan to customers exceeding 3,000 emails sent per day. Includes automatic warmup, monitoring, and autoscaling ». Source : `https://resend.com/pricing.md`

**Séparation transactionnel/marketing imposée : NON — non trouvé.** Resend commercialise les deux (Transactional et Marketing) sur le même compte ; aucune doc officielle n'impose la séparation ni ne documente des plages IP distinctes. C'est la différence structurelle avec Postmark et Scaleway.

#### 5. Plan gratuit et contraintes

- Free : **3 000 emails/mois ET 100 emails/jour** (quota journalier propre au plan Free, jour calendaire UTC, erreur 429 `daily_quota_exceeded`), 3 domaines, rétention 30 j. Sources : `https://resend.com/pricing.md`, `https://resend.com/docs/api-reference/rate-limit`
- Rate limit API : **10 req/s par équipe** (relevable sur demande). Même source.
- Vérification de domaine **obligatoire** : « You must add and verify at least one domain to send emails with Resend » (DKIM + SPF + DMARC). Source : `https://resend.com/docs/dashboard/domains/introduction`
- Revue manuelle de compte / warm-up imposé / plafond initial : **non trouvé** (aucune procédure d'approbation documentée → mise en production immédiate).
- Restriction d'envoi vers adresses non vérifiées en mode test : **non trouvé**.

#### Changement récent

Passage au pay-as-you-go (dépassement facturé par tranche de 1 000) annoncé le **5 décembre 2025**, page mise à jour le **9 juillet 2026**. Source : `https://resend.com/changelog/pay-as-you-go-pricing`

---

### C.2 — Postmark

#### 1. Région d'hébergement → **US uniquement, et c'est assumé comme définitif**

Verbatim de la page « EU Data Protection » :
> « Postmark's primary data and servers are hosted at **Deft's data center (located outside of Chicago)**, and Amazon Web Services (AWS). **We currently don't have plans to add servers in the EU** (GDPR does not require physical servers in the EU). »

Source : `https://postmarkapp.com/eu-privacy` (vérifié verbatim dans le HTML)

> « Postmark is a US-based company and we also store our data in the US, including personal data of our customers, and the data we process on behalf of our customers. The legal basis for the transfer or processing of personal data in the USA… is **Standard Contractual Clauses (SCCs)** »
Source : `https://postmarkapp.com/support/article/1218-gdpr-faq`

⚠️ **Piège de vocabulaire à écarter** : les « servers » et « message streams » de Postmark sont des **objets logiques d'organisation**, pas des régions d'hébergement. Il n'existe **aucun** réglage de résidence des données. Source : `https://postmarkapp.com/support/article/1137-servers-faq`
DPA / SCC : `https://postmarkapp.com/dpa`

#### 2. Tarif — paliers **affichés**, coût à 30k/100k **dérivé**

La page de tarifs affiche un curseur dont les paliers sont 10 000 / 50 000 / 125 000 / 300 000 / 700 000 / 1 500 000 / 3 000 000 emails/mois, avec un prix de base par palier et un dépassement au 1 000.

Texte affiché sur la page : « Basic **$15.00** /mo … Starting at 10,000 emails/month. Extra emails @ **$1.80 / 1,000** » ; Pro **$16.50** / **$1.30** ; Platform **$18.00** / **$1.20**.

| Palier (emails/mois) | Basic | Pro | Platform |
|---|---|---|---|
| 10 000 | $15.00 ($1.80/1k) | $16.50 ($1.30/1k) | $18.00 ($1.20/1k) |
| 50 000 | $55.00 ($1.80) | $60.50 ($1.30) | $66.00 ($1.20) |
| 125 000 | $115.00 ($1.80) | $126.50 ($1.30) | $138.00 ($1.20) |
| 300 000 | $245.00 ($1.70) | $269.50 ($1.25) | $294.00 ($1.15) |

Source : `https://postmarkapp.com/pricing`. ⚠️ **Réserve de méthode** : le détail palier par palier provient du script de tarification chargé par cette page (`https://postmarkapp.com/dist/js/pricing.<hash>.js`). C'est bien une source de première main (l'actif servi par Postmark lui-même), mais ce n'est pas du texte lisible sur la page ; seules les lignes « Starting at… » le sont. À revalider dans l'UI avant de s'engager.

Coûts encadrant les volumes cibles — **dérivés** des paliers ci-dessus :
- **30 000/mois** : Basic ≈ **$51.00** (15 + 20×1,80) · Pro ≈ **$42.50** · Platform ≈ **$42.00**
- **100 000/mois** : Basic ≈ **$145.00** (55 + 50×1,80) · Pro ≈ **$125.50** · Platform ≈ **$126.00**

Inclus : rétention **45 jours** par défaut (paramétrable 7→365 j sur Pro/Platform, add-on à partir de $5/mo) ; domaines 5 / 10 / illimité ; utilisateurs 4 (Basic) / 6 (Pro) / illimité (Platform) ; « Unlimited emails/day ».

→ **Postmark est le plus cher des trois à 100 000/mois** (~$126 contre $35 pour Resend et ~€25 pour Scaleway Essential).

#### 3. Webhooks bounce/complaint → **oui**

Types documentés : **Delivery, Bounce, Spam complaint, Open tracking, Click, Subscription change, Inbound, SMTP API Error**. POST HTTP direct.
Source : `https://postmarkapp.com/developer/webhooks/webhooks-overview`

#### 4. Réputation → **le meilleur des trois, et la séparation est imposée jusqu'aux IP**

Verbatim :
> « **Transactional and broadcast (bulk) traffic does not mix in Postmark, including IP ranges** »
> « Broadcast messages… **must** be sent through Broadcast Message Streams »

Source : `https://postmarkapp.com/support/article/1082-what-types-of-messages-are-a-good-fit-for-postmark`
Message Streams : `https://postmarkapp.com/message-streams`

IP dédiée : « Starts at **$50/month per IP** … available to customers sending **300 000 emails per month or more**. Only available on Pro plans or higher ». En dessous : pool partagé « high quality, vetted IPs ». Source : `https://postmarkapp.com/pricing`

→ À 30k–100k/mois, l'IP dédiée est **hors de portée** (seuil 300k). On dépend donc du pool partagé — mais c'est précisément là que la revue manuelle des comptes (point 5) et la séparation imposée font la valeur de Postmark.

#### 5. Plan gratuit et contraintes → **revue manuelle obligatoire**

- Free (Developer) : **100 emails/mois**, « it never expires or runs out ». Source : `https://postmarkapp.com/pricing`
- **Approbation manuelle du compte obligatoire avant tout envoi externe** — verbatim :
  > « **Until your account is approved, you won't be able to send to any email address outside the domains you've added to your account and verified.** »
  > « The review process will be completed in **less than 24 hours on weekdays** and a little longer on the weekends. »
  Adresse puits de test : `test@blackhole.postmarkapp.com`.
  Source : `https://postmarkapp.com/support/article/1084-how-does-the-account-approval-process-work`
- DKIM/SPF/DMARC dans toutes les offres. Source : `https://postmarkapp.com/pricing`
- Warm-up imposé / plafond de volume initial explicite : **non trouvé** (la contrainte documentée est la restriction aux domaines vérifiés avant approbation).

#### Changement récent

**6 août 2025** : refonte des plans 10 000 emails/mois — Pro 10K passe de **$60.50 → $16.50/mois** et Platform 10K de **$138 → $18/mois**, avec descente de fonctionnalités (inbound, collaboration) vers les petits volumes.
Source : `https://postmarkapp.com/updates/pro-and-platform-tier-features-now-accessible-to-lower-volume-plans`

---

### C.3 — Scaleway TEM

#### 1. Région → **fr-par (Paris) uniquement ; UE de bout en bout**

> « **Transactional Email is only available in the fr-par region.** »
Source : `https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-capabilities-and-limits/` (page « Reviewed on October 29, 2025 »)
→ **Amsterdam (nl-ams) et Varsovie (pl-waw) ne sont pas disponibles pour TEM.**

Données **et logs** en UE — verbatim (vérifié dans le HTML) :
> « For our Transactional Email service, **no personal data is transferred outside the EU**, so a TIA was not required. **All data is hosted and processed entirely within the European Union.** »
> « Does Scaleway engage any non-EU sub-processors for the processing of Transactional Emails? **No.** The entire Transactional Email (TEM) technical stack is fully managed by Scaleway, within the EU. Across all our services, we maintain a default policy of no data transfers outside the EU. »

Source : `https://www.scaleway.com/en/docs/transactional-email/faq/` (§ Privacy and security, « Reviewed on September 24, 2025 »)

⚠️ **Nuance à ne pas masquer** — la même phrase continue :
> « **In rare, exceptional cases, we may work with U.S. or Canadian partners.** Such transfers are always governed by recognized adequacy mechanisms (e.g. the EU–U.S. Data Privacy Framework) and by our Standard Contractual Clauses as set out in Article 11 of our Data Processing Agreement. »

Donc « zéro transfert » est la politique par défaut assortie d'une réserve contractuelle, pas une garantie absolue. C'est tout de même très au-dessus des deux autres, qui stockent *structurellement* aux États-Unis.
Liste des sous-traitants : `https://www.scaleway.com/en/subprocessorlist/`

**Choix de la région** : aucun choix à faire — région unique, donc pas de décision irréversible à la création du compte. Les plans sont scopés au **Projet**. Source : `https://www.scaleway.com/en/docs/transactional-email/how-to/manage-tem-plans/`
Durée de rétention des logs d'activité : **non trouvé**.

#### 2. Tarif — **affiché**

Deux plans seulement, verbatim de la page produit officielle :

| Plan | Prix affiché | Inclus | Au-delà | Domaines | Webhooks |
|---|---|---|---|---|---|
| **Essential** | Pay as you go | 300 emails | **+€0.25 / 1 000 emails** | 5 | 1 par domaine |
| **Scale** | **€80/mois** | **100 000 emails** | **+€0.20 / 1 000 emails** | illimités | illimités |

Source : `https://www.scaleway.com/en/transactional-email-tem/` (chaînes « 300 emails included, then +€0.25 per 1,000 emails » et « Scale €80/month … 100,000 emails included, then +€0.20 per 1,000 emails » vérifiées verbatim dans le HTML)

Coûts — **dérivés** : Essential à 30 000 ≈ **€7,43/mois** ((30 000−300)/1 000 × 0,25) ; Essential à 100 000 ≈ **€24,93/mois** ; Scale = **€80/mois** forfaitaire.
→ **Il n'y a pas de palier intermédiaire : 30k et 100k tombent tous deux dans Essential.** Scale ne se justifie que pour l'IP dédiée managée + le SLA 99,9 %.

Scale inclut : IP dédiée managée, SLA 99,9 %, blocklist manuelle. **Engagement de 30 jours** :
> « A 30-day commitment is required to ensure a progressive and effective warm-up of the IP address. If you decide to downgrade or cancel your account before the end of the commitment period, you will still be charged for the 30-day period. »
Source : `https://www.scaleway.com/en/docs/transactional-email/how-to/manage-tem-plans/`

Facturation **par destinataire** (CC inclus) : « each recipient counts as a separate email… if you send an email to one main recipient and three recipients in CC, you will be billed for four emails ». Sans effet pour du magic link (1 destinataire). Source : `https://www.scaleway.com/en/transactional-email-tem/`
Utilisateurs : géré par l'IAM Scaleway, pas de limite par plan → **non trouvé**.

#### 3. Webhooks bounce/complaint → **oui, mais c'est le point faible**

Événements officiels : `email_dropped` (hard bounce), `email_deferred` (soft bounce), `email_spam`, `email_blocklisted`, `blocklist_created`, `email_delivered`, `email_queued`, `email_mailbox_not_found`, `unknown_type`.
Sources : `https://www.scaleway.com/en/docs/transactional-email/reference-content/webhook-events-payloads/` (« Reviewed on October 01, 2025 »), `https://www.scaleway.com/en/docs/transactional-email/how-to/create-webhooks/`

**Trois réserves sérieuses :**
1. **Encore en bêta** : prérequis officiel « Have the necessary quotas to use Transactional Email Webhooks **during beta**. You can request quotas from the Scaleway betas page ».
2. **Pas de POST HTTP direct** : « Currently, webhooks are integrated **exclusively** with the Scaleway Topics and Events. **Billing for webhooks is based on the Scaleway Topics and Events billing** ». Il faut donc un topic intermédiaire (type SNS), facturé à part, et un consommateur côté application. **Sur Essential : 1 seul webhook par domaine.**
3. **Pas de tracking d'ouverture/clic** — absent de la liste des event types (cohérent avec un service purement transactionnel ; sans importance pour du magic link, voire souhaitable).

→ **C'est le point à valider en premier**, puisque bounce/complaint est déclaré chemin critique.

#### 4. Réputation → **marketing interdit par contrat**

> « Scaleway's Transactional Email platform is dedicated to sending transactional emails only. **You cannot use Transactional Email to send marketing emails.** »
Source : `https://www.scaleway.com/en/docs/transactional-email/faq/` (vérifié verbatim) — renvoi à la politique anti-spam PDF, opposable via les CGV : `https://tem.s3.fr-par.scw.cloud/antispam_policy.pdf`

IP partagée par défaut ; **IP dédiée managée incluse dans Scale (€80/mois)**, sans seuil de volume imposé, avec « **Automatic IP Warm-up** — Controlled progression of sending volumes to establish a good reputation », monitoring et actions correctives.
Recommandation officielle : « If you send less than 10,000 emails per month, a dedicated IP may struggle to maintain a good reputation » ; utile au-delà de « more than 1000 emails per day ».
Contrainte structurelle : « It is not possible to use a shared and a dedicated IP on the same Project… you need to do so on a separate project » et « When you activate a dedicated IP on a project, **all emails from the Project** will be sent via this IP ».
Source : `https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-dedicated-ip/`

→ À 30k–100k/mois, Scaleway est **le seul des trois à rendre une IP dédiée accessible** (Resend exige >3 000/jour sur Scale ; Postmark exige ≥300 000/mois). À 100k/mois (~3 300/jour) on est au-dessus du seuil de pertinence des 1 000/jour.

#### 5. Plan gratuit et contraintes → **LE point de vigilance**

- Franchise gratuite : **300 emails/mois** (pas un plan gratuit, une franchise sur Essential) : « if you use the free tier of 300 emails per month, and you end up sending 305 emails, you will only be billed for five emails ». Source : `https://www.scaleway.com/en/docs/transactional-email/faq/`
- ⚠️ **QUOTA PAR DÉFAUT : 10 000 emails/mois** — table officielle vérifiée verbatim : « Maximum number of emails per month → Default Quota **10,000** / Maximum Quota **Unlimited** / Upgradable **Yes** ».
  > « **New users may face stricter initial limits**, while well-known customers can benefit from higher limits… **These quotas are subject to validation by the Scaleway Support team.** »
  > « If you have **validated your payment method and identity** and want to increase your limits beyond the values shown, **contact our Support team** »
  Source : `https://www.scaleway.com/en/docs/transactional-email/reference-content/tem-capabilities-and-limits/`
  → **À 30 000–100 000 emails/mois, un ticket support avec vérification d'identité et de moyen de paiement est un prérequis bloquant.** Le quota par défaut est 3 à 10 fois inférieur au besoin.
- Autres quotas par défaut : 10 pièces jointes/email, 10 destinataires/email, 2 MB via API, 50 MB via SMTP. Plus de quota horaire depuis le 1er décembre 2023.
- Vérification de domaine : **SPF + DKIM obligatoires**, DMARC et MX fortement recommandés. « The verification of your domain **might take up to 48 hours** » ; « Scaleway performs regular validity checks on your domain that can impact its validity » ; le `include` SPF récursif **n'est pas** supporté. Source : `https://www.scaleway.com/en/docs/transactional-email/how-to/authenticate-domain/` (validée 2025-10-01)
- Mode sandbox / restriction vers adresses non vérifiées : **non trouvé**.

#### Changement récent

**Non trouvé** — aucun changelog officiel de tarif TEM identifié pour 2025-2026. Pages de doc revues entre le 24/09/2025 et le 13/11/2025 (donc à jour, pas abandonnées).

---

### C.4 — Tableau comparatif sur les cinq critères exacts

| Critère | Resend | Postmark | Scaleway TEM |
|---|---|---|---|
| **1. Résidence données + logs** | ❌ **US uniquement.** `eu-west-1` = envoi depuis l'Irlande seulement ; « no setting today that moves stored data to the EU ». Choix à la création du **domaine**, réversible par recréation. SCC + DPF | ❌ **US uniquement** (Deft Chicago + AWS). « No plans to add servers in the EU ». Aucun réglage. SCC | ✅ **fr-par (Paris), région unique.** « All data is hosted and processed entirely within the EU », aucun sous-traitant non-UE (réserve : partenaires US/CA « rare, exceptional cases » sous DPF+SCC). Aucun choix à faire |
| **2. Prix 30k / 100k** | **$20** / **$35** /mois (Pro) — affiché | ~$42–51 / ~$126–145 /mois — dérivé | **≈ €7,4** / **≈ €25** /mois (Essential) — dérivé ; ou €80 (Scale, IP dédiée) — affiché |
| **3. Webhooks bounce/complaint** | ✅ 18 events, POST direct, `email.bounced` + `email.complained` + opens/clicks | ✅ 8 types, POST direct, Bounce + Spam complaint + opens/clicks | ⚠️ 9 events **mais bêta**, **via Topics & Events facturé à part**, 1 webhook/domaine en Essential, pas d'opens/clicks |
| **4. Réputation / séparation** | Pool partagé ; IP dédiée $30/mo sur Scale (>3 000/jour). **Séparation transac/marketing NON imposée** | Pool « vetted » ; IP dédiée $50/mo mais **≥300 000/mois** (hors de portée ici). ✅ **Séparation imposée, plages IP distinctes** | Pool partagé ; **IP dédiée managée incluse à €80/mo, warm-up auto, sans seuil de volume**. ✅ **Marketing interdit par contrat** |
| **5. Gratuit / contraintes** | 3 000/mois **et 100/jour** ; domaine DKIM/SPF/DMARC obligatoire ; **aucune revue manuelle** → prod immédiate ; 10 req/s | 100/mois ; **approbation manuelle obligatoire (<24 h en semaine)**, envoi limité aux domaines vérifiés avant approbation ; rétention 45 j | 300/mois ; ⚠️ **quota défaut 10 000/mois → ticket support + vérif. identité obligatoire pour 30k–100k** ; vérif. domaine jusqu'à 48 h ; Scale = engagement 30 j |

### C.5 — Lequel ressort

**Si la résidence UE est exigée : Scaleway TEM, sans concurrent.** C'est le seul des trois à garantir par écrit données *et* logs en UE, et il est aussi le moins cher (≈€25/mois à 100k contre $35 Resend et ~$126 Postmark) et le seul à rendre une IP dédiée managée avec warm-up automatique accessible à ce volume (€80/mois). Sa politique interdisant le marketing protège structurellement la réputation des magic links. **Deux verrous à lever avant de s'engager** : faire relever le quota par défaut de 10 000/mois (ticket support + vérification d'identité), et valider les webhooks encore en bêta qui imposent un détour par Topics & Events facturé séparément — or bounce/complaint est déclaré chemin critique.

**Si la résidence UE n'est pas exigée : Postmark** pour la délivrabilité pure — c'est le seul à imposer la séparation transactionnel/broadcast jusqu'aux plages IP et à filtrer manuellement les comptes, ce qui assainit le pool partagé dont on dépendra de toute façon à 30k–100k. Le prix (~$126/mois à 100k) est le coût de cette rigueur.

**Resend** est le meilleur compromis DX/prix/webhooks ($35/mois à 100k, 18 événements, POST direct, mise en production immédiate), mais sur les deux critères qui comptent ici il est le plus faible : `eu-west-1` ne déplace pas les données hors des États-Unis, et aucune séparation transactionnel/marketing n'est imposée.

---

## Annexe — Reproduire les vérifications

```bash
# arm64 sur un tag donné
docker manifest inspect glitchtip/glitchtip:6.2.6 \
  | jq -r '.manifests[] | select(.platform.os=="linux")
           | "\(.platform.os)/\(.platform.architecture)"'

# date de publication d'un tag Docker Hub
curl -s https://hub.docker.com/v2/repositories/glitchtip/glitchtip/tags/latest \
  | jq '{tag_last_pushed, digest}'

# lister les tags GHCR (token anonyme)
T=$(curl -s "https://ghcr.io/token?scope=repository:umami-software/umami:pull&service=ghcr.io" | jq -r .token)
curl -s -H "Authorization: Bearer $T" https://ghcr.io/v2/umami-software/umami/tags/list | jq .
```

Environnement de vérification : Docker Engine 29.7.2 (API 1.55), hôte `linux/amd64` — l'inspection de manifeste est indépendante de l'architecture de l'hôte.
