---
title: Backup-Strategie
description: PostgreSQL Backups, DRBD Snapshots und Monitoring
tags:
  - backup
  - postgresql
  - drbd
  - linstor
  - monitoring
---

# Backup-Strategie

## Übersicht

| Layer | Technologie | Ziel | RPO | Retention |
|-------|-------------|------|-----|-----------|
| PostgreSQL Dump | pg_dumpall | NFS (/nfs/backup/postgres/) | 24h | GFS: 7d/4w/3m |
| DRBD Snapshots | Linstor native | Lokal auf DRBD | 24h | 7 Snapshots |
| DRBD S3 Shipping | Linstor → MinIO | NAS (linstor-backups bucket) | 24h | GFS: 7d/4w/3m |
| SQLite Replication | Litestream | MinIO (NAS + Peer) | 5s | 7 Tage |
| VM Backups | Proxmox PBS | PBS Server | 24h | 6 Monate |

## PostgreSQL Backup

### Architektur

```
PostgreSQL (DRBD Volume)
         │
         │ pg_dumpall (03:00 UTC)
         ▼
   NFS: /nfs/backup/postgres/
         ├── daily/   (7 Backups)
         ├── weekly/  (4 Backups)
         └── monthly/ (3 Backups)
         │
         │ Uptime Kuma Push
         ▼
   Monitoring Dashboard
```

**Nomad Job:** `batch-jobs/postgres-backup.nomad`

### Restore-Konzept

Ein PostgreSQL-Restore erfolgt durch Einspielen des SQL-Dumps (`postgres-all-YYYYMMDD-HHMM.sql.gz`) aus dem NFS-Backup-Verzeichnis. Einzelne Datenbanken können aus dem Dump extrahiert werden.

**Vault Secrets:** `kv/data/postgres` (Passwort), `kv/data/uptime-kuma` (Push-URLs). Policies: `postgres`, `postgres-backup`.

## DRBD/Linstor Snapshots

### Lokale Snapshots

Täglich um 02:00 Uhr werden automatisch Snapshots aller DRBD-Ressourcen erstellt.

**Script:** `/usr/local/bin/linstor-backup.sh` (auf client-05 und client-06)
**Cron:** Verwaltet via Ansible (`setup-backup-infrastructure.yml`)

### S3 Shipping nach MinIO

Linstor exportiert Snapshots nativ nach S3-kompatiblem Storage (MinIO auf NAS, Bucket `linstor-backups`).

**Ablauf pro Ressource:**
1. Lokalen Snapshot erstellen (`daily-YYYYMMDD-HHMM`)
2. Backup auf S3/MinIO exportieren
3. Alte `daily-*` Snapshots aufräumen (behalte 7)
4. Alte `back_*` Snapshots aufräumen (behalte 14)

**Besonderheiten:**
- Läuft nur auf dem Node mit aktivem Linstor Controller
- Entsperrt automatisch den verschlüsselten Controller via `/etc/linstor/passphrase`

### Restore von S3

Ein Restore erfolgt durch Wiederherstellen eines Snapshots vom S3-Remote `nas-backup` auf einen Ziel-Node. Es kann entweder eine neue Ressource erstellt oder eine bestehende ersetzt werden.

## Monitoring

### Uptime Kuma Push-Monitore

| Monitor | Typ | Interval | Beschreibung |
|---------|-----|----------|--------------|
| PostgreSQL Backup | Push | 93600s (26h) | pg_dump Batch Job |
| Linstor S3 Backup | Push | 93600s (26h) | Linstor Shipping |
| DRBD Snapshots | Push | 93600s (26h) | Lokale Snapshots |

**Hinweis:** 26h Interval gibt 2h Puffer falls Backups länger dauern als üblich.

### Backup Monitor Script

`/usr/local/bin/linstor-backup-monitor.sh` (auf client-05) prüft um 06:00 Uhr ob Backups in den letzten 25h erstellt wurden und meldet via Uptime Kuma Push.

## Verwandte Seiten

- [Proxmox Backup Server](./pbs.md) -- VM-Backups mit Deduplizierung
- [Linstor/DRBD](../../platforms/linstor-drbd.md) -- DRBD-Storage und Snapshot-Mechanismus
- [Monitoring Stack](../monitoring/stack.md) -- Uptime Kuma Push-Monitore für Backup-Status
- [Batch Jobs](../../runbooks/batch-jobs.md) -- PostgreSQL Backup Nomad Job und Zeitplan
- [Datenbank-Architektur](../../architecture/database-architecture.md) -- PostgreSQL Shared Cluster

