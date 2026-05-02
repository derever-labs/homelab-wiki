---
title: Zot Container Registry
description: OCI-native Container Registry mit S3 Backend, Redis MetaDB und Pull-Through Cache
tags:
  - docker
  - registry
  - container
  - infrastructure
  - s3
  - zot
---

# Zot Container Registry

Zot ist eine OCI-native Container Registry mit S3-Backend, Redis-MetaDB und Pull-Through Cache für Docker Hub, ghcr.io und quay.io. Als Nomad System Job läuft eine Instanz auf jedem Client-Node und teilt sich S3-Bucket und Redis-Cache auf dem NAS.

## Übersicht

- URL (intern): `localhost:5000` (jeder Node, via System Job)
- URL (extern): `registry.ackermannprivat.ch`
- Deployment: Nomad Job `infrastructure/zot-registry.nomad` (System Job, `type = "system"`, 3 Allocs)
- Storage Backend: MinIO S3 auf [NAS](../nas-storage/index.md)
- MetaDB: Redis cacheDriver, Port 6380 (client-04/05 oder NAS-Redis)
- Auth: htpasswd -- nomad-client (read), ci-push (read+write), anonymousPolicy=[]
- UI: Eingebaut (Zot UI Extension)

## Warum Zot statt Docker Registry v2?

- Pull-Through Cache: Docker Registry v2 unterstützt nur Docker Hub -- Zot unterstützt Docker Hub, ghcr.io, quay.io mit Whitelist
- UI: Docker Registry v2 hat kein UI -- Zot hat eine eingebaute Web-UI
- Search: Docker Registry v2 hat keine Suche -- Zot hat GraphQL API
- OCI-native: Docker Registry v2 nutzt das Docker Schema -- Zot ist nativ OCI
- Docker-Kompatibilität: Native bei v2, bei Zot via `compat: ["docker2s2"]`
- Auth: Docker Registry v2 hat htpasswd -- Zot hat htpasswd mit anonymousPolicy=[] und Whitelist-basiertem Sync

## Architektur

```d2
direction: down

S3: "MinIO S3 (NAS)\nBucket: zot-registry" { shape: cylinder }
Zot1: "Zot\nlocalhost:5000\n(client-04)" { tooltip: 10.0.2.124 }
Zot2: "Zot\nlocalhost:5000\n(client-05)" { tooltip: 10.0.2.125 }
Zot3: "Zot\nlocalhost:5000\n(client-06)" { tooltip: 10.0.2.126 }
Cache: "On-Demand Proxy Cache\nDocker Hub, ghcr.io,\nquay.io"

S3 -> Zot1
S3 -> Zot2
S3 -> Zot3
Zot1 -> Cache
Zot2 -> Cache
Zot3 -> Cache
```

**Vorteile:**
- Alle Instanzen teilen S3 Storage (kein Sync nötig)
- Ein Push auf Node A ist sofort auf B/C verfügbar
- On-Demand Proxy Cache für 4 Upstream-Registries
- Fallback zu Docker Hub wenn Registry nicht erreichbar

## Konfiguration

Die vollständige Konfiguration (Zot Config, S3 Storage, Redis CacheDriver, Proxy Cache, Auth) ist im Nomad Job definiert: `infrastructure/zot-registry.nomad`

**Wichtig:** `compat: ["docker2s2"]` in der HTTP-Konfiguration ist nötig, damit Docker-Format Manifeste (v2 Schema 2) akzeptiert werden. Ohne dieses Setting schlägt der Push von Multi-Arch Images fehl mit `manifest invalid`.

### Authentifizierung

ZOT nutzt htpasswd mit zwei Usern:

- nomad-client -- Read-only (pull). Alle Nomad-Allokationen und der Docker Daemon nutzen diesen Account.
- ci-push -- Read-write (pull + push). Einzig autorisierter Push-Pfad für CI/CD-Pipelines. Credentials als GitHub-Secrets hinterlegt.

`anonymousPolicy = []` -- kein anonymer Zugriff.

### Redis CacheDriver

Alle ZOT-Instanzen nutzen Redis als geteilte Metadaten-Datenbank (`cacheDriver: redis`, `remoteCache: true`, Port 6380). Das ermöglicht schnelle Starts nach dem ersten ParseStorage-Durchlauf, da Metadaten aus Redis kommen statt aus S3 rekonstruiert werden.

::: warning Cold-Start
Beim absoluten Kaltstart (leerer Bucket, leerer Redis) durchläuft ZOT trotzdem ParseStorage. Erst danach sind Folgestarts schnell.
:::

### Proxy Cache Registries

Alle Registries laufen mit Whitelist-Prefixes. Anfragen ausserhalb der Whitelist werden nicht synchronisiert.

- Docker Hub: 45 explizite Namespace-Prefixes (library, bitnami, linuxserver, grafana, prometheus, influxdb, nginx, redis, postgres, mariadb, mysql, mongo, rabbitmq, traefik, consul, vault, gitea, n8nio, minio, nextcloud, sonarqube, portainer, pihole, homeassistant, emqx, eclipse-mosquitto, zigbee2mqtt, eclipse, prom, cadvisor, zwavejs, zwave, dozzle, duplicati, kavita, komga, trilium, paperless, filebrowser, uptime-kuma, changedetection, homer, dasherr, homarr, vikunja, vaultwarden, mealie, audiobookshelf, stash) -- Sync-Credentials (nomad-client)
- GitHub Container Registry (ghcr.io): 15 Namespace-Prefixes (goauthentik, project-zot, renovatebot, linuxserver, immich-app, jellyfin, paperless-ngx, crowdsec, dani-garcia, nzbgetcom, nzbgetvip, sonarr, radarr, whisperx, imio) -- Sync-Credentials (ci-push PAT)
- Quay.io: offener Prefix -- ohne Credentials

::: info LinuxServer.io: Upstream ghcr.io statt lscr.io
Image-Pfade in den Nomad-Jobs lauten weiterhin `linuxserver/jellyfin` o.ä. (kein `ghcr.io/`-Prefix), obwohl ZOT intern von `ghcr.io` pullt. Grund: `lscr.io` ist kein eigenständiges OCI-Registry, sondern ein Scarf-Redirect-Service -- der `/v2/`-Endpunkt antwortet mit 405, und Auth-Tokens kommen ohnehin von `ghcr.io`. ZOT kam mit dem Redirect nicht sauber klar. Umstellung auf `ghcr.io` als direktem Upstream entfernt die Indirektion. Die Tags auf `ghcr.io/linuxserver/...` sind identisch mit jenen auf `lscr.io/linuxserver/...`, deshalb können die Nomad-Job-Pfade unverändert bleiben.
:::

### On-Demand Sync Verhalten

Zot synchronisiert Images bei `onDemand: true` bei jedem Request mit dem Upstream. Das bedeutet:

- **Gecachte Images mit unverändertem Tag:** Zot prüft kurz beim Upstream ob eine neuere Version existiert ("already synced") und liefert sofort aus dem S3-Cache.
- **Rate Limiting:** Wenn der Upstream (z.B. Docker Hub) ein 429 zurückgibt, blockiert der Request bis zum nächsten Retry.
- **Konfiguration:** `maxRetries: 1`, `retryDelay: 15s` — maximale Blockierzeit pro Image ca. 15 Sekunden (statt bis zu 15 Minuten bei der alten Konfiguration mit `maxRetries: 3`, `retryDelay: 5m`).

::: warning Nach Zot-Restart
Nach einem Restart aller 3 Zot-Instanzen versuchen die Docker-Daemons auf allen Nodes gleichzeitig, ihre Images via Zot zu aktualisieren. Da alle Instanzen die gleichen Docker Hub Credentials nutzen, wird das Rate Limit schnell erreicht. Die Queue arbeitet sich mit den neuen Retry-Werten aber deutlich schneller ab (~15s statt ~5min pro Rate-Limited Request).
:::

### S3 Storage

- Endpoint: MinIO auf NAS (Port 9000) -- siehe [NAS-Speicher](../nas-storage/index.md)
- Bucket: zot-registry
- Root Directory: /zot
- Credentials: Vault `kv/data/zot-s3` (Workload Identity)

### Sync Credentials

Damit der Pull-Through Cache nicht in Docker Hubs Anonymous-Rate-Limit (100/6h) läuft, authentisiert sich Zot beim Sync gegen einen dedizierten Docker-Hub-Account und erhält damit das Authenticated-Limit (200/6h).

- Vault-Pfad: `kv/data/zot-registry` (Workload Identity)
- Account: Eigener Docker Hub Service-Account mit Personal Access Token, Public Read (kein Push)
- htpasswd-Hashes: nomad-client und ci-push ebenfalls in `kv/data/zot-registry`

::: tip PAT-Rotation
Personal Access Token rotieren: neuen Token im Docker Hub Web-UI erzeugen, in Vault aktualisieren, dann Zot-Job neu deployen (`nomad job run`) damit Nomad das Sync-Credentials-Template re-rendert. Ein blosser Restart reicht nicht.
:::

### Retention

Zwei Policies (produktiv seit 2026-04-19):

- Whitelist-Policy: alle erlaubten Docker-Hub- und ghcr.io-Namespaces + lokale Images (homelab/*, immo-monitor/*, timber-viewer-*) -- `keepTags = 10`, `deleteUntagged = true`
- Spam-Killer-Policy: alle übrigen Repos -- `keepTags = 0`, `deleteUntagged = true`. Räumt nicht-whitelisted Einträge automatisch auf.

Die Retention ersetzt die früheren externen Purge-Tools (DEPRECATED).

### Docker daemon.json

Auf allen Nodes ist `localhost:5000` als Registry-Mirror konfiguriert (verwaltet durch Ansible). Docker versucht erst localhost:5000 (Zot), bei Nichterreichbarkeit automatisch Docker Hub direkt.

## Backup

| Pfad | Inhalt |
| :--- | :--- |
| MinIO: zot-registry/* | Alle Registry Blobs und Manifeste |

**Restore:** MinIO Bucket wiederherstellen, dann Nomad Job starten.

### DNS-Abhängigkeit (v10.2, 24.04.2026)

Zot läuft mit `network_mode = "host"` im Nomad Job, hat aber **explizit** `dns_servers = ["1.1.1.1", "8.8.8.8"]` gesetzt. Damit ist der ZOT-Container komplett unabhängig von internen DNS-Servern (Pi-hole). Das ist bewusst so:

- Upstream-Registries (`registry-1.docker.io`, `ghcr.io`) werden direkt über Public DNS aufgelöst -- kein Hop über Pi-hole.
- Der MinIO-S3-Endpoint ist als IP (`http://10.0.0.200:9000`) konfiguriert, keine DNS-Auflösung nötig.
- Die Redis-URL (`redis://redis-zot...`) wird nicht mehr zur Laufzeit via Consul-DNS aufgelöst, sondern **zur Deploy-Zeit per Consul-Template** in die `config.json` gerendert (<span v-pre>`{{ range service "redis-zot" }}...{{ end }}`</span>). ZOT sieht zur Laufzeit nur eine feste IP:Port.

Ergebnis: ZOT ist zur Runtime nicht mehr vom Pi-hole und nicht mehr vom Consul-DNS abhängig. Ein Ausfall einer der beiden Schichten crasht ZOT nicht mehr.

::: warning Vorfall 2026-04-23 (gefixt)
Zuvor hatte ZOT `dns_servers = ["10.0.2.1", "10.0.2.2"]` (Pi-hole) gesetzt und `redis-zot.service.consul` zur Runtime auflösen müssen. Pi-hole kennt keine `.service.consul`-Records → ZOT crashte im Startup. Parallel hatte `redis-zot.nomad` sein Image aus `localhost:5000/library/redis:7-alpine` gezogen (also aus ZOT selbst) → zirkulärer Deadlock. Fixes: DNS auf public, Consul-Template für Redis-URL, `redis-zot` Image auf `docker.io/library/redis:7-alpine`. Details im ClickUp-Task Privat IT Generell 86c9g378x.
:::

## Troubleshooting

### Langsame Image Pulls (>15s)

1. **DNS prüfen:** DNS-Auflösung von `registry-1.docker.io` via lxc-dns-01 testen -- muss sofort antworten
2. **Rate Limit prüfen:** Zot-Container-Logs auf `TOOMANYREQUESTS` prüfen -- wenn Docker Hub 429 zurückgibt, warten bis Rate Limit abläuft
3. **Zot Health prüfen:** Zot-Endpunkt `http://localhost:5000/v2/` -- muss 200 zurückgeben

### Nach Cluster-Restart

Nach einem Restart aller Nodes können Image-Pulls temporär langsam sein (Docker Hub Rate Limiting). Das normalisiert sich nach 10-15 Minuten.

## Historie

- ~2025-11: Harbor (3-way Replication, 8 Container pro Instanz)
- 29.12.2025: Migration zu Docker Registry v2 (Zwischenlösung)
- 29.12.2025: Migration zu Zot Registry (OCI-native, On-Demand Cache)
- 21.02.2026: Fix: `compat: ["docker2s2"]` für Multi-Arch Push Support
- 22.02.2026: Fix: `retryDelay: 5m → 15s`, `maxRetries: 3 → 1` -- verhindert 5min+ Blockierungen bei DNS- oder Rate-Limit-Problemen
- 18.03.2026: S3-Credentials aus Nomad-Job in Vault migriert (`kv/data/zot-s3`), Vault Workload Identity aktiviert
- 14.04.2026: Upstream `lscr.io` → `ghcr.io` umgestellt (Scarf-Redirect war OCI-inkompatibel)
- 18./19.04.2026: Sanierung -- htpasswd Auth (nomad-client/ci-push), Redis cacheDriver, Retention-Policy (Whitelist + Spam-Killer), CI/CD-Pipelines auf ci-push umgestellt
- 23.04.2026: Bootstrap-Deadlock-Fix -- `redis-zot` pullt Image direkt von `docker.io` (statt aus ZOT selbst), ZOT-DNS auf Public (1.1.1.1/8.8.8.8), Redis-URL als Consul-Template zur Deploy-Zeit. Vermeidet zirkuläre Abhängigkeit bei Kaltstart.

## Verwandte Seiten

- [Storage NAS](../nas-storage/index.md) -- MinIO S3 Backend auf Synology NAS
- [DNS-Architektur](../dns/index.md) -- DNS-Auflösung für Upstream-Registries
- [Cluster-Neustart](../_querschnitt/cluster-restart.md) -- Verhalten der Registry nach Cluster-Restart

