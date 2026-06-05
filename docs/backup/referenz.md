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
| **Web-UI** | Port 8007 (HTTPS) |

Hostname, VM ID und Host der PBS-VM sind in [Hosts und IPs](../_referenz/hosts-und-ips.md) dokumentiert.

## Was wird gesichert

PBS sichert alle VMs und Container des Proxmox-Clusters täglich. Die Backup-Jobs werden direkt in Proxmox VE konfiguriert; jede PVE-Node sendet die Backups ihrer lokalen VMs an PBS. Übersicht aller Backup-Ebenen inklusive applikationsspezifischer Backups: [Backup](./index.md).

Auch die externen [Standalone-Nodes](../proxmox/index.md#externe-standalone-nodes) `pve-lu-01` (Luzern) und `pve-01-nana` (Dottikon) sichern ihre VMs auf denselben PBS -- der Backup-Push läuft über Tailscale. PBS wird dabei über die **lokale IP** (`10.0.2.50`) als Storage eingebunden (VPN-agnostisch), mit dediziertem Token `root@pam!pve-backup` (Rolle `DatastoreBackup`).

## Retention Policy

| Parameter | Wert |
| :--- | :--- |
| **Keep Last** | 7 (tägliche Backups) |
| **Keep Weekly** | 4 |
| **Keep Monthly** | 6 |

PBS wendet die Retention-Regeln automatisch an und entfernt veraltete Backups via Garbage Collection. Durch die Deduplizierung werden dabei nur Datenblöcke gelöscht, die von keinem verbleibenden Backup mehr referenziert werden.

## Datastore

Der PBS-Datastore liegt per NFS auf dem NAS, nicht auf einem lokalen Pool der PBS-VM. Damit ist das NAS ein Single Point of Failure -- eine bewusste Entscheidung ohne Off-Site-Kopie (Details und SPOF-Betrachtung: [Backup](./index.md)).

## Monitoring

PBS sendet Heartbeats an Uptime Kuma nach erfolgreichen Backup-Operationen.

- **Typ:** Push Monitor
- **Konfiguration:** Webhook Endpoint in PBS (`uptime-kuma-heartbeat`) triggert bei `backup-success-heartbeat`
- **Empfänger:** Uptime Kuma API (Port 3001)

Falls der Heartbeat ausbleibt (Backup fehlgeschlagen oder PBS nicht erreichbar), alarmiert Uptime Kuma via Telegram.

## Verwandte Seiten

- [Backup](./index.md) -- Gesamtübersicht aller Backup-Schichten
- [Proxmox](../proxmox/) -- Proxmox VE Cluster-Konfiguration und VM-Übersicht
- [Monitoring](../monitoring/) -- Uptime Kuma und Grafana für Backup-Monitoring
