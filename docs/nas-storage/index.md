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

## Troubleshooting

### NFS `fileid changed`-Fehler

**Symptom:** Der Linux-Kernel auf den Client-VMs loggt `NFS: server 10.0.0.200 error: fileid changed`. Anwendungen (z.B. SABnzbd) erhalten `FileNotFoundError` oder `ESTALE`.

**Ursache:** Synology DSM laeuft auf Kernel 4.4.x. Btrfs vergibt Inode-Nummern pro Subvolume, nicht dateisystemweit. Der NFS-Server kann die verschiedenen Subvolume-IDs nicht in eindeutige fileids umrechnen -- der dafuer noetige Kernel-Fix (XOR Subvolume-ID + Inode) existiert erst ab Linux 5.17+. Btrfs-Snapshots, Indexierung und Scrubs koennen fileids aendern.

**Mitigation (Client-Seite):**
- Niedrige Attribut-Cache-Zeiten (`acregmin/acregmax`, `acdirmin/acdirmax`) verkuerzen das Zeitfenster, in dem stale fileids gecacht werden
- Mount-Optionen werden zentral in der Ansible-Rolle `roles/nfs/defaults/main.yml` verwaltet
- `lookupcache=positive` hilft **nicht** -- kontrolliert Dentry-Cache, nicht Attribut-Cache
- `nconnect` erst hinzufuegen wenn fileid serverseitig geloest ist (erhoeht Revalidierungs-Parallelitaet)

**Mitigation (Server-Seite):**
- Indexierung (Media Indexing) fuer NFS-exportierte Ordner deaktivieren
- Snapshot-Frequenz reduzieren oder deaktivieren fuer Shares mit aktiver NFS-Nutzung
- `@eaDir`-Verzeichnisse nach Deaktivierung der Indexierung entfernen

### Staler NFS-Directory-Cache

Zu hohe `acdirmin/acdirmax`-Werte (z.B. 1800s) fuehren dazu, dass der NFS-Client veraltete Verzeichnisinhalte sieht. Anwendungen, die waehrend Downloads neue Dateien erstellen (SABnzbd), erhalten `FileNotFoundError` wenn der gecachte Verzeichniseintrag nicht mit dem aktuellen Zustand uebereinstimmt.

## Wartung

- Das NAS verwaltet seine eigene RAID-Konsistenz (SHR/RAID)
- Snapshots werden auf dem NAS selbst gesteuert
- Monitoring: Siehe [Synology NAS Monitoring](../synology-monitoring/index.md)

## Verwandte Seiten

- [Server-Hardware](../_referenz/hardware-inventar.md) -- NAS-Hardware-Details
- [Datenstrategie](../_querschnitt/datenstrategie.md) -- Speicher-Ebenen und Replikation
- [Backup-Strategie](../backup/index.md) -- pg_dumpall und Linstor Snapshots auf NFS/MinIO
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Backup-Ziele
- [Proxmox Cluster](../proxmox/index.md) -- Nomad-Client-VMs, die NFS mounten
- [Synology NAS Monitoring](../synology-monitoring/index.md) -- Telegraf SNMP, Grafana Dashboard, Alerting
