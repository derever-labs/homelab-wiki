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
| **Object Storage** | Garage (S3) | NAS | Backup-Targets, Terraform State |

Details zu NFS-Exports: [NAS-Speicher](../nas-storage/index.md)

## 2. Aktuelle Datenbank-Strategie

Alle datenbank-gestützten Services nutzen den **PostgreSQL Shared Cluster** auf einem DRBD-replizierten Linstor CSI Volume. Details zur Architektur, Service-Zuordnung und Backup: [Datenbank-Architektur](./datenbank-architektur.md) | [Backup-Strategie](../backup/index.md)

## 3. Litestream Replikation (SQLite) -- Nicht umgesetzt

::: danger Veraltet -- Nicht in Produktion
Dieses Konzept wurde geplant, aber **nie produktiv umgesetzt**. Alle ursprünglich vorgesehenen Services nutzen de facto **PostgreSQL** via `postgres.service.consul:5432`. Die zugehörigen Vault-Credentials wurden gelöscht (18.03.2026).

Für die aktuelle Strategie siehe [Datenbank-Architektur](./datenbank-architektur.md).
:::

Die Idee war, SQLite-Datenbanken über Litestream in Echtzeit auf MinIO-Instanzen zu replizieren. Zwei MinIO-Peers auf Node-05/06 (verbunden über Thunderbolt) hätten als schnelle Replicas gedient, mit dem NAS-MinIO als Langzeit-Backup.

## Verwandte Seiten

- [Datenbank-Architektur](./datenbank-architektur.md) -- PostgreSQL Cluster, Service-Zuordnung
- [Backup-Strategie](../backup/index.md) -- pg_dumpall, Linstor Snapshots, PBS
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Exports und Garage S3
- [Netzwerk-Topologie](../netzwerk/index.md) -- Thunderbolt-Netzwerk für Replikation
