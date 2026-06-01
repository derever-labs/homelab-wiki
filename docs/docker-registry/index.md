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

| Attribut | Wert |
|----------|------|
| URL (intern) | `zot.service.consul:5000` (via Consul DNS) |
| URL (extern) | `registry.ackermannprivat.ch` |
| Deployment | Nomad Job `infrastructure/zot-registry.nomad` (Service Job, 1 Alloc) |
| Storage | Linstor-CSI Volume `zot-data` (150 GB, ext4 noatime) |
| Auth | htpasswd -- nomad-client (read), ci-push (read+write), anonym lesen erlaubt |
| Secrets | Vault `kv/data/zot-registry` (htpasswd), `kv/data/dockerhub` (Sync-Token) |

## Rolle im Stack

Zot ist der zentrale Pull-Through-Cache für sämtliche Nomad-Jobs: Alle App- und
Basis-Images werden über `zot.service.consul:5000` bezogen, on-demand aus Docker
Hub, ghcr.io und quay.io gespiegelt und auf dem Linstor-CSI-Volume vorgehalten.
Eigene Pushes (`homelab/...`, `immo-monitor/...`) liegen ebenfalls hier. Die
Verfügbarkeit hängt am Linstor-CSI DRBD-Volume; eine Bootstrap-Klasse von Jobs
umgeht den Cache bewusst, um bei Zot-Ausfall startfähig zu bleiben.

Gegenüber Docker Registry v2 bietet Zot OCI-native Manifeste, eine eingebaute
Web-UI samt GraphQL-Suche und Pull-Through-Cache für drei Upstream-Registries
statt nur Docker Hub. Docker-Format-Manifeste werden über `compat: ["docker2s2"]`
akzeptiert.

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: down

classes: {
  node: { style.border-radius: 8 }
  data: { shape: cylinder; style.border-radius: 8 }
}

Volume: "Linstor-CSI Volume\nzot-data (150 GB)\nDRBD 3-Replica" { class: data }
Zot: "Zot\nzot.service.consul:5000\n(Service Job, 1 Alloc)" { class: node }
Cache: "Pull-Through Cache\nDocker Hub, ghcr.io, quay.io" { class: node }
Mirror: "daemon.json registry-mirrors\nAlle Nodes zu zot.service.consul:5000" { class: node }

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

`anonymousPolicy = ["read"]` -- anonymes Lesen (pull) ist erlaubt, Push erfordert htpasswd-Auth.

### Storage: Linstor-CSI Volume

- Volume-Name: `zot-data`, 150 GB, ext4 mit `noatime`
- Block-Daten auf 3 Nodes repliziert (DRBD) -- Datenstand bleibt bei Node-Ausfall erhalten
- Kein S3-Backend mehr, keine Abhängigkeit vom NAS

Replikationsgrad und Volume-Parameter sind im Nomad-Job definiert (`infrastructure/zot-registry.nomad`).

### Proxy Cache Registries

Drei Upstream-Registries mit Catch-All Sync-Konfiguration und `onDemand: true` -- Images werden bei jedem Request on-demand gespiegelt und danach aus dem Volume-Cache geliefert. Der Destination-Prefix entspricht dem Upstream-Hostname, sodass die Zot-Image-Pfade 1:1 dem Upstream-Format folgen.

- Docker Hub (`registry-1.docker.io`) -- Catch-All Default, alle Namespaces. Docker-Hub-Pro-Plan aktiv (unlimited pulls), 429 im Normalbetrieb nicht zu erwarten.
- GitHub Container Registry (`ghcr.io`) -- Destination-Prefix `/ghcr.io`. Wird anonym (public) ohne Sync-Credentials gespiegelt.
- Quay.io (`quay.io`) -- Destination-Prefix `/quay.io`, ebenfalls ohne Credentials.

`retryDelay` ist auf 5 Minuten gesetzt (war früher 1 Stunde -- ein Killer bei Upstream-Störungen): bei temporärem Upstream-Fehler wird nach 5 Minuten erneut versucht statt sofort zu scheitern. Details siehe Nomad-Job.

::: warning Catch-All statt Whitelist
Seit der Migration gibt es keine gepflegte Prefix-Whitelist mehr. Der Catch-All (`**`) synchronisiert jeden angefragten Pfad on-demand. Nicht mehr gecachte Images bleiben erhalten -- die Retention-Policies (Whitelist + Spam-Killer) übernehmen das Aufräumen.
:::

### Sync Credentials

Nur Docker Hub nutzt für den Sync Credentials; ghcr.io und quay.io werden anonym gespiegelt.

- Docker-Hub-Token: Vault `kv/data/dockerhub` (eigener Service-Account, Public Read, kein Push). Pro-Plan aktiv.
- htpasswd-Hashes (nomad-client, ci-push): Vault `kv/data/zot-registry`.

Beide werden über Vault Workload Identity in die Job-Templates gerendert. Token-Rotation: neuen Docker-Hub-Token erzeugen, in Vault aktualisieren, dann Zot-Job neu deployen (`nomad job run`), damit das Sync-Credentials-Template re-rendert -- ein blosser Restart reicht nicht.

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
4. ZOT startet mit vollem Datenstand und sofortigem Zugriff auf den BoltDB-Index -- ein Cold-Start-ParseStorage-Durchlauf (wie früher mit Redis/S3) entfällt
5. `zot.service.consul` zeigt auf die neue Allokation -- Nodes, die `registry-mirrors` nutzen, verbinden sich automatisch zur neuen Instanz

::: warning CSI Stale-Claim Pattern
Nach einem unclean Node-Ausfall kann der CSI-Volume-Claim im "stale" Zustand hängen bleiben (Nomad kennt den alten Alloc noch, der Node meldet sich nicht mehr zurück). Symptom: neue Allokation startet nicht, Volume-Mount schlägt fehl.

Workaround: `nomad system gc` ausführen -- bereinigt stale Alloc-Einträge und gibt den CSI-Claim frei. Danach startet Nomad die Allokation neu. Der DRBD-Volume-Inhalt bleibt dabei unberührt.
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

Symptom: neue Allokation startet nicht, Volume-Mount-Fehler in den Alloc-Logs. `nomad system gc` ausführen -- das bereinigt stale Alloc-Einträge, danach rescheduled Nomad automatisch.

### Nach Cluster-Restart

ZOT startet mit BoltDB-Index sofort wieder. Keine Wartezeit wie beim früheren S3/Redis-Cold-Start. Kurze Anlaufzeit nur für den CSI-Volume-Mount (DRBD-Attach, typisch < 10s).

## Verwandte Seiten

- [Storage NAS](../nas-storage/index.md) -- Garage S3 (ehemaliges ZOT-Backend)
- [DNS-Architektur](../dns/index.md) -- DNS-Auflösung für Upstream-Registries
- [Cluster-Neustart](../_querschnitt/cluster-restart.md) -- Verhalten der Registry nach Cluster-Restart
