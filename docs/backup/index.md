---
title: Backup
description: Multi-Layer Backup-Strategie mit PostgreSQL Dumps, DRBD Snapshots, S3 Shipping, Litestream und PBS
tags:
  - backup
  - postgresql
  - drbd
  - linstor
  - pbs
---

# Backup

## Uebersicht

| Layer | Technologie | Ziel | RPO | Retention |
| :--- | :--- | :--- | :--- | :--- |
| PostgreSQL Dump | pg_dumpall | NFS (`/nfs/backup/postgres/`) | 24h | GFS: 7d/4w/3m |
| DRBD Snapshots | Linstor native | Lokal auf DRBD | 24h | 7 Snapshots |
| DRBD S3 Shipping | Linstor nach MinIO | NAS (`linstor-backups` Bucket) | 24h | GFS: 7d/4w/3m |
| SQLite Replication | Litestream | MinIO (NAS + Peer) | 5s | 7 Tage |
| VM Backups | Proxmox PBS | PBS Server | 24h | 6 Monate |

Die Backup-Strategie ist mehrschichtig aufgebaut. Jede Schicht schuetzt gegen unterschiedliche Ausfallszenarien -- von einzelnen Datenbankfehlern (PostgreSQL Dump) ueber Storage-Ausfaelle (DRBD Snapshots + S3) bis hin zu kompletten VM-Verlusten (PBS).

## PostgreSQL Backup

### Architektur

Taeglich um 03:00 UTC erstellt ein Nomad Batch Job (`batch-jobs/postgres-backup.nomad`) einen vollstaendigen Dump aller PostgreSQL-Datenbanken via `pg_dumpall`. Der Dump wird nach NFS geschrieben und nach GFS-Schema rotiert:

- `daily/` -- 7 Backups
- `weekly/` -- 4 Backups
- `monthly/` -- 3 Backups

Nach erfolgreichem Dump wird ein Push an Uptime Kuma gesendet.

### Restore-Konzept

Ein PostgreSQL-Restore erfolgt durch Einspielen des SQL-Dumps (`postgres-all-YYYYMMDD-HHMM.sql.gz`) aus dem NFS-Backup-Verzeichnis. Einzelne Datenbanken koennen aus dem Dump extrahiert werden.

**Vault Secrets:** `kv/data/postgres` (Passwort), `kv/data/uptime-kuma` (Push-URLs). Policies: `postgres`, `postgres-backup`.

## DRBD/Linstor Snapshots

### Lokale Snapshots

Taeglich um 02:00 Uhr werden automatisch Snapshots aller DRBD-Ressourcen erstellt.

- **Script:** `/usr/local/bin/linstor-backup.sh` (auf client-05 und client-06)
- **Cron:** Verwaltet via Ansible (`setup-backup-infrastructure.yml`)

### S3 Shipping nach MinIO

Linstor exportiert Snapshots nativ nach S3-kompatiblem Storage (MinIO auf NAS, Bucket `linstor-backups`).

**Ablauf pro Ressource:**

1. Lokalen Snapshot erstellen (`daily-YYYYMMDD-HHMM`)
2. Backup auf S3/MinIO exportieren
3. Alte `daily-*` Snapshots aufraeumen (behalte 7)
4. Alte `back_*` Snapshots aufraeumen (behalte 14)

::: info Linstor Controller
Das Backup-Script laeuft nur auf dem Node mit aktivem Linstor Controller und entsperrt automatisch den verschluesselten Controller via `/etc/linstor/passphrase`.
:::

### Restore von S3

Ein Restore erfolgt durch Wiederherstellen eines Snapshots vom S3-Remote `nas-backup` auf einen Ziel-Node. Es kann entweder eine neue Ressource erstellt oder eine bestehende ersetzt werden.

## Monitoring

### Uptime Kuma Push-Monitore

| Monitor | Typ | Interval | Beschreibung |
| :--- | :--- | :--- | :--- |
| PostgreSQL Backup | Push | 93600s (26h) | pg_dump Batch Job |
| Linstor S3 Backup | Push | 93600s (26h) | Linstor Shipping |
| DRBD Snapshots | Push | 93600s (26h) | Lokale Snapshots |

::: tip 26h Interval
Das Interval von 26 Stunden gibt 2 Stunden Puffer, falls Backups laenger dauern als ueblich.
:::

### Backup Monitor Script

`/usr/local/bin/linstor-backup-monitor.sh` (auf client-05) prueft um 06:00 Uhr, ob Backups in den letzten 25 Stunden erstellt wurden, und meldet via Uptime Kuma Push.

## Verwandte Seiten

- [Backup Referenz](./referenz.md) -- PBS-Details, Retention Policy, Datastore
- [Linstor Storage](../linstor-storage/) -- DRBD-Storage und Snapshot-Mechanismus
- [Monitoring](../monitoring/) -- Uptime Kuma Push-Monitore fuer Backup-Status
- [Datenbanken](../_referenz/datenbanken.md) -- PostgreSQL Shared Cluster und Service-Zuordnung
