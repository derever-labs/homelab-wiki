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

```d2
direction: down

Services: Services (Nomad) {
  style.stroke-dash: 4
  RADAR: Radarr { style.border-radius: 8 }
  SONAR: Sonarr { style.border-radius: 8 }
  PROWL: Prowlarr { style.border-radius: 8 }
  JSEER: Jellyseerr { style.border-radius: 8 }
  JSTAT: JellyStat { style.border-radius: 8 }
  VW: Vaultwarden { style.border-radius: 8 }
  PL: Paperless { style.border-radius: 8 }
  GT: Gitea { style.border-radius: 8 }
  TD: Tandoor { style.border-radius: 8 }
  ST: solidtime { style.border-radius: 8 }
  N8N: n8n { style.border-radius: 8 }
  MB: Metabase { style.border-radius: 8 }
  GR: Grafana { style.border-radius: 8 }
}

Database: PostgreSQL Shared Cluster {
  style.stroke-dash: 4
  PG: PostgreSQL 16 {
    shape: cylinder
    tooltip: postgres.service.consul:5432
    style.border-radius: 8
  }
}

Storage: DRBD Linstor Storage {
  style.stroke-dash: 4
  DRBD: Linstor CSI Volume postgres-data { style.border-radius: 8 }
}

Backup: Backup {
  style.stroke-dash: 4
  DUMP: pg_dumpall 03:00 UTC { style.border-radius: 8 }
  NFS: NFS Backup GFS 7d/4w/3m { shape: cylinder; style.border-radius: 8 }
  S3: MinIO linstor-backups Snapshots { shape: cylinder; style.border-radius: 8 }
}

Services.RADAR -> Database.PG
Services.SONAR -> Database.PG
Services.PROWL -> Database.PG
Services.JSEER -> Database.PG
Services.JSTAT -> Database.PG
Services.VW -> Database.PG
Services.PL -> Database.PG
Services.GT -> Database.PG
Services.TD -> Database.PG
Services.ST -> Database.PG
Services.N8N -> Database.PG
Services.MB -> Database.PG
Services.GR -> Database.PG: read-only Datasource { style.stroke-dash: 5 }

Database.PG -> Storage.DRBD
Database.PG -> Backup.DUMP
Backup.DUMP -> Backup.NFS
Storage.DRBD -> Backup.S3
```

## DRBD-Replikation

Das PostgreSQL-Datenverzeichnis liegt auf einem Linstor CSI Volume, das ueber DRBD zwischen den Nomad-Clients auf pve01 und pve02 repliziert wird. Die Replikation laeuft ueber das Thunderbolt-Netzwerk (10.99.1.0/24) mit rund 20 Gbps Bandbreite.

```d2
direction: right

pve01: pve01 vm-nomad-client-05 {
  style.stroke-dash: 4
  D1: DRBD postgres-data Primary oder Secondary { style.border-radius: 8 }
}

pve02: pve02 vm-nomad-client-06 {
  style.stroke-dash: 4
  D2: DRBD postgres-data Primary oder Secondary { style.border-radius: 8 }
}

pve01.D1 <-> pve02.D2: Thunderbolt ~20 Gbps { tooltip: 10.99.1.0/24 }
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
