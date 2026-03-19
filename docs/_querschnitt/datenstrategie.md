---
title: Datenstrategie & Replikation
description: Speicher-Ebenen, PostgreSQL-Strategie und Backup-Konzepte im Homelab
tags:
  - architecture
  - backup
  - storage
  - postgresql
---

# Datenstrategie

Diese Seite beschreibt, wie persistente Daten im Cluster gespeichert, repliziert und gesichert werden.

## 1. Speicher-Ebenen

| Ebene | Technologie | Pfad | Verwendungszweck |
|-------|-------------|------|------------------|
| **Hot Storage** | Lokales SSD/ZFS | `/local-docker/` | Performance-kritische DBs (SQLite) |
| **Shared Storage** | NFS (Synology) | `/nfs/docker/` | Medien, Konfigurationsdateien, Backups |
| **Object Storage** | MinIO (S3) | NAS | Backup-Targets, Terraform State |

Details zu NFS-Exports: [NAS-Speicher](../nas-storage/index.md)

## 2. Aktuelle Datenbank-Strategie

Alle datenbank-gestützten Services nutzen den **PostgreSQL 16 Shared Cluster** auf einem DRBD-replizierten Linstor CSI Volume. Details zur Architektur, Service-Zuordnung und Backup: [Datenbank-Architektur](./datenbank-architektur.md) | [Backup-Strategie](../backup/index.md)

## 3. Litestream Replikation (SQLite) -- Nicht umgesetzt

::: danger Veraltet -- Nicht in Produktion
Dieses Konzept wurde geplant, aber **nie produktiv umgesetzt**. Alle ursprünglich vorgesehenen Services nutzen de facto **PostgreSQL** via `postgres.service.consul:5432`. Die zugehörigen Vault-Credentials wurden gelöscht (18.03.2026).

Für die aktuelle Strategie siehe [Datenbank-Architektur](./datenbank-architektur.md).
:::

Die Idee war, SQLite-Datenbanken über Litestream in Echtzeit auf MinIO-Instanzen zu replizieren. Zwei MinIO-Peers auf Node-05/06 (verbunden über Thunderbolt) hätten als schnelle Replicas gedient, mit dem NAS-MinIO als Langzeit-Backup.

```mermaid
flowchart TB
    subgraph Peers["Peer Replicas (Thunderbolt)"]
        N05:::svc["Node-05 MinIO"]
        N06:::svc["Node-06 MinIO"]
    end

    subgraph Backup["Langzeit-Backup"]
        NAS:::db["NAS MinIO<br/>Retention: 7 Tage"]
    end

    SVC:::entry["Service mit SQLite"] -->|"Litestream sync: 5s"| N05
    SVC -->|"Litestream sync: 5s"| N06
    N05 <-->|"Thunderbolt ~11 Gbps"| N06
    N05 -->|"sync: 60s"| NAS
    N06 -->|"sync: 60s"| NAS

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Verwandte Seiten

- [Datenbank-Architektur](./datenbank-architektur.md) -- PostgreSQL Cluster, Service-Zuordnung
- [Backup-Strategie](../backup/index.md) -- pg_dumpall, Linstor Snapshots, PBS
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Exports und MinIO
- [Netzwerk-Topologie](../netzwerk/index.md) -- Thunderbolt-Netzwerk für Replikation
