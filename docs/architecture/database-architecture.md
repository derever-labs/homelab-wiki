---
title: Datenbank-Architektur
description: PostgreSQL Shared Cluster, DRBD-Replikation und Service-Zuordnung
tags:
  - architecture
  - postgresql
  - drbd
  - database
---

# Datenbank-Architektur

## Übersicht

Das Homelab verwendet einen zentralen PostgreSQL 16 Cluster auf einem DRBD-replizierten Volume. Alle Services verbinden sich über Consul DNS (`postgres.service.consul:5432`). Einzelne Services mit inkompatiblen Anforderungen verwenden Sidecar-Datenbanken.

## Architektur

```mermaid
flowchart TB
    subgraph Services["Services (Nomad)"]
        RADAR:::svc["Radarr"]
        SONAR:::svc["Sonarr"]
        PROWL:::svc["Prowlarr"]
        JSEER:::svc["Jellyseerr"]
        JSTAT:::svc["JellyStat"]
        VW:::svc["Vaultwarden"]
        PL:::svc["Paperless"]
        GT:::svc["Gitea"]
        TD:::svc["Tandoor"]
        ST:::svc["solidtime"]
        N8N:::svc["n8n"]
        MB:::svc["Metabase"]
        GR:::svc["Grafana"]
    end

    subgraph Database["PostgreSQL Shared Cluster"]
        PG:::db["PostgreSQL 16<br>postgres.service.consul:5432"]
    end

    subgraph Storage["DRBD Linstor Storage"]
        DRBD:::accent["Linstor CSI Volume<br>postgres-data"]
    end

    subgraph Backup["Backup"]
        DUMP:::entry["pg_dumpall<br>03:00 UTC"]
        NFS:::db["NFS Backup<br>GFS: 7d/4w/3m"]
        S3:::db["MinIO linstor-backups<br>Snapshots"]
    end

    RADAR --> PG
    SONAR --> PG
    PROWL --> PG
    JSEER --> PG
    JSTAT --> PG
    VW --> PG
    PL --> PG
    GT --> PG
    TD --> PG
    ST --> PG
    N8N --> PG
    MB --> PG
    GR -.->|"read-only Datasource"| PG

    PG --> DRBD
    PG --> DUMP
    DUMP --> NFS
    DRBD --> S3

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Service-Datenbank-Zuordnung

### Shared PostgreSQL Cluster

Alle folgenden Services nutzen `postgres.service.consul:5432` mit eigenen Datenbanken und Benutzern.

| Service | Datenbank(en) | DB-User | Vault-Pfad | Nomad Job |
| :--- | :--- | :--- | :--- | :--- |
| Radarr | `radarr_main`, `radarr_log` | `radarr` | `kv/data/radarr` | `media/radarr.nomad` |
| Sonarr | `sonarr_main`, `sonarr_log` | `sonarr` | `kv/data/sonarr` | `media/sonarr.nomad` |
| Prowlarr | `prowlarr_main`, `prowlarr_log` | `prowlarr` | `kv/data/prowlarr` | `media/prowlarr.nomad` |
| Jellyseerr | via `DB_HOST` | - | `kv/data/jellyseerr` | `media/jellyseerr.nomad` |
| JellyStat | via Vault | via Vault | `kv/data/jellystat` | `media/jellystat.nomad` |
| Vaultwarden | `vaultwarden` | `vaultwarden` | (Inline in Job) | `services/vaultwarden.nomad` |
| Paperless | via Vault | via Vault | `kv/data/paperless` | `services/paperless-simple.nomad` |
| Gitea | via Vault | via Vault | `kv/data/gitea` | `services/gitea.nomad` |
| Tandoor | `djangodb` | `djangouser` | `kv/data/tandoor` | `services/tandoor.nomad` |
| solidtime | via Vault | via Vault | `kv/data/solidtime` | `services/solidtime.nomad` |
| n8n | `n8n` | `n8n` | `kv/data/n8n` | `services/n8n.nomad` |
| Metabase | via Vault | via Vault | `kv/data/metabase` | `services/metabase.nomad` |

### Sidecar-Datenbanken

Services die nicht mit dem Shared Cluster kompatibel sind.

| Service | DB-Engine | Grund | Nomad Job |
| :--- | :--- | :--- | :--- |
| Kimai | MariaDB 11 (Sidecar) | Startup-Script unterstützt nur MySQL/MariaDB | `services/kimai.nomad` |
| Obsidian LiveSync | CouchDB (Sidecar) | Benötigt CouchDB für Sync-Protokoll | `services/obsidian-livesync.nomad` |

### Keine Datenbank

| Service | Speicher | Nomad Job |
| :--- | :--- | :--- |
| Jellyfin | SQLite auf NFS | `media/jellyfin.nomad` |
| Uptime Kuma | SQLite auf NFS | `monitoring/uptime-kuma.nomad` |
| AudioBookShelf | SQLite auf NFS | `media/audiobookshelf.nomad` |
| Gatus | Dateibasiert | `monitoring/gatus.nomad` |

## PostgreSQL Cluster Details

| Attribut | Wert |
| :--- | :--- |
| Version | PostgreSQL 16 (Alpine) |
| Image | `localhost:5000/postgres:16-alpine` |
| Nomad Job | `databases/postgres-drbd.nomad` |
| Consul Service | `postgres.service.consul:5432` |
| Storage | Linstor CSI Volume `postgres-data` |
| Replikation | DRBD via Thunderbolt (pve01/pve02) |
| Superuser | `postgres` |
| Vault Secret | `kv/data/postgres` (Key: `password`) |

## DRBD-Replikation

Das PostgreSQL-Datenverzeichnis liegt auf einem Linstor CSI Volume, das über DRBD zwischen den Nomad-Clients auf pve01 und pve02 repliziert wird. Die Replikation läuft über das Thunderbolt-Netzwerk (10.99.1.0/24) mit ~20 Gbps Bandbreite.

```mermaid
flowchart LR
    subgraph pve01["pve01 vm-nomad-client-05"]
        D1:::accent["DRBD postgres-data<br>Primary oder Secondary"]
    end

    subgraph pve02["pve02 vm-nomad-client-06"]
        D2:::accent["DRBD postgres-data<br>Primary oder Secondary"]
    end

    D1 <-->|"Thunderbolt 10.99.1.0/24 ~20 Gbps"| D2

    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

Nur ein Node hat zur gleichen Zeit den Primary-Status. Nomad steuert, auf welchem Client der PostgreSQL-Job läuft.

## Backup

Vollständige Backup-Dokumentation: [Backup-Strategie](../services/core/backup-strategy.md)

| Methode | Zeitplan | Retention | Ziel |
| :--- | :--- | :--- | :--- |
| pg_dumpall | Täglich 03:00 UTC | GFS: 7d/4w/3m | NFS `/nfs/backup/postgres/` |
| Linstor Snapshots | Täglich 02:00 Uhr | 7 Snapshots | Lokal auf DRBD |
| Linstor S3 Shipping | Täglich | GFS: 7d/4w/3m | MinIO `linstor-backups` |

## Verwaltung

DbGate (dbgate.ackermannprivat.ch) steht als Web-UI für die Datenbankverwaltung zur Verfügung.

Nomad Job: `databases/dbgate.nomad`

## Verwandte Seiten

- [Backup-Strategie](../services/core/backup-strategy.md) -- pg_dumpall, Linstor Snapshots, Retention
- [Datenstrategie](./data-strategy.md) -- Speicher-Ebenen und Replikationskonzepte
- [Proxmox Cluster](../infrastructure/proxmox-cluster.md) -- Nomad-Client-Nodes für DRBD
- [NAS-Speicher](../infrastructure/storage-nas.md) -- NFS-Backup-Ziel und MinIO
- [Service-Abhängigkeiten](./service-dependencies.md) -- PostgreSQL als zentrale Dependency
