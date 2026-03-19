---
title: Backup Referenz
description: Proxmox Backup Server, Retention Policies und Datastore-Details
tags:
  - backup
  - pbs
  - proxmox
  - referenz
---

# Backup Referenz

## PBS Uebersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Hostname** | pbs-backup-server |
| **VM ID** | 99999 |
| **Host** | pve02 |
| **Web-UI** | Port 8007 (HTTPS) |

## Was wird gesichert

PBS sichert alle VMs und Container des Proxmox-Clusters. Die Backup-Jobs werden direkt in Proxmox VE konfiguriert und laufen taeglich. Jede PVE-Node sendet die Backups ihrer lokalen VMs an PBS.

Ergaenzend zu den VM-Backups gibt es applikationsspezifische Backups (PostgreSQL Dumps, DRBD Snapshots, Litestream Replication), die in der [Backup-Uebersicht](./index.md) dokumentiert sind.

## Retention Policy

| Parameter | Wert |
| :--- | :--- |
| **Keep Last** | 7 (taegliche Backups) |
| **Keep Weekly** | 4 |
| **Keep Monthly** | 6 |

PBS wendet die Retention-Regeln automatisch an und entfernt veraltete Backups via Garbage Collection. Durch die Deduplizierung werden dabei nur Datenbloecke geloescht, die von keinem verbleibenden Backup mehr referenziert werden.

## Datastore

Der Datastore nutzt einen lokalen ZFS-Pool auf der PBS-VM. ZFS bietet dabei zusaetzliche Datenintegritaet durch Checksummen auf Blockebene.

## Monitoring

PBS sendet Heartbeats an Uptime Kuma nach erfolgreichen Backup-Operationen.

- **Typ:** Push Monitor
- **Konfiguration:** Webhook Endpoint in PBS (`uptime-kuma-heartbeat`) triggert bei `backup-success-heartbeat`
- **Empfaenger:** Uptime Kuma API (Port 3001)

Falls der Heartbeat ausbleibt (Backup fehlgeschlagen oder PBS nicht erreichbar), alarmiert Uptime Kuma via Telegram.

## Wartung

Updates erfolgen ueber den integrierten Update-Manager im Web-Interface. Da PBS als eigenstaendige VM laeuft, wird die VM selbst ebenfalls von PBS gesichert (Backup auf pve02 lokal).

## Verwandte Seiten

- [Backup](./index.md) -- Gesamtuebersicht aller Backup-Schichten
- [Proxmox](../proxmox/) -- Proxmox VE Cluster-Konfiguration und VM-Uebersicht
- [Monitoring](../monitoring/) -- Uptime Kuma und Grafana fuer Backup-Monitoring
