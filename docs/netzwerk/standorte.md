---
title: Standorte
description: Standortübergreifende Netzwerk-Architektur -- drei Standorte (Lenzburg, Dottikon, Luzern), via Tailscale zu einem logischen Netz verbunden
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

Diese Seite gibt die **Netz- und Konnektivitäts-Sicht** über alle Standorte. Die VLAN-Tiefe des
Hauptstandorts führt [Netzwerk](./index.md); die vollständige IP-Zuordnung
[Hosts und IPs](../_referenz/hosts-und-ips.md).

## Standort-Übersicht

| Standort | Netz | Gateway | Schlüssel-Devices |
| :--- | :--- | :--- | :--- |
| **Lenzburg** (Hauptstandort) | 10.0.0.0/22 | UDM Pro | Proxmox-Cluster (3 Nodes), Synology NAS, Home Assistant, Traefik + Pi-hole |
| **Dottikon** (Nana) | 192.168.2.0/23 | UDM Cloud-Gateway-Ultra | pve-01-nana (Watchdog), NanaServer (NAS), Home Assistant |
| **Luzern** | 172.16.0.0/24 | UniFi-Gateway | pve-lu-01 (Standalone), Home Assistant |

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: down

classes: {
  site: {
    style.stroke-dash: 4
    style.border-radius: 8
  }
  node: {
    style.border-radius: 8
  }
  overlay: {
    style.stroke-dash: 4
    style.border-radius: 8
  }
  tslink: {
    style.stroke-dash: 3
  }
}

internet: Internet / WAN {
  class: node
  tooltip: "Drei getrennte Standort-Uplinks"
}

lenzburg: Standort Lenzburg {
  class: site
  tooltip: "Hauptstandort, 10.0.0.0/22"
  lzgw: UDM Pro { class: node; tooltip: "Gateway + Controller, 10.0.0.1" }
  lzpve: Proxmox-Cluster { class: node; tooltip: "pve00/01/02, Thunderbolt-DRBD" }
  lznas: Synology NAS { class: node; tooltip: "10.0.0.200, NFS + S3 + Backup-Ziel" }
  lzha: Home Assistant { class: node; tooltip: "10.0.0.100, VM auf pve02" }
  lzsvc: Traefik + Pi-hole { class: node; tooltip: "Traefik-VIP 10.0.2.20, DNS lxc-dns-01/02" }

  lzgw -> lzpve
  lzgw -> lznas
  lzgw -> lzha
  lzgw -> lzsvc
}

dottikon: Standort Dottikon {
  class: site
  tooltip: "Aussenstelle Nana, 192.168.2.0/23"
  dogw: UDM Ultra { class: node; tooltip: "Gateway, 192.168.2.1" }
  dopve: pve-01-nana { class: node; tooltip: "192.168.2.41, externer Watchdog" }
  donas: NanaServer { class: node; tooltip: "Synology, 192.168.2.200" }
  doha: Home Assistant { class: node; tooltip: "homeassistant-dottikon, VM auf pve-01-nana" }

  dogw -> dopve
  dogw -> donas
  dogw -> doha
}

luzern: Standort Luzern {
  class: site
  tooltip: "Aussenstelle, 172.16.0.0/24"
  lugw: UniFi-Gateway { class: node; tooltip: "172.16.0.1" }
  lupve: pve-lu-01 { class: node; tooltip: "172.16.0.200, Standalone-Node" }
  luha: Home Assistant { class: node; tooltip: "homeassistant-luzern, VM auf pve-lu-01" }

  lugw -> lupve
  lugw -> luha
}

tailscale: Tailscale Overlay {
  class: overlay
  tooltip: "tag:homelab, 100.64.0.0/10"
  tsmesh: Mesh-VPN { class: node; tooltip: "Subnet-Router je Standort verbinden die LANs" }
}

internet -> lenzburg.lzgw: WAN
internet -> dottikon.dogw: WAN
internet -> luzern.lugw: WAN

lenzburg.lzsvc -> tailscale.tsmesh: Subnet-Router + Exit-Node {
  class: tslink
  tooltip: "vm-traefik-01/02, zusätzlich pve00"
}
dottikon.dopve -> tailscale.tsmesh: Subnet-Router 192.168.2.0/23 {
  class: tslink
}
luzern.lupve -> tailscale.tsmesh: Subnet-Router 172.16.0.0/24 {
  class: tslink
  tooltip: "Route redundant auch via apple-tv"
}
```

::: info Zwei Sichten auf die Standorte
Diese Map zeigt die **Netz- und Konnektivitäts-Sicht** (Gateways, Subnetze, Tailscale, Schlüssel-Devices).
Die **Proxmox-Verwaltungs- und Backup-Sicht** derselben Standorte (PDM verwaltet, PBS sichert) führt die
[Proxmox Standort-Topologie](../proxmox/index.md#standort-topologie).
:::

## Standorte im Detail

### Lenzburg -- Hauptstandort

Der Proxmox-Cluster (pve00/01/02), das zentrale Synology NAS, der HA-Reverse-Proxy (Traefik mit
Keepalived-VIP) und die redundanten Pi-hole-DNS-Knoten stehen hier. Die VLAN-Segmentierung (Management,
Device, Guest, Rack, IoT) und die physische Verkabelung sind in der [Netzwerk-Übersicht](./index.md)
dokumentiert. Tailscale-Anbindung über `vm-traefik-01/02` (Subnet-Router für `10.0.0.0/22` und
Exit-Nodes); zusätzlich advertisiert `pve00` die VLAN-Subnetze.

### Dottikon -- Aussenstelle Nana

Single-Node `pve-01-nana` als externer Watchdog für das Homelab, dazu ein NanaServer (Synology) und
eine eigene Home-Assistant-Instanz. Eingebunden via Tailscale-Subnet-Router für `192.168.2.0/23`.

### Luzern -- Aussenstelle

Standalone-Node `pve-lu-01` (kein Cluster-Mitglied) hinter einem eigenen UniFi-Gateway, hostet eine
eigene Home-Assistant-Instanz. Eingebunden via Tailscale-Subnet-Router für `172.16.0.0/24` -- dieselbe
Route wird redundant vom `apple-tv` advertisiert (siehe [Tailscale -- Self-Subnet-Lockout](./tailscale.md#externe-proxmox-nodes)).

## Verwandte Seiten

- [Netzwerk](./index.md) -- VLAN-Topologie, physische Verkabelung und Hardware (Hauptstandort)
- [Tailscale](./tailscale.md) -- Tailnet, Tag-Schema und ACL-basierte Cluster-Trennung
- [Proxmox](../proxmox/index.md) -- Cluster, Standalone-Nodes und Standort-Topologie (Verwaltungs-Sicht)
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- vollständige IP-Zuordnung aller Standorte
