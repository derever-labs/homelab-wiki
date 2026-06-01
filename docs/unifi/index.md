---
title: UniFi
description: UniFi-Controller-Spezifika -- UDM Pro, WAN-Anbindung, WLAN und Firewall
tags:
  - netzwerk
  - unifi
  - vlan
  - gateway
  - wlan
---

# UniFi

Das UniFi Dream Machine Pro ist das zentrale Gateway und verwaltet das gesamte Netzwerk -- Routing, Switching, WLAN und Firewall. Der Controller läuft integriert auf dem UDM Pro. Diese Seite beschreibt die Controller-Spezifika; das kanonische Topologie-, Segment- und Hardware-Inventar führt [Netzwerk](../netzwerk/).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | `https://10.0.0.1` (Controller Web-UI, intern) |
| Deployment | UDM Pro integriert |

## Rolle im Stack

Das UDM Pro verbindet WAN-Uplink, alle Switches und Access Points und routet zwischen fünf VLAN-Segmenten (Management, Endgeräte, Gäste, Rack-Infrastruktur, IoT). Physische und logische Topologie, die VLAN-Segment-Tabelle mit Subnetzen und Gateways sowie das Switch- und Access-Point-Inventar sind kanonisch unter [Netzwerk](../netzwerk/) geführt. Welche SSID auf welchem VLAN liegt, steht in der [UniFi Referenz](./referenz.md#wlan-konfiguration).

::: info
Die kanonische Quelle für alle IP-Adressen ist die [Hosts und IPs](../_referenz/hosts-und-ips.md) Referenzseite. Die kanonische Quelle für Port-Forwards und Firewall-Regeln ist die [Ports und Dienste](../_referenz/ports-und-dienste.md) Referenzseite.
:::

## WAN-Anbindung

Der UDM Pro ist über den SFP+-Port (eth9) mit dem ISP-Router verbunden. Der RJ45-WAN-Port (eth8) ist nicht angeschlossen. Die öffentliche IP ist statisch.

## Verwandte Seiten

- [Netzwerk](../netzwerk/) -- Gesamtübersicht Netzwerk-Topologie inkl. Thunderbolt und Tailscale
- [DNS](../dns/) -- Pi-hole, Unbound, Consul DNS
- [Traefik](../traefik/) -- Reverse Proxy (Port-Forwards zeigen auf Traefik VIP)
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Vollständige IP-Zuordnung
- [Ports und Dienste](../_referenz/ports-und-dienste.md) -- Port-Forwards und Firewall-Regeln
- [NAS-Speicher](../nas-storage/) -- Synology NAS im Management-Netzwerk
