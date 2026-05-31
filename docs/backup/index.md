---
title: Backup
description: Multi-Layer Backup-Strategie mit PostgreSQL Dumps, DRBD-Replikation und Proxmox Backup Server
tags:
  - backup
  - postgresql
  - drbd
  - linstor
  - pbs
---

# Backup

Die Backup-Strategie ist mehrschichtig aufgebaut. Jede Schicht schützt gegen unterschiedliche Ausfallszenarien.

## Übersicht

| Attribut | Wert |
|----------|------|
| PostgreSQL Dump | pg_dumpall → NFS `/nfs/backup/postgres/` -- RPO 24h, GFS: 7d/4w/3m |
| VM Backups (PBS) | Proxmox PBS → PBS Server, Block-Level inkl. LINSTOR-Volumes -- RPO 24h, 6 Monate |
| DRBD-Replikation | 2× Live-Replica (client-05/client-06) -- Hochverfügbarkeit, kein Backup |
| SQLite Replication | Litestream → MinIO (nie produktiv umgesetzt, siehe [Datenstrategie](../_querschnitt/datenstrategie.md#litestream-replikation-sqlite-nicht-umgesetzt)) |

## PostgreSQL Backup

### Architektur

Täglich um 03:00 UTC erstellt ein Nomad Batch Job (`batch-jobs/postgres-backup.nomad`) einen vollständigen Dump aller PostgreSQL-Datenbanken via `pg_dumpall`. Der Dump wird nach NFS geschrieben und nach GFS-Schema rotiert:

- `daily/` -- 7 Backups
- `weekly/` -- 4 Backups
- `monthly/` -- 3 Backups

Nach erfolgreichem Dump wird ein Push an Uptime Kuma gesendet.

### Restore-Konzept

Ein PostgreSQL-Restore erfolgt durch Einspielen des SQL-Dumps (`postgres-all-YYYYMMDD-HHMM.sql.gz`) aus dem NFS-Backup-Verzeichnis. Einzelne Datenbanken können aus dem Dump extrahiert werden.

**Vault Secrets:** `kv/data/postgres` (Passwort), `kv/data/uptime-kuma` (Push-URLs). Policies: `postgres`, `postgres-backup`.

## LINSTOR-Volumes

Die DRBD/LINSTOR-Volumes werden **nicht LINSTOR-nativ** gesichert. Sie sind durch zwei Mechanismen geschützt:

- **Proxmox Backup Server** sichert die Storage-VMs (client-05/client-06) inkl. der LINSTOR-Daten-Disk als Block.
- **DRBD-Replikation** hält jedes Volume 2× live (client-05 + client-06, Diskless-TieBreaker client-04).

::: info S3-Schicht zurückgebaut (2026-05-31)
Die frühere LINSTOR-S3-Backup-Schicht (lokale Snapshots + Shipping nach Garage, Schedule `backup-daily`, Master-Key-Auto-Unlock) wurde entfernt -- sie war redundant zu PBS und bei grossen Volumes (z. B. zot ~46 GiB) unzuverlässig. Details: [Linstor Betrieb](../linstor-storage/betrieb.md).
:::

## Monitoring

### Uptime Kuma Push-Monitore

| Monitor | Typ | Interval | Beschreibung |
| :--- | :--- | :--- | :--- |
| PostgreSQL Backup | Push | 93600s (26h) | pg_dump Batch Job |

::: tip 26h Interval
Das Interval von 26 Stunden gibt 2 Stunden Puffer, falls Backups länger dauern als üblich.
:::

## Bewusste Architektur-Grenzen

::: warning Kein Off-Site / 3-2-1 unvollständig
Alle Backup-Ziele (PBS-Datastore, App-Dumps) liegen per NFS auf dem NAS `10.0.0.200`. Das NAS ist damit ein Single Point of Failure, und es gibt keine geografische Off-Site-Kopie. Das ist eine **bewusste Entscheidung** (kein volles 3-2-1) -- das NAS hat eine eigene Backup-Strategie. Homelab- und DCLab-Backups bleiben strikt getrennt (keine Cross-Cluster-Sicherung).
:::

::: warning Multi-Node-Restore nicht verifiziert
Ein gleichzeitiger PBS-Restore beider Storage-VMs (client-05 + client-06) wurde nicht durchgespielt. Das DRBD-Split-Brain-Handling nach einem solchen Restore wäre manuell aufzulösen.
:::

## Verwandte Seiten

- [Backup Referenz](./referenz.md) -- PBS-Details, Retention Policy, Datastore
- [Linstor Storage](../linstor-storage/) -- DRBD-Storage und Snapshot-Mechanismus
- [Monitoring](../monitoring/) -- Uptime Kuma Push-Monitore für Backup-Status
- [Datenbanken](../_referenz/datenbanken.md) -- PostgreSQL Shared Cluster und Service-Zuordnung
