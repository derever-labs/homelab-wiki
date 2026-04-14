---
title: Zot Container Registry
description: OCI-native Container Registry mit S3 Backend und Pull-Through Cache
tags:
  - docker
  - registry
  - container
  - infrastructure
  - s3
  - zot
---

# Zot Container Registry

Zot ist eine OCI-native Container Registry mit S3-Backend und Pull-Through Cache für Docker Hub, ghcr.io und quay.io. Als Nomad System Job läuft eine Instanz auf jedem Client-Node und teilt sich den S3-Bucket auf dem NAS.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL (intern) | `localhost:5000` (jeder Node, via System Job) |
| URL (extern) | [registry.ackermannprivat.ch](https://registry.ackermannprivat.ch) |
| Deployment | Nomad Job `infrastructure/zot-registry.nomad` (System Job) |
| Storage Backend | MinIO S3 auf [NAS](../nas-storage/index.md) |
| UI | Eingebaut (Zot UI Extension) |

## Warum Zot statt Docker Registry v2?

| Aspekt | Docker Registry v2 | Zot |
| :--- | :--- | :--- |
| **Pull-Through Cache** | Nur Docker Hub | Docker Hub, ghcr.io, quay.io |
| **UI** | Keines | Eingebaut |
| **Search** | Nein | Ja (GraphQL API) |
| **OCI-native** | Nein (Docker Schema) | Ja |
| **Docker-Kompatibilität** | Native | Via `compat: ["docker2s2"]` |

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

Die vollständige Konfiguration (Zot Config, S3 Storage, Proxy Cache, Docker Hub Credentials) ist im Nomad Job definiert: `infrastructure/zot-registry.nomad`

**Wichtig:** `compat: ["docker2s2"]` in der HTTP-Konfiguration ist nötig, damit Docker-Format Manifeste (v2 Schema 2) akzeptiert werden. Ohne dieses Setting schlägt der Push von Multi-Arch Images fehl mit `manifest invalid`.

### Proxy Cache Registries

| Registry | URL | Prefix | Beschreibung |
| :--- | :--- | :--- | :--- |
| Docker Hub | registry-1.docker.io | `library/**`, `**` | Mit Docker Hub Credentials (Rate Limit 200/6h) |
| GitHub CR | ghcr.io | `ghcr.io/**` | On-Demand |
| Quay.io | quay.io | `quay.io/**` | On-Demand |
| LinuxServer via GHCR | ghcr.io | `linuxserver/**` | On-Demand -- Image-Pfade bleiben `linuxserver/...`, Upstream ist ghcr.io |

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

| Parameter | Wert |
| :--- | :--- |
| Endpoint | MinIO auf NAS (Port 9000) -- siehe [NAS-Speicher](../nas-storage/index.md) |
| Bucket | zot-registry |
| Root Directory | /zot |
| Credentials | Vault `kv/data/zot-s3` (Workload Identity) |

### Sync Credentials

Damit der Pull-Through Cache nicht in Docker Hubs Anonymous-Rate-Limit (100/6h) läuft, authentisiert sich Zot beim Sync gegen einen dedizierten Docker-Hub-Account und erhält damit das Authenticated-Limit (200/6h).

| Parameter | Wert |
| :--- | :--- |
| Vault-Pfad | `kv/data/dockerhub` (Workload Identity, Felder: `username`, `token`) |
| Account | Eigener Docker Hub Service-Account mit Personal Access Token |
| Scope | Public Read (kein Push, keine Schreibrechte) |

::: tip Rotation
Personal Access Token rotieren: neuen Token im Docker Hub Web-UI erzeugen, in Vault unter `kv/dockerhub` aktualisieren, dann Zot-Job neu deployen (`nomad job run`) damit Nomad das Sync-Credentials-Template re-rendert. Ein blosser Restart reicht nicht -- Templates werden nur bei Spec- oder Inhaltsänderung neu gerendert.
:::

### Docker daemon.json

Auf allen Nodes ist `localhost:5000` als Registry-Mirror konfiguriert (verwaltet durch Ansible). Docker versucht erst localhost:5000 (Zot), bei Nichterreichbarkeit automatisch Docker Hub direkt.

## Backup

| Pfad | Inhalt |
| :--- | :--- |
| MinIO: zot-registry/* | Alle Registry Blobs und Manifeste |

**Restore:** MinIO Bucket wiederherstellen, dann Nomad Job starten.

### DNS-Abhängigkeit

Zot läuft mit `network_mode = "host"` im Nomad Job. Das bedeutet:

- `dns_servers` in der Nomad Docker-Config wird **ignoriert** — Zot nutzt die DNS-Konfiguration des Hosts (systemd-resolved).
- Wenn die DNS-Server (lxc-dns-01 / lxc-dns-02, Details: [DNS](../dns/index.md)) nicht erreichbar sind, können keine Upstream-Registries aufgelöst werden.
- systemd-resolved hat eingebaute Fallback-DNS (1.1.1.1, 8.8.8.8) die bei DNS-Ausfall greifen, aber mit Verzögerung.

## Troubleshooting

### Langsame Image Pulls (>15s)

1. **DNS prüfen:** DNS-Auflösung von `registry-1.docker.io` via lxc-dns-01 testen -- muss sofort antworten
2. **Rate Limit prüfen:** Zot-Container-Logs auf `TOOMANYREQUESTS` prüfen -- wenn Docker Hub 429 zurückgibt, warten bis Rate Limit abläuft
3. **Zot Health prüfen:** Zot-Endpunkt `http://localhost:5000/v2/` -- muss 200 zurückgeben

### Nach Cluster-Restart

Nach einem Restart aller Nodes können Image-Pulls temporär langsam sein (Docker Hub Rate Limiting). Das normalisiert sich nach 10-15 Minuten.

## Historie

| Datum | Änderung |
| :--- | :--- |
| ~2025-11 | Harbor (3-way Replication, 8 Container pro Instanz) |
| 29.12.2025 | Migration zu Docker Registry v2 (Zwischenlösung) |
| 29.12.2025 | Migration zu Zot Registry (OCI-native, On-Demand Cache) |
| 21.02.2026 | Fix: `compat: ["docker2s2"]` für Multi-Arch Push Support |
| 22.02.2026 | Fix: `retryDelay: 5m → 15s`, `maxRetries: 3 → 1` — verhindert 5min+ Blockierungen bei DNS- oder Rate-Limit-Problemen |
| 18.03.2026 | S3-Credentials aus Nomad-Job in Vault migriert (`kv/data/zot-s3`), Vault Workload Identity aktiviert |
| 14.04.2026 | Upstream `lscr.io` → `ghcr.io` umgestellt (Scarf-Redirect war OCI-inkompatibel) |

## Verwandte Seiten

- [Storage NAS](../nas-storage/index.md) -- MinIO S3 Backend auf Synology NAS
- [DNS-Architektur](../dns/index.md) -- DNS-Auflösung für Upstream-Registries
- [Cluster-Neustart](../_querschnitt/cluster-restart.md) -- Verhalten der Registry nach Cluster-Restart

