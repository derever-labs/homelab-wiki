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

## PBS Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Hostname** | pbs-backup-server |
| **VM ID** | 99999 |
| **Host** | pve02 |
| **Web-UI** | Port 8007 (HTTPS) |

## Was wird gesichert

PBS sichert alle VMs und Container des Proxmox-Clusters. Die Backup-Jobs werden direkt in Proxmox VE konfiguriert und laufen täglich. Jede PVE-Node sendet die Backups ihrer lokalen VMs an PBS.

Ergänzend zu den VM-Backups gibt es applikationsspezifische Backups (PostgreSQL Dumps, DRBD Snapshots, Litestream Replication), die in der [Backup-Übersicht](./index.md) dokumentiert sind.

## Retention Policy

| Parameter | Wert |
| :--- | :--- |
| **Keep Last** | 7 (tägliche Backups) |
| **Keep Weekly** | 4 |
| **Keep Monthly** | 6 |

PBS wendet die Retention-Regeln automatisch an und entfernt veraltete Backups via Garbage Collection. Durch die Deduplizierung werden dabei nur Datenblöcke gelöscht, die von keinem verbleibenden Backup mehr referenziert werden.

## Datastore

Der Datastore nutzt einen lokalen ZFS-Pool auf der PBS-VM. ZFS bietet dabei zusätzliche Datenintegrität durch Checksummen auf Blockebene.

## Monitoring

PBS sendet Heartbeats an Uptime Kuma nach erfolgreichen Backup-Operationen.

- **Typ:** Push Monitor
- **Konfiguration:** Webhook Endpoint in PBS (`uptime-kuma-heartbeat`) triggert bei `backup-success-heartbeat`
- **Empfänger:** Uptime Kuma API (Port 3001)

Falls der Heartbeat ausbleibt (Backup fehlgeschlagen oder PBS nicht erreichbar), alarmiert Uptime Kuma via Telegram.

## Wartung

Updates erfolgen über den integrierten Update-Manager im Web-Interface. Da PBS als eigenständige VM läuft, wird die VM selbst ebenfalls von PBS gesichert (Backup auf pve02 lokal).

## Verwandte Seiten

- [Backup](./index.md) -- Gesamtübersicht aller Backup-Schichten
- [Proxmox](../proxmox/) -- Proxmox VE Cluster-Konfiguration und VM-Übersicht
- [Monitoring](../monitoring/) -- Uptime Kuma und Grafana für Backup-Monitoring
