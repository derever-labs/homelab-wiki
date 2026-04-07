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

```d2
direction: down

SVC: Service mit SQLite { style.border-radius: 8 }

Peers: Peer Replicas (Thunderbolt) {
  style.stroke-dash: 4
  N05: Node-05 MinIO { style.border-radius: 8 }
  N06: Node-06 MinIO { style.border-radius: 8 }
}

Backup: Langzeit-Backup {
  style.stroke-dash: 4
  NAS: "NAS MinIO (Retention: 7 Tage)" { shape: cylinder; style.border-radius: 8 }
}

SVC -> Peers.N05: Litestream sync: 5s
SVC -> Peers.N06: Litestream sync: 5s
Peers.N05 <-> Peers.N06: Thunderbolt ~11 Gbps { tooltip: "10.99.1.0/24" }
Peers.N05 -> Backup.NAS: sync: 60s
Peers.N06 -> Backup.NAS: sync: 60s
```

## Verwandte Seiten

- [Datenbank-Architektur](./datenbank-architektur.md) -- PostgreSQL Cluster, Service-Zuordnung
- [Backup-Strategie](../backup/index.md) -- pg_dumpall, Linstor Snapshots, PBS
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Exports und MinIO
- [Netzwerk-Topologie](../netzwerk/index.md) -- Thunderbolt-Netzwerk für Replikation
