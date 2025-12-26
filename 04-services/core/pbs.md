---
title: Proxmox Backup Server
description: Zentrale Backup-Lösung für VMs
published: true
date: 2025-12-26T19:05:00+00:00
tags: infrastructure, backup, pbs
editor: markdown
---

# Proxmox Backup Server (PBS)

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Hostname** | pbs-backup-server |
| **IP** | 10.0.2.50 |
| **VM ID** | 99999 |
| **Host** | pve02 |

## Beschreibung
Der Proxmox Backup Server ist die zentrale Instanz für alle VM- und Container-Backups. Er nutzt Deduplizierung, um Speicherplatz effizient zu nutzen.

## Konfiguration
- **Datastore:** Lokaler ZFS-Pool oder durchgereichter NFS-Share.
- **Retention Policy:**
  - Keep Last: 7 (Täglich)
  - Keep Weekly: 4
  - Keep Monthly: 6

## Zugriff
Das Web-Interface ist unter `https://10.0.2.50:8007` erreichbar.
Login erfolgt meist über `root` oder integrierte Proxmox-User (sofern konfiguriert).

## Maintenance
Updates erfolgen über den integrierten Update-Manager oder via CLI:
```bash
apt update && apt dist-upgrade
```

---
*Dokumentation erstellt am: 26.12.2025*
