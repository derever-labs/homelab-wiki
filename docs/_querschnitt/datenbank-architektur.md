---
title: Datenbank-Architektur
description: PostgreSQL Shared Cluster Konzept mit DRBD-Replikation ueber Thunderbolt
tags:
  - architektur
  - postgresql
  - drbd
  - querschnitt
---

# Datenbank-Architektur

## Uebersicht

Das Homelab verwendet einen zentralen PostgreSQL 16 Cluster auf einem DRBD-replizierten Volume. Alle Services verbinden sich ueber Consul DNS (`postgres.service.consul:5432`). Einzelne Services mit inkompatiblen Anforderungen verwenden Sidecar-Datenbanken.

Dieser Ansatz minimiert den Betriebsaufwand: ein einzelner Cluster mit einem Backup-Job, einer Monitoring-Konfiguration und einem Restore-Prozess -- statt dutzender individueller Datenbank-Instanzen.

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

## DRBD-Replikation

Das PostgreSQL-Datenverzeichnis liegt auf einem Linstor CSI Volume, das ueber DRBD zwischen den Nomad-Clients auf pve01 und pve02 repliziert wird. Die Replikation laeuft ueber das Thunderbolt-Netzwerk (10.99.1.0/24) mit rund 20 Gbps Bandbreite.

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

Nur ein Node hat zur gleichen Zeit den Primary-Status. Nomad steuert, auf welchem Client der PostgreSQL-Job laeuft.

## Backup

Die vollstaendige Backup-Dokumentation befindet sich unter [Backup](../backup/).

| Methode | Zeitplan | Retention | Ziel |
| :--- | :--- | :--- | :--- |
| pg_dumpall | Taeglich 03:00 UTC | GFS: 7d/4w/3m | NFS `/nfs/backup/postgres/` |
| Linstor Snapshots | Taeglich 02:00 Uhr | 7 Snapshots | Lokal auf DRBD |
| Linstor S3 Shipping | Taeglich | GFS: 7d/4w/3m | MinIO `linstor-backups` |

## Verwandte Seiten

- [Datenbanken](../_referenz/datenbanken.md) -- Service-zu-Datenbank-Zuordnung, Vault-Pfade, Nomad Jobs
- [Backup](../backup/) -- PostgreSQL Dumps, DRBD Snapshots und Retention
- [Linstor Storage](../linstor-storage/) -- DRBD-Storage und Linstor CSI
