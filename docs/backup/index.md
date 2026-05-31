# Backup

::: info SSOT
Diese Seite beschreibt die Backup-Strategie des Homelab-Clusters.
:::

## Überblick

Das Homelab nutzt drei sich ergänzende Backup-Ebenen:

1. **Proxmox Backup Server (PBS)** — VM-Block-Level-Backups inkl. LINSTOR-Volumes, täglich
2. **PostgreSQL/MariaDB/InfluxDB Dumps** — applikationskonsistente Logik-Dumps nach `/nfs/backup`
3. **DRBD-Replikation** — 2× Live-Replica (Hochverfügbarkeit, kein Backup)

::: tip Warum keine separate LINSTOR-Volume-Sicherung?
PBS sichert die Storage-VMs (c05/c06) inklusive der LINSTOR-Daten-Disk als Block — die
LINSTOR-Volumes sind damit bereits abgedeckt. Eine zusätzliche LINSTOR-S3-Schicht
(Snapshot → Garage) war redundant und wurde am 2026-05-31 zurückgebaut.
:::

## Ebene 1: Proxmox Backup Server

- **Was:** Ganze VMs (Block-Level inkl. LINSTOR-Volumes)
- **Wohin:** PBS auf 10.0.2.50, Datastore `homeserver` (NFS auf NAS `10.0.0.200`)
- **Wann:** Täglich 02:00 (Job „all 1")
- **Ausnahmen:** VMs 102, 104, 200, 99999

## Ebene 2: Applikations-Dumps

- **Was:** PostgreSQL (`pg_dumpall`), MariaDB (`mariadb-dump`), InfluxDB (`influx backup`)
- **Wohin:** `/nfs/backup/` (NFS auf NAS)
- **Wann:** PostgreSQL 03:00, MariaDB 03:15, InfluxDB 03:30
- **Warum:** Applikationskonsistent (vs. Block-Level-Crash-Konsistenz von PBS)

## Ebene 3: DRBD-Replikation

- **Was:** Synchrone Block-Replikation c05 ↔ c06
- **Wie:** 2× `UpToDate` pro Volume (c04 diskless Tiebreaker)
- **Zweck:** Hochverfügbarkeit (kein Backup im eigentlichen Sinn)

## Bewusste Architektur-Grenzen

::: warning Kein Off-Site / 3-2-1 unvollständig
Alle Backup-Ziele (PBS-Datastore, App-Dumps) liegen per NFS auf dem NAS `10.0.0.200`.
Das NAS ist damit ein Single Point of Failure, und es gibt keine geografische
Off-Site-Kopie. Das ist eine **bewusste Entscheidung** (kein volles 3-2-1) — das NAS
hat eine eigene Backup-Strategie. Homelab- und DCLab-Backups bleiben strikt getrennt
(keine Cross-Cluster-Sicherung).
:::

::: warning Multi-Node-Restore nicht verifiziert
Ein gleichzeitiger PBS-Restore beider Storage-VMs (c05 + c06) wurde nicht durchgespielt.
Das DRBD-Split-Brain-Handling nach einem solchen Restore wäre manuell aufzulösen.
:::

## Verwandte Seiten

- [LINSTOR Storage](/linstor-storage/)
- [Proxmox Backup Server](/proxmox/pbs)
