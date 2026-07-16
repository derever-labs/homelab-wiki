---
title: Datenbank-Architektur
description: PostgreSQL und MariaDB Shared Cluster mit DRBD-Replikation über Thunderbolt
tags:
  - architektur
  - postgresql
  - mariadb
  - drbd
  - querschnitt
---

# Datenbank-Architektur

## Übersicht

Das Homelab verwendet zwei zentrale Datenbank-Cluster auf DRBD-replizierten Volumes:

- **PostgreSQL Shared Cluster** für Services mit PostgreSQL-Backend (Standard für die meisten Apps)
- **MariaDB Cluster** für Services die zwingend MySQL/MariaDB benötigen (Uptime Kuma)

Alle Services verbinden sich über Consul DNS (`postgres.service.consul:5432` bzw. `mariadb.service.consul:3306`). Einzelne Services mit inkompatiblen Anforderungen verwenden Sidecar-Datenbanken (z.B. Obsidian LiveSync mit CouchDB). Grafana verbindet sich zusätzlich als read-only Datasource direkt mit dem PostgreSQL Shared Cluster.

Dieser Ansatz minimiert den Betriebsaufwand: zwei Cluster mit je einem Backup-Job, einer Monitoring-Konfiguration und einem Restore-Prozess -- statt dutzender individueller Datenbank-Instanzen.

## Architektur

```d2
direction: down

Services: "Services (Nomad)" {
  style: { border-radius: 8; multiple: true }
  tooltip: "Service-zu-Datenbank-Zuordnung: Referenz Datenbanken"
}

PG: "PostgreSQL Shared Cluster" {
  shape: cylinder
  style.border-radius: 8
  tooltip: "postgres.service.consul:5432"
}

MDB: "MariaDB Cluster" {
  shape: cylinder
  style.border-radius: 8
  tooltip: "mariadb.service.consul:3306"
}

Storage: "Linstor CSI Volumes (DRBD-repliziert)" { style.border-radius: 8 }

Dump: "Logische Dumps (täglich, GFS)" { style.border-radius: 8 }
NFS: "NFS-Backup" { shape: cylinder; style.border-radius: 8 }
PBS: "PBS (VM-Block-Backup)" { shape: cylinder; style.border-radius: 8 }

Services -> PG: "Standard"
Services -> MDB: "nur MySQL-pflichtige Services"
PG -> Storage
MDB -> Storage
PG -> Dump
MDB -> Dump
Dump -> NFS
Storage -> PBS
```

## DRBD-Replikation

Das PostgreSQL-Datenverzeichnis liegt auf einem Linstor CSI Volume, das über DRBD zwischen den Nomad-Clients auf pve01 und pve02 repliziert wird. Die Replikation läuft über das dedizierte Thunderbolt-Netzwerk, dessen hohe Bandbreite die synchrone Block-Replikation ohne spürbare Schreiblatenz ermöglicht. Adressen und Bandbreite: [Hosts und IPs](../_referenz/hosts-und-ips.md#thunderbolt-netzwerk).

```d2
direction: right

pve01: "pve01 (vm-nomad-client-05)" {
  style.stroke-dash: 4
  D1: "DRBD postgres-data\nPrimary oder Secondary" { style.border-radius: 8 }
}

pve02: "pve02 (vm-nomad-client-06)" {
  style.stroke-dash: 4
  D2: "DRBD postgres-data\nPrimary oder Secondary" { style.border-radius: 8 }
}

pve01.D1 <-> pve02.D2: "Thunderbolt (synchrone Replikation)"
```

Nur ein Node hat zur gleichen Zeit den Primary-Status. Nomad steuert, auf welchem Client der PostgreSQL-Job läuft.

## MariaDB Cluster

MariaDB folgt dem gleichen Storage-Pattern wie PostgreSQL: Single-Instance auf DRBD-replizierter Linstor-CSI-Volume, Failover via Nomad-Reschedule auf zweite Storage-Node. Die Performance-Konfiguration ist auf DRBD-Storage abgestimmt, weil DRBD bereits atomare Block-Writes garantiert und damit doppelte Schreibsicherung auf Datenbankebene überflüssig macht. Die konkreten Tuning-Parameter sind unter [Datenbanken](../_referenz/datenbanken.md) dokumentiert.

Neue Datenbanken und User werden über den idempotenten `mariadb-setup`-Batch-Job angelegt. Service-Passwörter liegen unter `kv/data/shared/mariadb` (z.B. `uptime_kuma_password`).

## Backup

Die vollständige Backup-Dokumentation befindet sich unter [Backup](../storage/backup/).

| Methode | Zeitplan | Retention | Ziel |
| :--- | :--- | :--- | :--- |
| pg_dumpall | Täglich 03:00 UTC | GFS: 7d/4w/3m | NFS `/nfs/backup/postgres/` |
| mariadb-dump | Täglich 03:15 UTC | GFS: 7d/4w/3m | NFS `/nfs/backup/mariadb/` |

## Verwandte Seiten

- [Datenbanken](../_referenz/datenbanken.md) -- Service-zu-Datenbank-Zuordnung, Vault-Pfade, Nomad Jobs
- [Backup](../storage/backup/) -- PostgreSQL Dumps, PBS-VM-Backups und Retention
- [Linstor Storage](../storage/linstor/) -- DRBD-Storage und Linstor CSI
