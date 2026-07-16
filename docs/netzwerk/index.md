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
classes: {
  site: {
    style.stroke-dash: 4
    style.border-radius: 8
  }
  node: {
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
  donas: NanaServer { class: node; tooltip: "Synology, 192.168.3.181" }
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
  class: node
  tooltip: "tag:homelab, 100.64.0.0/10 -- Subnet-Router je Standort verbinden die LANs"
}

internet -> lenzburg.lzgw: WAN
internet -> dottikon.dogw: WAN
internet -> luzern.lugw: WAN

lenzburg.lzsvc -> tailscale: Subnet-Router + Exit-Node {
  class: tslink
  tooltip: "vm-traefik-01/02, zusätzlich pve00"
}
dottikon.dopve -> tailscale: Subnet-Router 192.168.2.0/23 {
  class: tslink
}
luzern.lupve -> tailscale: Subnet-Router 172.16.0.0/24 {
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
classes: {
  seg: {
    style.stroke-dash: 4
    style.border-radius: 8
  }
  node: {
    style.border-radius: 8
  }
}

wan: ISP-Router {
  class: node
  tooltip: "PPPoE-Terminierung, statische öffentliche IP"
}

core: Core {
  class: seg
  udm: UDM Pro { class: node; tooltip: "Router + Controller, 10.0.0.1 -- Gateway aller VLANs" }
  agg: USL8A (10G-Aggregation) { class: node }
  udm -> agg: 10G
}

mgmt: "Management (native)\n10.0.0.0/22" {
  class: seg
  tooltip: "Proxmox-Hosts, Nomad-VMs, DNS-LXCs, Traefik-VMs, NAS, PBS, PDM, CheckMK, Home Assistant -- IPs siehe Hosts und IPs"
}
dev: "Device VLAN 10\n10.0.10.0/24" {
  class: seg
  tooltip: "Endgeräte"
}
guest: "Guest VLAN 30\n10.0.30.0/24" {
  class: seg
  tooltip: "Gäste-WLAN"
}
rack: "Rack VLAN 100\n10.0.100.0/24" {
  class: seg
  tooltip: "Rack-Infrastruktur"
}
iot: "IoT VLAN 200\n10.0.200.0/24" {
  class: seg
  tooltip: "Home Assistant, Zigbee, NAS"
}

tb: "Thunderbolt P2P\n10.99.1.0/24" {
  class: seg
  tooltip: "DRBD-Replikation + VM-Migration, läuft nicht über den Switch"
}
ts: "Tailscale Overlay\n100.64.0.0/10" {
  class: seg
  tooltip: "CGNAT-Overlay über die drei Standorte"
}

wan -> core.udm: SFP+ (eth9)
core.agg -> mgmt
core.agg -> dev
core.agg -> guest
core.agg -> rack
core.agg -> iot

mgmt <-> tb: pve01/pve02 direkt {
  style.stroke-dash: 3
  tooltip: "Zwei TB4-Kabel als Bond, am Switch vorbei"
}
mgmt <-> ts: Subnet-Router {
  style.stroke-dash: 3
  tooltip: "vm-traefik-01/02 (10.0.0.0/22, Exit-Node) und pve00 (VLAN-Subnetze) advertisieren ins Tailnet"
}
```

## Lenzburg -- Physische Topologie

Verkabelung von Gateway, Aggregation-Switch, Zugangs-Switches und Access Points am Hauptstandort. Modelle und Standorte: [Hardware-Inventar](../_referenz/hardware-inventar.md#unifi-netzwerk-hardware).

```d2
classes: {
  node: {
    style.border-radius: 8
  }
}

ISP: ISP-Router { class: node; tooltip: "WAN-Uplink" }
UDM: UDM Pro { class: node; tooltip: "Gateway + Controller" }
AGG: "10G-Switch-Rack (USL8A)" { class: node }
SW_KELLER: "POE-Switch-Keller (US-8-60W)" { class: node }
SW_KAMMERLI: "1G-Switch-Kämmerli (US-24)" { class: node }
SW_24_2: "US-24 (unnamed)" { class: node }
SW_150W: "US-8-150W (unnamed)" { class: node }
FLEX_DANI: Flex Mini Dani { class: node }
FLEX_GAESTE: Flex Mini Gäste { class: node }
AP_WERKSTADT: "AP-AC-LR Werkstadt" { class: node }
AP_DANI: "AP-AC-LR Dani" { class: node }
AP_GASTE: "AP-AC-LR Gäste" { class: node }
AP_KOFFER: "AP-AC-LR Koffer" { class: node }
AP_GARAGE: "AP-AC-LR Garage" { class: node }
AP_NINA: "AP-U6-Pro Nina" { class: node }
AP_KUCHE: "AP-U6-Pro Küche" { class: node }

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

Middleware-Chains und Zugangssteuerung: [Traefik](../edge/traefik/)

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
- [Traefik](../edge/traefik/) -- Reverse Proxy und Middleware Chains
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Vollständige IP-Zuordnung
