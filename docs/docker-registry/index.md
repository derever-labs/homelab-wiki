---
title: Zot Container Registry
description: OCI-native Container Registry mit Linstor-CSI DRBD Volume, BoltDB MetaDB und Pull-Through Cache
tags:
  - docker
  - registry
  - container
  - infrastructure
  - linstor
  - zot
---

# Zot Container Registry

Zot ist eine OCI-native Container Registry mit Linstor-CSI DRBD-Volume, BoltDB (embedded) und Pull-Through Cache für Docker Hub, ghcr.io und quay.io. Als Nomad Service Job läuft eine Instanz auf dem Nomad-Cluster und wird bei Node-Ausfall automatisch rescheduled.

## Übersicht

- URL (intern): `zot.service.consul:5000` (via Consul DNS)
- URL (extern): `registry.ackermannprivat.ch`
- Deployment: Nomad Job `infrastructure/zot-registry.nomad` (Service Job, `type = "service"`, 1 Alloc)
- Storage Backend: Linstor-CSI Volume `zot-data` (150 GB, ext4 noatime, `placement_count = 3`)
- MetaDB: BoltDB embedded (kein Redis mehr)
- Auth: htpasswd -- nomad-client (read), ci-push (read+write), anonymousPolicy=[]
- UI: Eingebaut (Zot UI Extension)

## Warum Zot statt Docker Registry v2?

- Pull-Through Cache: Docker Registry v2 unterstützt nur Docker Hub -- Zot unterstützt Docker Hub, ghcr.io und quay.io
- UI: Docker Registry v2 hat kein UI -- Zot hat eine eingebaute Web-UI
- Search: Docker Registry v2 hat keine Suche -- Zot hat GraphQL API
- OCI-native: Docker Registry v2 nutzt das Docker Schema -- Zot ist nativ OCI
- Docker-Kompatibilität: Native bei v2, bei Zot via `compat: ["docker2s2"]`
- Auth: Docker Registry v2 hat htpasswd -- Zot hat htpasswd mit anonymousPolicy=[] und Whitelist-basiertem Sync

## Architektur

```d2
direction: down

Volume: "Linstor-CSI Volume\nzot-data (150 GB)\nDRBD 3-Replica" { shape: cylinder }
Zot: "Zot\nzot.service.consul:5000\n(Service Job, 1 Alloc)"
Cache: "Pull-Through Cache\nDocker Hub, ghcr.io, quay.io"
Mirror: "daemon.json registry-mirrors\nAlle Nodes → zot.service.consul:5000"

Volume -> Zot
Zot -> Cache
Mirror -> Zot
```

**Eigenschaften:**
- Linstor-CSI DRBD-Volume mit 3 Replicas: Daten bleiben bei Node-Ausfall erhalten
- Nomad rescheduled die Allokation auf einen anderen Node -- Volume folgt über CSI
- BoltDB embedded: keine externe Metadaten-Datenbank, kein Redis mehr
- Pull-Through Cache für 3 Upstream-Registries mit Docker-Hub-Pro-Limit (unlimited pulls)

### daemon.json Mirror-Pattern

Auf allen Nodes ist `zot.service.consul:5000` als `registry-mirrors` konfiguriert. Das Mirror-Matching greift **nur** bei Kurz-Format-Referenzen (`library/nginx:1.27`, `louislam/uptime-kuma`). Referenzen mit explizitem Hostname (`ghcr.io/...`, `quay.io/...`) gehen direkt zum Upstream und umgehen den Mirror.

Deshalb nutzen alle Nomad-Job-Files explizite Referenzen der Form `zot.service.consul:5000/<prefix>/<image>:<tag>` statt sich auf den Mirror-Mechanismus zu verlassen. Das macht den tatsächlichen Zugriffspfad im Job-File sichtbar und verhindert überraschende direkte Upstream-Pulls.

## Konfiguration

Die vollständige Konfiguration (Zot Config, Linstor-Volume, Proxy Cache, Auth) ist im Nomad Job definiert: `infrastructure/zot-registry.nomad`

**Wichtig:** `compat: ["docker2s2"]` in der HTTP-Konfiguration ist nötig, damit Docker-Format Manifeste (v2 Schema 2) akzeptiert werden. Ohne dieses Setting schlägt der Push von Multi-Arch Images fehl mit `manifest invalid`.

### Authentifizierung

ZOT nutzt htpasswd mit zwei Usern:

- nomad-client -- Read-only (pull). Alle Nomad-Allokationen und der Docker Daemon nutzen diesen Account.
- ci-push -- Read-write (pull + push). Einzig autorisierter Push-Pfad für CI/CD-Pipelines. Credentials als GitHub-Secrets hinterlegt.

`anonymousPolicy = []` -- kein anonymer Zugriff.

### Storage: Linstor-CSI Volume

- Volume-Name: `zot-data`
- Grösse: 150 GB
- Dateisystem: ext4, Mount-Option `noatime`
- Linstor `placement_count = 3`: Block-Daten auf 3 Nodes repliziert (DRBD)
- Kein S3-Backend mehr, keine Abhängigkeit vom NAS

### Proxy Cache Registries

Drei Upstream-Registries mit Catch-All Sync-Konfiguration (`content: [{"prefix": "**"}]`). Das `retryDelay` ist auf 5 Minuten gesetzt (war früher 1 Stunde -- ein Killer bei Upstream-Störungen).

- Docker Hub (`registry-1.docker.io`) -- Catch-All Default, alle Namespaces. Docker-Hub-Pro-Plan aktiv (unlimited pulls).
- GitHub Container Registry (`ghcr.io`) -- Destination-Prefix `/ghcr.io` im ZOT-Pfad. Sync-Credentials via ci-push PAT.
- Quay.io (`quay.io`) -- Destination-Prefix `/quay.io` im ZOT-Pfad.

Weil ZOT das Destination-Mapping nutzt, entsprechen die Image-Pfade 1:1 dem Upstream-Format:

- Docker Hub `nginx:1.27` → `zot.service.consul:5000/library/nginx:1.27`
- `ghcr.io/project-zot/zot:v2.1.0` → `zot.service.consul:5000/ghcr.io/project-zot/zot:v2.1.0`
- `quay.io/prometheus/prometheus:v3` → `zot.service.consul:5000/quay.io/prometheus/prometheus:v3`

::: warning Catch-All statt Whitelist
Seit der Migration am 2026-05-12/13 gibt es keine gepflegte Prefix-Whitelist mehr. Der Catch-All (`**`) synchronisiert jeden angefragten Pfad on-demand. Nicht mehr gecachte Images bleiben erhalten -- die Retention-Policies (Whitelist + Spam-Killer) übernehmen das Aufräumen.
:::

### On-Demand Sync Verhalten

Zot synchronisiert Images bei `onDemand: true` bei jedem Request mit dem Upstream:

- **Gecachte Images mit unverändertem Tag:** Zot prüft kurz beim Upstream ob eine neuere Version existiert und liefert sofort aus dem Volume-Cache.
- **Rate Limiting:** Dank Docker-Hub-Pro-Plan (unlimited pulls) ist ein 429 vom Docker Hub im Normalbetrieb nicht mehr zu erwarten.
- **Retry:** `retryDelay: 5m` -- bei einem temporären Upstream-Fehler wird nach 5 Minuten erneut versucht (kein sofortiger Pull-Fehler).

### Sync Credentials

- Vault-Pfad: `kv/data/zot-registry` (Workload Identity)
- Docker Hub: Eigener Service-Account mit Personal Access Token, Public Read (kein Push). Pro-Plan aktiv.
- htpasswd-Hashes: nomad-client und ci-push ebenfalls in `kv/data/zot-registry`

::: tip PAT-Rotation
Personal Access Token rotieren: neuen Token im Docker Hub Web-UI erzeugen, in Vault aktualisieren, dann Zot-Job neu deployen (`nomad job run`) damit Nomad das Sync-Credentials-Template re-rendert. Ein blosser Restart reicht nicht.
:::

### Retention

Zwei Policies:

- Whitelist-Policy: alle explizit whitelisted Namespaces + lokale Images (homelab/*, immo-monitor/*, timber-viewer-*) -- `keepTags = 10`, `deleteUntagged = true`
- Spam-Killer-Policy: alle übrigen Repos -- `keepTags = 0`, `deleteUntagged = true`. Räumt nicht-whitelisted Einträge automatisch auf.

SSOT ist immer der Nomad-Job (`infrastructure/zot-registry.nomad`), nicht diese Seite.

### Bootstrap-Klasse: bewusste Direkt-Pulls ohne Cache

Einige Jobs sollen bei einem ZOT-Ausfall trotzdem starten können. Sie nutzen explizite Upstream-Hostnames und umgehen damit `registry-mirrors` vollständig. Erkennbar an einem Header-Kommentar im jeweiligen Nomad-Job:

- ZOT selbst (`ghcr.io/project-zot/...`) -- Chicken-Egg
- Keep (`alpine`, `redis:8-alpine`, `quay.io/soketi/...`, `us-central1-docker.pkg.dev/keephq/...`) -- Alert-Bastion
- Uptime-Kuma (`louislam/uptime-kuma`) -- Monitoring-Bastion

::: info LinuxServer.io: Upstream ghcr.io statt lscr.io
Image-Pfade in den Nomad-Jobs nutzen weiterhin `linuxserver/jellyfin` o.ä., obwohl ZOT intern von `ghcr.io` pullt. Grund: `lscr.io` ist ein Scarf-Redirect-Service -- der `/v2/`-Endpunkt antwortet mit 405, Auth-Tokens kommen ohnehin von `ghcr.io`. Die Tags auf `ghcr.io/linuxserver/...` sind identisch mit jenen auf `lscr.io/linuxserver/...`.
:::

## Failover & Wiederanlauf

Mit `type = "service"` und Linstor-CSI DRBD-Volume vereinfacht sich der Wiederanlauf gegenüber dem früheren System-Job mit S3-Backend deutlich:

1. Node fällt aus → Nomad erkennt fehlgeschlagene Health Checks
2. Nomad rescheduled die Allokation auf einen anderen Node
3. Linstor-CSI meldet das DRBD-Volume auf dem Ziel-Node an -- kein Daten-Sync nötig (DRBD repliziert Block-Level live)
4. ZOT startet mit vollem Datenstand, BoltDB-Index bereits vorhanden
5. `zot.service.consul` zeigt auf die neue Allokation -- Nodes, die `registry-mirrors` nutzen, verbinden sich automatisch zur neuen Instanz

::: warning CSI Stale-Claim Pattern
Nach einem unclean Node-Ausfall kann der CSI-Volume-Claim im "stale" Zustand hängen bleiben (Nomad kennt den alten Alloc noch, der Node meldet sich nicht mehr zurück). Symptom: neue Allokation startet nicht, Volume-Mount schlägt fehl.

Workaround: `nomad system gc` ausführen -- bereinigt stale Alloc-Einträge und gibt den CSI-Claim frei. Danach startet Nomad die Allokation neu. Der DRBD-Volume-Inhalt bleibt dabei unberührt.
:::

::: tip Kein Warm-Up nach Restart
Da BoltDB embedded ist, hat ZOT nach dem Restart sofort Zugriff auf seinen Metadaten-Index. Ein Cold-Start-ParseStorage-Durchlauf (wie früher mit Redis/S3) entfällt.
:::

## Backup

- Linstor-CSI Volume `zot-data` (150 GB DRBD): Block-Level 3-Replica im Cluster -- kein separates Backup-Job nötig für Availability. Für Disaster-Recovery (alle 3 Nodes gleichzeitig verloren) gilt: Pull-Through-Cache füllt sich on-demand aus Upstream-Registries neu. Eigene Pushes (`homelab/...`, `immo-monitor/...`) müssen separat gesichert werden.

## Troubleshooting

### Langsame Image Pulls (>30s)

1. **Zot Health prüfen:** `curl http://zot.service.consul:5000/v2/` muss 200 zurückgeben
2. **Allokation prüfen:** `nomad job status zot-registry` -- 1 Alloc im Status `running`
3. **CSI-Volume prüfen:** `nomad volume status zot-data` -- Volume gemounted und nicht stale
4. **Upstream prüfen:** Zot-Container-Logs auf `TOOMANYREQUESTS` oder Connection-Timeouts

### CSI-Claim stale nach Node-Ausfall

Symptom: neue Allokation startet nicht, Volume-Mount-Fehler in den Alloc-Logs.

```
nomad system gc
```

Bereinigt stale Alloc-Einträge -- danach rescheduled Nomad automatisch.

### Nach Cluster-Restart

ZOT startet mit BoltDB-Index sofort wieder. Keine Wartezeit wie beim früheren S3/Redis-Cold-Start. Kurze Anlaufzeit nur für den CSI-Volume-Mount (DRBD-Attach, typisch < 10s).

## Historie

- ~2025-11: Harbor (3-way Replication, 8 Container pro Instanz)
- 29.12.2025: Migration zu Docker Registry v2 (Zwischenlösung)
- 29.12.2025: Migration zu Zot Registry (OCI-native, On-Demand Cache)
- 21.02.2026: Fix: `compat: ["docker2s2"]` für Multi-Arch Push Support
- 22.02.2026: Fix: `retryDelay: 5m → 15s`, `maxRetries: 3 → 1` -- verhindert 5min+ Blockierungen
- 18.03.2026: S3-Credentials aus Nomad-Job in Vault migriert (`kv/data/zot-s3`), Vault Workload Identity aktiviert
- 14.04.2026: Upstream `lscr.io` → `ghcr.io` umgestellt (Scarf-Redirect war OCI-inkompatibel)
- 18./19.04.2026: Sanierung -- htpasswd Auth (nomad-client/ci-push), Redis cacheDriver, Retention-Policy (Whitelist + Spam-Killer), CI/CD-Pipelines auf ci-push umgestellt
- 23.04.2026: Bootstrap-Deadlock-Fix -- `redis-zot` pullt Image direkt von `docker.io`, ZOT-DNS auf Public (1.1.1.1/8.8.8.8), Redis-URL als Consul-Template zur Deploy-Zeit
- 12.05.2026: Backend von MinIO auf Garage S3 (`http://10.0.0.200:9012`) umgestellt. Lifecycle-Rule `AbortIncompleteMultipartUpload: 7d` aktiv.
- 12./13.05.2026: Fundamentale Architektur-Migration: `type = "system"` count=3 → `type = "service"` count=1; S3+Redis → Linstor-CSI DRBD-Volume (150 GB, 3-Replica) + BoltDB embedded; Sync-Whitelist → Catch-All `**`; retryDelay 1h → 5m; Docker-Hub-Pro-Plan aktiviert; alle App-Image-Refs auf `zot.service.consul:5000/<prefix>/...` umgestellt.

## Verwandte Seiten

- [Storage NAS](../nas-storage/index.md) -- Garage S3 (ehemaliges ZOT-Backend)
- [DNS-Architektur](../dns/index.md) -- DNS-Auflösung für Upstream-Registries
- [Cluster-Neustart](../_querschnitt/cluster-restart.md) -- Verhalten der Registry nach Cluster-Restart
