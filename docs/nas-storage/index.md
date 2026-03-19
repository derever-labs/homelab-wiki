---
title: NAS-Speicher
description: Synology NAS als zentraler NFS- und S3-Speicher im Homelab
tags:
  - infrastructure
  - storage
  - nfs
  - minio
  - nas
---

# NAS Storage

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Typ** | Synology NAS |
| **Netzwerk** | IoT VLAN |
| **Funktion** | NFS-Exports, MinIO S3, Backup-Ziel |

Hardware-Details (Modell, Festplatten, RAID): [Server-Hardware](../_referenz/hardware-inventar.md#nas)

## Rolle im Stack

Das NAS ist der zentrale Shared-Storage-Knoten im Cluster. Alle persistenten Daten, die nicht auf lokalen SSDs oder DRBD-Volumes liegen müssen, werden hier gespeichert. Die Nomad-Clients mounten die NFS-Shares und stellen sie als Docker-Volumes bereit. Zusätzlich bietet das NAS über MinIO einen S3-kompatiblen Object Store für Backups und Terraform State.

## NFS-Exports

Die folgenden Pfade werden als NFS-Shares bereitgestellt und auf allen Nomad-Client-VMs gemountet:

| Export-Pfad | Mount auf Clients | Verwendung |
| :--- | :--- | :--- |
| `/nfs/docker/` | `/nfs/docker/` | Persistente Daten für Container (Configs, DB-Dateien) |
| `/nfs/jellyfin/` | `/nfs/media/` | Medien-Bibliothek für Jellyfin und arr-Stack |
| `/nfs/nomad/jobs/` | `/nfs/nomad/jobs/` | Nomad Job-Spezifikationen |
| `/nfs/cert/` | `/nfs/cert/` | TLS-Zertifikate (Read-Only) |
| `/nfs/backup/` | `/nfs/backup/` | Backup-Ziel für pg_dumpall und weitere Jobs |
| `/nfs/logs/` | `/nfs/logs/` | Log-Dateien für Batch-Jobs |

Die Mount-Punkte werden über Ansible in `/etc/fstab` der jeweiligen VMs konfiguriert.

## MinIO S3

Das NAS betreibt eine MinIO-Instanz als S3-kompatiblen Object Store.

| Attribut | Wert |
| :--- | :--- |
| **Zweck** | Linstor S3 Shipping, Terraform State |
| **Buckets** | `linstor-backups`, `terraform-state` |

Credentials werden in 1Password verwaltet.

## Wartung

- Das NAS verwaltet seine eigene RAID-Konsistenz (SHR/RAID)
- Snapshots werden auf dem NAS selbst gesteuert
- Monitoring via CheckMK (SNMP oder Agent)

## Verwandte Seiten

- [Server-Hardware](../_referenz/hardware-inventar.md) -- NAS-Hardware-Details
- [Datenstrategie](../_querschnitt/datenstrategie.md) -- Speicher-Ebenen und Replikation
- [Backup-Strategie](../backup/index.md) -- pg_dumpall und Linstor Snapshots auf NFS/MinIO
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Backup-Ziele
- [Proxmox Cluster](../proxmox/index.md) -- Nomad-Client-VMs, die NFS mounten
