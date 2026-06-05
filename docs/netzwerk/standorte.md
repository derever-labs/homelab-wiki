---
title: Standorte
description: Die drei Homelab-Standorte (Lenzburg, Dottikon, Luzern) im Detail -- Netze, Geräte und Tailscale-Anbindung
tags:
  - netzwerk
  - standorte
  - tailscale
  - topologie
---

# Standorte

Das Homelab erstreckt sich über **drei physische Standorte**, die durch das Tailscale-Overlay
(`tag:homelab`) zu einem logischen Netz verbunden sind: **Lenzburg** ist der Hauptstandort mit dem
Proxmox-Cluster und dem zentralen Storage, **Dottikon** und **Luzern** sind Aussenstellen mit je
einer Standalone-Proxmox-Node. Jeder Standort hat ein eigenes UniFi-Gateway und einen eigenen
Internet-Uplink; die LANs erreichen einander ausschliesslich über Tailscale-Subnet-Router.

Die **Gesamtmap** über alle Standorte sowie die VLAN-Tiefe des Hauptstandorts führt die
[Netzwerk-Übersicht](./); diese Seite beschreibt die Standorte im Detail. Vollständige IP-Zuordnung:
[Hosts und IPs](../_referenz/hosts-und-ips.md).

## Standort-Übersicht

| Standort | Netz | Gateway | Schlüssel-Devices |
| :--- | :--- | :--- | :--- |
| **Lenzburg** (Hauptstandort) | 10.0.0.0/22 | UDM Pro | Proxmox-Cluster (3 Nodes), Synology NAS, Home Assistant, Traefik + Pi-hole |
| **Dottikon** (Nana) | 192.168.2.0/23 | UDM Cloud-Gateway-Ultra | pve-01-nana (Watchdog), NanaServer (NAS), Home Assistant |
| **Luzern** | 172.16.0.0/24 | UniFi-Gateway | pve-lu-01 (Standalone), Home Assistant |

::: tip Gesamtmap
Die visuelle Standort-Architektur (Gateways, Subnetze, Tailscale-Overlay, Schlüssel-Devices als
Diagramm) steht in der [Netzwerk-Übersicht -- Gesamtübersicht](./#gesamtubersicht).
:::

## Standorte im Detail

### Lenzburg -- Hauptstandort

Der Proxmox-Cluster (pve00/01/02), das zentrale Synology NAS, der HA-Reverse-Proxy (Traefik mit
Keepalived-VIP) und die redundanten Pi-hole-DNS-Knoten stehen hier. Die VLAN-Segmentierung (Management,
Device, Guest, Rack, IoT) und die physische Verkabelung sind in der [Netzwerk-Übersicht](./)
dokumentiert. Tailscale-Anbindung über `vm-traefik-01/02` (Subnet-Router für `10.0.0.0/22` und
Exit-Nodes); zusätzlich advertisiert `pve00` die VLAN-Subnetze.

### Dottikon -- Aussenstelle Nana

Single-Node `pve-01-nana` als externer Watchdog für das Homelab, dazu ein NanaServer (Synology) und
eine eigene Home-Assistant-Instanz. Flaches Standort-LAN `192.168.2.0/23` hinter einem UDM
Cloud-Gateway-Ultra. Eingebunden via Tailscale-Subnet-Router für `192.168.2.0/23`.

### Luzern -- Aussenstelle

Standalone-Node `pve-lu-01` (kein Cluster-Mitglied) hinter einem eigenen UniFi-Gateway, hostet eine
eigene Home-Assistant-Instanz. Flaches Standort-LAN `172.16.0.0/24`. Eingebunden via
Tailscale-Subnet-Router für `172.16.0.0/24` -- dieselbe Route wird redundant vom `apple-tv`
advertisiert (siehe [Tailscale -- Self-Subnet-Lockout](./tailscale.md#externe-proxmox-nodes)).

## Verwandte Seiten

- [Netzwerk](./index.md) -- Gesamtmap, VLAN-Topologie und Hardware (Hauptstandort)
- [Tailscale](./tailscale.md) -- Tailnet, Tag-Schema und ACL-basierte Cluster-Trennung
- [Proxmox](../proxmox/index.md) -- Cluster, Standalone-Nodes und Standort-Topologie (Verwaltungs-Sicht)
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- vollständige IP-Zuordnung aller Standorte
