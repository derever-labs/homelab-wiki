---
title: Netzwerk
description: Netzwerk-Topologie, Segmente, DNS, Tailscale und Hardware im Homelab
tags:
  - netzwerk
  - vlan
  - dns
  - unifi
  - tailscale
---

# Netzwerk

Das Homelab erstreckt sich über drei Standorte -- **Lenzburg** (Hauptstandort), **Dottikon** und **Luzern** --, verbunden über ein Tailscale-Overlay. Die [Gesamtübersicht](#gesamtubersicht) zeigt sie im Zusammenhang; Details je Standort führt die [Standorte](./standorte.md)-Seite. Der übrige Teil dieser Seite dokumentiert den **Hauptstandort Lenzburg** im Detail (VLAN-Segmente, physische Topologie, Hardware), geroutet über einen UniFi Dream Machine Pro mit SFP+-WAN-Uplink via ISP-Router. Controller-Spezifika (Firewall, WLAN, Zugang) führt [UniFi](../unifi/).

## Gesamtübersicht

Drei Standorte mit je eigenem UniFi-Gateway und Internet-Uplink, zu einem logischen Netz verbunden über das Tailscale-Overlay (`tag:homelab`). Standort-Tabelle und Beschreibung je Standort: [Standorte](./standorte.md).

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

## Lenzburg -- Logische Topologie

Das VLAN-Setup des Hauptstandorts: fünf Segmente hinter dem UDM Pro, plus das Thunderbolt-Peer-Netz und das Tailscale-Overlay.

```d2
direction: down

WAN: WAN / Internet {
  style.stroke-dash: 4
  ISP: ISP Router { style.border-radius: 8 }
}

Core: Core Network {
  style.stroke-dash: 4
  UDMPRO: UDM Pro (Router) { style.border-radius: 8 }
  USL8A: USL8A (10G Aggregation) { style.border-radius: 8 }
  UDMPRO -> USL8A
}

MGMT: "Management (native) 10.0.0.0/22" {
  style.stroke-dash: 4
  PVE00: pve00 { tooltip: "10.0.2.40"; style.border-radius: 8 }
  PVE01: pve01 { tooltip: "10.0.2.41"; style.border-radius: 8 }
  PVE02: pve02 { tooltip: "10.0.2.42"; style.border-radius: 8 }
  DNS01: lxc-dns-01 { tooltip: "10.0.2.1"; style.border-radius: 8 }
  DNS02: lxc-dns-02 { tooltip: "10.0.2.2"; style.border-radius: 8 }
  TRF01: vm-traefik-01 { tooltip: "10.0.2.21"; style.border-radius: 8 }
  TRF02: vm-traefik-02 { tooltip: "10.0.2.22"; style.border-radius: 8 }
  NS04: vm-nomad-server-04 { tooltip: "10.0.2.104"; style.border-radius: 8 }
  NS05: vm-nomad-server-05 { tooltip: "10.0.2.105"; style.border-radius: 8 }
  NS06: vm-nomad-server-06 { tooltip: "10.0.2.106"; style.border-radius: 8 }
  NC04: vm-nomad-client-04 { tooltip: "10.0.2.124"; style.border-radius: 8 }
  NC05: vm-nomad-client-05 { tooltip: "10.0.2.125"; style.border-radius: 8 }
  NC06: vm-nomad-client-06 { tooltip: "10.0.2.126"; style.border-radius: 8 }
  PBS: pbs-backup-server { tooltip: "10.0.2.50"; style.border-radius: 8 }
  CMK: checkmk { tooltip: "10.0.2.150"; style.border-radius: 8 }
  DCM: datacenter-manager { tooltip: "10.0.2.60"; style.border-radius: 8 }
  NAS: Synology NAS { tooltip: "10.0.0.200"; style.border-radius: 8 }
  HA: Home Assistant { tooltip: "10.0.0.100"; style.border-radius: 8 }
}

DEV: Device Network VLAN 10 {
  style.stroke-dash: 4
  DEVGW: Gateway { tooltip: "10.0.10.1"; style.border-radius: 8 }
}

GUEST: Guest Network VLAN 30 {
  style.stroke-dash: 4
  GUESTGW: Gateway { tooltip: "10.0.30.1"; style.border-radius: 8 }
}

RACK: Rack Network VLAN 100 {
  style.stroke-dash: 4
  RACKGW: Gateway { tooltip: "10.0.100.1"; style.border-radius: 8 }
}

IOT: IoT Network VLAN 200 {
  style.stroke-dash: 4
  IOTGW: Gateway { tooltip: "10.0.200.1"; style.border-radius: 8 }
  ZIG: Zigbee Node { style.border-radius: 8 }
}

TB: Thunderbolt P2P 10.99.1.0/24 {
  style.stroke-dash: 4
  TB01: pve01-tb { tooltip: "10.99.1.1"; style.border-radius: 8 }
  TB02: pve02-tb { tooltip: "10.99.1.2"; style.border-radius: 8 }
}

TS: Tailscale Overlay 100.64.0.0/10 {
  style.stroke-dash: 4
  TAIL: Tailscale CGNAT { style.border-radius: 8 }
}

WAN.ISP -> Core.UDMPRO: SFP+ (eth9)
Core.USL8A -> MGMT
Core.USL8A -> DEV
Core.USL8A -> GUEST
Core.USL8A -> RACK
Core.USL8A -> IOT
TB.TB01 <-> TB.TB02: DRBD + Migration
TS.TAIL -> Core.UDMPRO: VPN Overlay { style.stroke-dash: 5 }
```

## Lenzburg -- Physische Topologie

Verkabelung von Gateway, Aggregation-Switch, Zugangs-Switches und Access Points am Hauptstandort. Modelle und Standorte: [Hardware-Inventar](../_referenz/hardware-inventar.md#unifi-netzwerk-hardware).

```d2
direction: down

ISP: ISP-Router { tooltip: "WAN-Uplink"; style.border-radius: 8 }
UDM: UDM Pro { tooltip: "Gateway + Controller"; style.border-radius: 8 }
AGG: "10G-Switch-Rack (USL8A)" { style.border-radius: 8 }
SW_KELLER: "POE-Switch-Keller (US-8-60W)" { style.border-radius: 8 }
SW_KAMMERLI: "1G-Switch-Kämmerli (US-24)" { style.border-radius: 8 }
SW_24_2: "US-24 (unnamed)" { style.border-radius: 8 }
SW_150W: "US-8-150W (unnamed)" { style.border-radius: 8 }
FLEX_DANI: Flex Mini Dani { style.border-radius: 8 }
FLEX_GAESTE: Flex Mini Gäste { style.border-radius: 8 }
AP_WERKSTADT: "AP-AC-LR Werkstadt" { style.border-radius: 8 }
AP_DANI: "AP-AC-LR Dani" { style.border-radius: 8 }
AP_GASTE: "AP-AC-LR Gäste" { style.border-radius: 8 }
AP_KOFFER: "AP-AC-LR Koffer" { style.border-radius: 8 }
AP_GARAGE: "AP-AC-LR Garage" { style.border-radius: 8 }
AP_NINA: "AP-U6-Pro Nina" { style.border-radius: 8 }
AP_KUCHE: "AP-U6-Pro Küche" { style.border-radius: 8 }

ISP -> UDM: "SFP+ (eth9)"
UDM -> AGG: 10G
AGG -> SW_KELLER
AGG -> SW_KAMMERLI
AGG -> SW_24_2
AGG -> SW_150W
SW_KAMMERLI -> FLEX_DANI
SW_KAMMERLI -> FLEX_GAESTE
SW_KELLER -> AP_WERKSTADT
SW_KELLER -> AP_GARAGE
SW_KAMMERLI -> AP_DANI
SW_KAMMERLI -> AP_GASTE
SW_KAMMERLI -> AP_KOFFER
SW_150W -> AP_NINA
SW_150W -> AP_KUCHE
```

## Netzwerk-Segmente

VLAN-Segmente am Hauptstandort Lenzburg. Die Aussenstellen Dottikon (`192.168.2.0/23`) und Luzern (`172.16.0.0/24`) sind flache Standort-LANs ohne eigene VLAN-Segmentierung -- siehe [Standorte](./standorte.md). Die Proxmox- und Service-VMs (`10.0.2.x`) liegen statisch im **nativen Management-Netz** `10.0.0.0/22`, nicht im Rack-VLAN 100.

| Segment | Subnetz | VLAN | Verwendung | Gateway |
|---------|---------|------|------------|---------|
| **Management** | 10.0.0.0/22 | native | UniFi-Geräte, VMs, Proxmox, Services | 10.0.0.1 |
| **Device Network** | 10.0.10.0/24 | 10 | Endgeräte | 10.0.10.1 |
| **Guest Network** | 10.0.30.0/24 | 30 | Gäste-WLAN | 10.0.30.1 |
| **Rack Network** | 10.0.100.0/24 | 100 | Rack-Infrastruktur | 10.0.100.1 |
| **IoT Network** | 10.0.200.0/24 | 200 | Home Assistant, Zigbee, NAS | 10.0.200.1 |
| **Docker Proxy** | 192.168.90.0/24 | - | Traefik Proxy Network (intern) | - |
| **Thunderbolt** | 10.99.1.0/24 | - | Peer-to-Peer DRBD-Replikation, VM-Migration | - |
| **Tailscale** | 100.64.0.0/10 | - | Remote Access (CGNAT Overlay) | - |

## DNS

Zwei redundante DNS-Knoten (Pi-hole + Unbound + Consul DNS) bedienen das Netz; der Reverse Proxy ist über eine Keepalived-VIP hochverfügbar. IPs und Hosts: [Hosts und IPs](../_referenz/hosts-und-ips.md). Vollständige DNS-Architektur: [DNS](../dns/)

## Thunderbolt-Netzwerk

Zwei Thunderbolt 4 Kabel verbinden pve01 und pve02 direkt für High-Speed Datenverkehr. Ein Linux Bond (`bond-tb`, active-backup) aggregiert beide Interfaces.

| Funktion | Details |
|----------|---------|
| Bandbreite | bis ~15 Gbps (real, single-stream -- [Benchmarks](./referenz.md#benchmark-ergebnisse)) |
| Bonding Mode | active-backup |
| Bridge | vmbr-tb |
| Zweck | DRBD-Replikation, VM-Migration |

Details zur Konfiguration und IP-Zuordnung: [Proxmox](../proxmox/)

## Tailscale

Das Tailscale-Overlay (CGNAT-Bereich `100.64.0.0/10`) verbindet die drei Standorte und dient dem Remote-Zugang. Tag-Schema, ACL-basierte Cluster-Trennung (HSLU/Homelab) und das Diagramm führt [Tailscale](./tailscale.md).


## Externe Erreichbarkeit

Alle externen Services sind über `*.ackermannprivat.ch` erreichbar. Traefik (Keepalived HA, VIP: [Hosts und IPs](../_referenz/hosts-und-ips.md)) terminiert TLS mit Cloudflare-Zertifikaten.

Middleware-Chains und Zugangssteuerung: [Traefik](../traefik/)

## Hardware-Inventar

Das physische Inventar (Aggregation-Switch USL8A, PoE- und Flex-Mini-Switches, AC-LR- und U6-Pro-Access-Points) ist in der physischen Topologie oben verortet. Modelle, Portzahlen, PoE-Budgets und Standorte sind kanonisch im [Hardware-Inventar](../_referenz/hardware-inventar.md#unifi-netzwerk-hardware) geführt; IP-Adressen aller Geräte in [Hosts und IPs](../_referenz/hosts-und-ips.md#unifi-netzwerk).

### Router und WAN

| Attribut | Wert |
|----------|------|
| Modell | UniFi Dream Machine Pro (UDMPRO) |
| WAN | SFP+ (eth9) via ISP-Router, öffentliche IP statisch |
| RJ45-WAN (eth8) | Nicht angeschlossen |
| LAN-Ports | 8x RJ45 1G, 1x RJ45 WAN (nicht verbunden), 1x SFP+ WAN (aktiv), 1x SFP+ LAN |
| Controller | Integriert (UniFi Network), Spezifika: [UniFi](../unifi/) |

Der UDM Pro ist nicht direkt am Glasfaser-Endpunkt angeschlossen, sondern per SFP+ an einen vorgelagerten ISP-Router, der die PPPoE-Session terminiert. Die öffentliche IP ist statisch. Port-Forwards (Traefik, NAS, Jellyfin) sind in der [UniFi Referenz -- Port-Forwards](../unifi/referenz.md#port-forwards) dokumentiert. WAN-Bandbreite und ISP-Provider sind nicht im Wiki geführt -- aktuelle Messwerte liefert das [Grafana-Dashboard](../monitoring/index.md) via `iperf3-to-influxdb` (Nomad Batch Job in `monitoring/iperf3-to-influxdb.nomad`).

### Verkabelung

| Strecke | Kabeltyp | Länge | Bemerkung |
|---------|----------|-------|-----------|
| pve01 -- pve02 | 2x Thunderbolt 4 | unbekannt | DRBD + Migration |
| Server -- Switch | unbekannt | unbekannt | - |

## Verwandte Seiten

- [Standorte](./standorte.md) -- standortübergreifende Netz-Architektur (Lenzburg, Dottikon, Luzern)
- [UniFi](../unifi/) -- Controller, WLAN, Firewall-Konfiguration
- [Proxmox](../proxmox/) -- Cluster-Knoten und VM-Übersicht
- [DNS](../dns/) -- Pi-hole, Unbound, Consul DNS
- [Traefik](../traefik/) -- Reverse Proxy und Middleware Chains
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Vollständige IP-Zuordnung
