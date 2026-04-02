---
title: CheckMK
description: Zentrale Monitoring- und Alerting-Plattform für Host- und Service-Überwachung
tags:
  - service
  - monitoring
  - infrastructure
---

# CheckMK Monitoring

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [monitoring.ackermannprivat.ch](https://monitoring.ackermannprivat.ch) |
| **Deployment** | Eigenständige VM (ID: 2000) auf pve01 |
| **Auth** | CheckMK-eigene Benutzerverwaltung |
| **Storage** | Lokaler ZFS auf Proxmox Node |

## Rolle im Stack

CheckMK ist die zentrale Host-Level-Monitoring-Lösung für das Homelab. Es überwacht Hardwaremetriken (CPU, RAM, Disk, Netzwerk) und Systemdienste auf allen Infrastruktur-Nodes. Im Gegensatz zu Grafana/Loki (Metriken und Logs) und Gatus (Endpoint-Verfügbarkeit) fokussiert CheckMK auf den Zustand der Hosts selbst.

## Was wird überwacht

CheckMK überwacht alle relevanten Infrastruktur-Hosts über den CheckMK Agent:

- **Proxmox Hosts:** pve00, pve01, pve02 -- Hypervisor-Gesundheit, ZFS-Pools, SMART-Werte
- **Nomad Server:** vm-nomad-server-04/05/06 -- Systemdienste, Ressourcenauslastung
- **Nomad Clients:** vm-nomad-client-04/05/06 -- CPU, RAM, Disk, Docker-Daemon
- **Infrastruktur-VMs:** lxc-dns-01, lxc-dns-02, vm-traefik-01, vm-traefik-02, PBS, CheckMK selbst
- **NAS (Synology):** Disk-Status, Volume-Auslastung, RAID-Zustand
- **Netzwerk:** Erreichbarkeit kritischer Endpunkte

Zusätzlich nutzt CheckMK Auto-Discovery, um neue Services und Checks auf bereits registrierten Hosts automatisch zu erkennen.

## Agent-Deployment

Der CheckMK Agent läuft auf jedem überwachten Host und kommuniziert über TCP Port 6556. Der Agent wird als Paket (`check-mk-agent`) installiert und meldet bei Abfrage durch den CheckMK Server die aktuellen Systemmetriken.

Die Installation erfolgt manuell oder via Ansible. Der Agent hat keine eigene Konfigurationsdatei -- er liefert standardmässig alle verfügbaren Checks. Spezielle Agent-Plugins (z.B. für Docker oder PostgreSQL) können bei Bedarf nachinstalliert werden.

## Alarmierung

CheckMK benachrichtigt über zwei Kanäle:

- **E-Mail:** Über den zentralen [SMTP Relay](../smtp-relay/index.md) (smtp.service.consul:25)
- **Gotify:** Push-Benachrichtigungen auf mobile Geräte

Die Benachrichtigungsregeln sind in CheckMK konfiguriert. Standardmässig werden Warnungen (WARN) und kritische Zustände (CRIT) sofort gemeldet. Für geplante Wartungsfenster können Downtimes gesetzt werden.

## Wartung

- **Update:** Erfolgt über das OMD-Paketmanagement (`omd update`) innerhalb der VM
- **Backup:** Die gesamte VM wird täglich vom [Proxmox Backup Server](../backup/referenz.md) gesichert

## Verwandte Seiten

- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, Uptime Kuma und Alloy für Metriken und Logs
- [Gatus](../gatus/index.md) -- Öffentliche Status-Seite für Endpoint-Verfügbarkeit
- [SMTP Relay](../smtp-relay/index.md) -- Mail-Versand für CheckMK-Alerts
- [Proxmox Backup Server](../backup/referenz.md) -- VM-Backup von CheckMK