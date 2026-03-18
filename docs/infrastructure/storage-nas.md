---
title: NAS-Speicher
description: Zentraler NFS Speicher
tags:
  - infrastructure
  - storage
  - nfs
---

# NAS Storage

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **IP** | 10.0.0.200 |
| **Typ** | Synology NFS |

## Exports
Die folgenden Pfade werden als NFS-Shares bereitgestellt und im Cluster gemountet:

| Pfad | Verwendung |
| :--- | :--- |
| `/nfs/docker/` | Persistente Daten für Docker Container |
| `/nfs/jellyfin/` | Medien-Bibliothek für Jellyfin & arr-Stack |
| `/nfs/nomad/jobs/` | Job-Spezifikationen für Nomad |
| `/nfs/cert/` | Zertifikate (Read-Only für Services) |
| `/nfs/backup/` | Ziel für Backups (falls nicht via PBS) |
| `/nfs/logs/` | Logs für Batch-Jobs (z.B. Reddit Downloader) |

## Einbindung
Die Clients (Nomad Nodes, VMs) mounten die Shares meist via `/etc/fstab` oder direkt über den Docker-Volume-Driver.

Die Mount-Punkte sind in `/etc/fstab` der jeweiligen VMs konfiguriert (verwaltet durch Ansible).

## Maintenance
Das NAS verwaltet seine eigene RAID-Konsistenz (meist SHR oder RAID5/6).
Wichtig: Snapshots werden auf dem NAS selbst gesteuert.

---
*Dokumentation erstellt am: 26.12.2025*
