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

**Leitfrage:** Wohin verbinden sich die Services, und auf welchen zwei Wegen landen die Daten im Backup?

Lese-Konvention für alle Diagramme dieser Seite: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt-Nummer und was fliesst -- Request und Antwort teilen sich einen Pfeil. Durchgezogene Kanten sind synchrone Zugriffe (der Initiator wartet auf die Antwort), gestrichelte laufen zeitgesteuert oder im Hintergrund. Farben kodieren den Weg: **Grün** der App-Zugriff und die Service Discovery, **Violett** der Storage-Pfad (CSI und DRBD), **Bernstein** der Backup-Pfad, **Blau** der Nomad-Steuerpfad, **Grau** Quorum- und Hintergrundverkehr, **Rot** das Ausfall-Ereignis.

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  app: { style: { stroke: "#16a34a" } }
  storagep: { style: { stroke: "#7c3aed" } }
  backup: { style: { stroke: "#d97706"; stroke-dash: 3 } }
}

Services: "Services (Nomad)" {
  class: node
  style.multiple: true
  tooltip: "Service-zu-Datenbank-Zuordnung: Referenz Datenbanken"
}

PG: "PostgreSQL Shared Cluster" {
  shape: cylinder
  class: node
  tooltip: "postgres.service.consul:5432"
}

MDB: "MariaDB Cluster" {
  shape: cylinder
  class: node
  tooltip: "mariadb.service.consul:3306"
}

Storage: "Linstor CSI Volumes (DRBD-repliziert)" { class: node }

Dump: "Dump-Jobs (Nomad Batch, täglich)" {
  class: node
  tooltip: "pg_dumpall und mariadb-dump -- Zeitplan und Retention siehe Backup-Tabelle"
}
NFS: "NFS-Backup" { shape: cylinder; class: node }
PBS: "PBS (VM-Block-Backup)" { shape: cylinder; class: node }

Services -> PG: "1 SQL via Consul DNS\n(Standard)" { class: app }
Services -> MDB: "1 SQL via Consul DNS\n(nur MySQL-pflichtige Services)" { class: app }
PG -> Storage: "2 Block-Writes\nauf das CSI-Volume" { class: storagep }
MDB -> Storage: "2 Block-Writes\nauf das CSI-Volume" { class: storagep }
Dump -> PG: "3 SQL-Export\n(logischer Dump)" { class: backup }
Dump -> MDB: "3 SQL-Export\n(logischer Dump)" { class: backup }
Dump -> NFS: "4 Dump-Dateien\n(GFS-Retention)" { class: backup }
Storage -> PBS: "5 VM-Block-Backup\n(Proxmox sichert die Storage-VMs)" { class: backup }
```

Kurzablauf:

1. Services verbinden sich per Consul DNS auf `postgres.service.consul:5432` (Standard) bzw. `mariadb.service.consul:3306` -- die Zuordnung pro Service steht in der [Datenbank-Referenz](../_referenz/datenbanken.md).
2. Beide Cluster schreiben ihre Daten auf Linstor-CSI-Volumes, die per DRBD synchron zwischen den beiden Storage-Nodes repliziert sind ([DRBD-Replikation](#drbd-replikation)).
3. Der erste Backup-Weg ist logisch: tägliche Dump-Jobs exportieren per SQL-Verbindung ([Backup](#backup)).
4. Die Dumps landen mit GFS-Retention auf dem NFS-Backup-Share ([Backup-Architektur](../storage/backup/)).
5. Der zweite Backup-Weg ist blockbasiert: Proxmox sichert die Storage-VMs inklusive der DRBD-Volumes auf den PBS ([Backup-Architektur](../storage/backup/)).
6. Fällt der Node mit der aktiven Datenbank-Instanz aus, greift das [Failover-Szenario](#failover-bei-ausfall-des-primary-nodes).

## DRBD-Replikation

Das PostgreSQL-Datenverzeichnis liegt auf einem Linstor CSI Volume, das über DRBD zwischen den Nomad-Clients auf pve01 und pve02 repliziert wird. Die Replikation läuft über das dedizierte Thunderbolt-Netzwerk, dessen hohe Bandbreite die synchrone Block-Replikation ohne spürbare Schreiblatenz ermöglicht. Adressen und Bandbreite: [Hosts und IPs](../_referenz/hosts-und-ips.md#thunderbolt-netzwerk).

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  host: { style: { border-radius: 8; stroke-dash: 4 } }
  storagep: { style: { stroke: "#7c3aed" } }
}

pve01: "pve01 (vm-nomad-client-05)" {
  class: host
  D1: "DRBD postgres-data-r2\nPrimary oder Secondary" { class: node }
}

pve02: "pve02 (vm-nomad-client-06)" {
  class: host
  D2: "DRBD postgres-data-r2\nPrimary oder Secondary" { class: node }
}

pve01.D1 <-> pve02.D2: "synchrone Block-Replikation (Thunderbolt)" { class: storagep }
```

Nur ein Node hat zur gleichen Zeit den Primary-Status. Nomad steuert, auf welchem Client der PostgreSQL-Job läuft. Was beim Ausfall des Primary-Nodes passiert, zeigt das folgende Szenario.

## Failover bei Ausfall des Primary-Nodes

**Leitfrage:** Was passiert, wenn der Storage-Node mit der aktiven PostgreSQL-Instanz ausfällt -- wer verschiebt die Datenbank, wer schaltet das Volume um, und wie finden die Apps sie wieder?

Das Diagramm zeigt den Ausfall von `vm-nomad-client-05` mit laufender PostgreSQL-Instanz. Für MariaDB gilt das Szenario analog, da beide Cluster dem gleichen Storage-Pattern folgen ([MariaDB Cluster](#mariadb-cluster)).

```d2
direction: down

classes: {
  node: { style: { border-radius: 8 } }
  host: { style: { border-radius: 8; stroke-dash: 4 } }
  losthost: { style: { border-radius: 8; stroke: "#d93025"; stroke-dash: 4 } }
  lost: { style: { border-radius: 8; stroke: "#d93025"; fill: "#fce8e6" } }
  fail: { style: { stroke: "#d93025"; stroke-dash: 3 } }
  steuer: { style: { stroke: "#2563eb"; stroke-dash: 3 } }
  storagep: { style: { stroke: "#7c3aed" } }
  disco: { style: { stroke: "#16a34a" } }
  intern: { style: { stroke: "#6b7280"; stroke-dash: 3 } }
}

servers: "Nomad Server Cluster" {
  class: node
  tooltip: "3 Server mit Raft -- entscheiden das Placement der neuen Allocation"
}

c05: "vm-nomad-client-05 (ausgefallen)" {
  class: losthost
  grid-columns: 1
  pg: "PostgreSQL Allocation (verloren)" { class: lost }
  drbd: "DRBD postgres-data-r2 (war Primary)" { class: lost }
}

c06: "vm-nomad-client-06 (übernimmt)" {
  class: host
  grid-columns: 1
  csi: "CSI-Plugin (Node)" {
    class: node
    tooltip: "system/linstor-csi.nomad -- privileged, führt Mount-Operationen auf dem Host aus"
  }
  drbd: "DRBD postgres-data-r2 (Secondary wird Primary)" { class: node }
  pg: "PostgreSQL Allocation (neu)" { class: node }
}

lc: "Linstor Controller (drbd-reactor HA)" {
  class: node
  tooltip: "linstor-controller.service.consul:3370 -- läuft via drbd-reactor immer auf einem lebenden Storage-Node"
}

c04: "vm-nomad-client-04 (Diskless Witness)" {
  class: node
  tooltip: "Nur Quorum-Stimme, keine Daten"
}

consul: "Consul" {
  class: node
  tooltip: "Service-Katalog und DNS -- postgres.service.consul"
}

apps: "App-Tasks (Nomad)" {
  class: node
  style.multiple: true
  tooltip: "Neu startende Tasks warten via wait-for-postgres Init-Task"
}

c05 -> servers: "1 Heartbeat bleibt aus (Karenz 5 min)" { class: fail }
servers -> c06: "2 Reschedule der PostgreSQL-Allocation (RPC)" { class: steuer }
c06.csi -> lc: "3 Volume-Claim (Linstor API)" { class: storagep }
c06.csi -> c06.drbd: "4 Attach: Volume wird Primary und gemountet" { class: storagep }
c06.pg -> c06.drbd: "5 Start auf dem replizierten Datenbestand" { class: storagep }
c06.pg -> consul: "6 Registrierung postgres.service.consul und Health Check" { class: disco }
apps -> c06.pg: "7 Reconnect (SQL 5432 via Consul DNS)" { class: disco }
c06.drbd -- c04: "Quorum 2 von 3 bleibt erhalten" { class: intern }
```

Kurzablauf:

1. Der ausgefallene Node beantwortet keinen Heartbeat mehr. Nomad wartet die Karenz von `max_client_disconnect` (5 Minuten bei CSI-Jobs) ab, bevor die Allocation als verloren gilt ([Nomad -- Ausfallverhalten](../plattform/nomad/index.md#ausfallverhalten)).
2. Die Nomad-Server platzieren die PostgreSQL-Allocation neu auf dem zweiten Storage-Node -- mit dem Postgres-Sonderprofil: höchstens 3 Reschedule-Versuche in 30 Minuten und `restart mode=fail`, bei wiederholtem Scheitern ist manuelles Eingreifen erwartet ([Nomad Referenz](../plattform/nomad/referenz.md#restart-reschedule-disconnect)).
3. Das CSI-Plugin auf dem übernehmenden Node fordert das Volume beim Linstor Controller an. Die Consul-Adresse zeigt immer auf den aktiven Controller -- war der ausgefallene Node zugleich Controller-Node, promotet drbd-reactor den Standby in 10-15 Sekunden ([Linstor Betrieb -- Controller Failover](../storage/linstor/betrieb.md#controller-failover)).
4. Beim Attach wird der überlebende Node DRBD Primary, und das CSI-Plugin mountet den synchron replizierten Datenbestand. Zusammen mit dem Diskless Witness hält der Cluster das Schreib-Quorum 2 von 3 ([Linstor -- Node-Ausfall und Heilung](../storage/linstor/index.md#node-ausfall-und-heilung)).
5. PostgreSQL startet auf dem Volume -- die verlängerten Update-Fristen der CSI-Jobs rechnen die Attach-Zeit ein ([Nomad Referenz -- update-Stanza](../plattform/nomad/referenz.md#csi-volume-jobs)).
6. Der lokale Consul-Agent registriert die neue Instanz als `postgres.service.consul`, der Health Check macht sie für Clients sichtbar ([Consul -- Service Discovery](../plattform/consul/index.md#service-discovery)).
7. Bestehende App-Verbindungen brechen mit dem Ausfall. Neu startende Tasks warten via `wait-for-postgres`-Init-Task auf die Datenbank, laufende Apps verbinden sich über Consul DNS neu ([Service-Abhängigkeiten](./service-abhaengigkeiten.md#postgresql-abhangige-services)).

::: warning CSI-Stale-Claims können den Re-Attach blockieren
Linstor-CSI entwickelt unter Last Stale-Claims: Bleibt nach einem harten Stopp der alte Volume-Claim im Plugin-State, scheitert der nächste Attach mit "failed to set source device readwrite". `nomad system gc` räumt solche Claims auf -- präventiv läuft dafür der tägliche Batch-Job `batch-jobs/csi-gc.nomad`. Verwaiste Mounts auf den Storage-Nodes erkennt zusätzlich das [CSI Health Monitoring](../storage/linstor/index.md#csi-health-monitoring) (Alert, Cleanup manuell). Hintergrund: [Postmortem 2026-05-12](./postmortems/2026-05-12-zot-nas-cascade.md).
:::

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
- [Nomad](../plattform/nomad/) -- Scheduling, Ausfallverhalten und Timeout-Profile
- [Cluster-Resilience](./cluster-resilience.md) -- Failure-Szenarien des Gesamt-Stacks
