---
title: CheckMK
description: Zentrale Monitoring & Alerting Plattform
published: true
date: 2025-12-26T18:30:00+00:00
tags: service, monitoring, infrastructure
editor: markdown
---

# CheckMK Monitoring

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [monitoring.ackermannprivat.ch](https://monitoring.ackermannprivat.ch) / `http://10.0.2.150/mon` |
| **Deployment** | VM (ID: 2000) |
| **Host** | `pve01` |
| **IP** | 10.0.2.150 |

## Beschreibung
CheckMK ist die zentrale Enterprise-Monitoring-Lösung für das Homelab. Sie überwacht Server, Netzwerk-Geräte, Services und Anwendungen in Echtzeit.

## Konfiguration
### VM Ressourcen
* **CPU:** 2 vCPU
* **RAM:** 4 GB
* **Disk:** 40 GB (ZFS Storage)

### Zentrale Funktionen
- **Infrastructure Monitoring:** Überwachung von Proxmox, Nomad-Nodes und NAS.
- **Service Monitoring:** CPU, RAM, Disk, Prozesse.
- **Alerting:** Benachrichtigungen via E-Mail und Gotify.
- **Auto-Discovery:** Automatische Erkennung neuer Services im Netzwerk.

## Abhängigkeiten
- **Storage:** Läuft auf lokalem ZFS der Proxmox Node.
- **Netzwerk:** Benötigt Zugriff auf TCP 6556 (Agent) auf allen Hosts.

## Maintenance & Runbook
### Update
Das Update erfolgt über das OMD-Paketmanagement innerhalb der VM:
```bash
ssh sam@10.0.2.150
sudo omd update mon
```

### Backup
Die gesamte VM wird täglich vom Proxmox Backup Server (PBS) gesichert.

### Häufige Befehle
```bash
omd status    # Status der Site prüfen
omd restart   # Gesamtes Monitoring neu starten
```

---
*Dokumentation migriert und aktualisiert am: 26.12.2025*