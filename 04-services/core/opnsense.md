---
title: OPNsense Gateway
description: Zentrales Gateway und Firewall
published: true
date: 2025-12-26T19:00:00+00:00
tags: infrastructure, networking, gateway
editor: markdown
---

# OPNsense Gateway

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **IP** | 10.0.0.1 |
| **Funktion** | Gateway, Firewall, DHCP |

## Beschreibung
Die OPNsense Firewall fungiert als zentrales Gateway für das gesamte Homelab-Netzwerk. Sie trennt die verschiedenen VLANs (Management, IoT, Docker) und regelt den Datenverkehr.

## Netzwerk
- **LAN / Management:** 10.0.0.0/24 (Gateway: 10.0.0.1)
- **VLANs:**
  - Management: 10.0.2.0/24
  - IoT: 10.0.0.0/24
  - Docker Proxy: 192.168.90.0/24

## Konfiguration
Die Konfiguration erfolgt primär über das Web-Interface.
DNS-Anfragen werden je nach VLAN entweder direkt beantwortet oder an den internen DNS-Proxy (10.0.2.1) weitergeleitet.

## Maintenance
Updates werden manuell über das Web-Interface eingespielt. Vor jedem Update sollte ein Backup der Konfiguration erstellt werden (System -> Configuration -> Backups).

---
*Dokumentation erstellt am: 26.12.2025*
