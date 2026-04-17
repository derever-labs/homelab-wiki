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

| Attribut | Wert |
|----------|------|
| Deployment | UDM Pro (integriert) + UniFi Switches + APs |
| IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |

## Übersicht

Das Homelab ist in mehrere Netzwerk-Segmente (VLANs) aufgeteilt, die über einen UniFi Dream Machine Pro geroutet werden. Der WAN-Uplink läuft über SFP+ (eth9) via ISP-Router, die öffentliche IP ist dynamisch.


## Netzwerk-Diagramm

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
  NAS: Synology NAS { tooltip: "10.0.0.200"; style.border-radius: 8 }
  HA: Home Assistant { style.border-radius: 8 }
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
TB.TB01 <-> TB.TB02: ~20 Gbps DRBD + Migration
TS.TAIL -> Core.UDMPRO: VPN Overlay { style.stroke-dash: 5 }
```

## VLAN-Diagramm

```d2
direction: right

UDMPRO: UDM Pro { tooltip: "10.0.0.1"; style.border-radius: 8 }
MGMT: "Management (native) 10.0.0.0/22" { style.border-radius: 8 }
DEV: "Device Network VLAN 10 10.0.10.0/24" { style.border-radius: 8 }
GUEST: "Guest Network VLAN 30 10.0.30.0/24" { style.border-radius: 8 }
RACK: "Rack Network VLAN 100 10.0.100.0/24" { style.border-radius: 8 }
IOT: "IoT Network VLAN 200 10.0.200.0/24" { style.border-radius: 8 }

UDMPRO -- MGMT
UDMPRO -- DEV
UDMPRO -- GUEST
UDMPRO -- RACK
UDMPRO -- IOT
```

## Netzwerk-Segmente

| Segment | Subnetz | VLAN | Verwendung | Gateway |
|---------|---------|------|------------|---------|
| **Management** | 10.0.0.0/22 | native | VMs, Proxmox, Services | 10.0.0.1 |
| **Device Network** | 10.0.10.0/24 | 10 | Endgeräte | 10.0.10.1 |
| **Guest Network** | 10.0.30.0/24 | 30 | Gäste-WLAN | 10.0.30.1 |
| **Rack Network** | 10.0.100.0/24 | 100 | Rack-Infrastruktur | 10.0.100.1 |
| **IoT Network** | 10.0.200.0/24 | 200 | Home Assistant, Zigbee, NAS | 10.0.200.1 |
| **Docker Proxy** | 192.168.90.0/24 | - | Traefik Proxy Network (intern) | - |
| **Thunderbolt** | 10.99.1.0/24 | - | Peer-to-Peer DRBD-Replikation, VM-Migration | - |
| **Tailscale** | 100.64.0.0/10 | - | Remote Access (CGNAT Overlay) | - |

## DNS

| Rolle | IP | Host | Beschreibung |
|-------|-----|------|-------------|
| Primärer DNS | 10.0.2.1 | lxc-dns-01 | Pi-hole v6 + Unbound + Consul DNS |
| Sekundärer DNS | 10.0.2.2 | lxc-dns-02 | Pi-hole v6 + Unbound + Consul DNS |
| Traefik VIP | 10.0.2.20 | Keepalived | Reverse Proxy HA (vm-traefik-01/02) |

Vollständige DNS-Architektur: [DNS](../dns/)

## Thunderbolt-Netzwerk

Zwei Thunderbolt 4 Kabel verbinden pve01 und pve02 direkt für High-Speed Datenverkehr. Ein Linux Bond (`bond-tb`, active-backup) aggregiert beide Interfaces.

| Funktion | Details |
|----------|---------|
| Bandbreite | ~20 Gbps |
| Bonding Mode | active-backup |
| Bridge | vmbr-tb |
| Zweck | DRBD-Replikation, VM-Migration |

Details zur Konfiguration und IP-Zuordnung: [Proxmox](../proxmox/)

## Tailscale

Tailscale wird für den Remote-Zugang verwendet. Geräte erhalten IPs aus dem CGNAT-Bereich 100.64.0.0/10.


## Externe Erreichbarkeit

Alle externen Services sind über `*.ackermannprivat.ch` erreichbar. Traefik (Keepalived HA, VIP: [Hosts und IPs](../_referenz/hosts-und-ips.md)) terminiert TLS mit Cloudflare-Zertifikaten.

Middleware-Chains und Zugangssteuerung: [Traefik](../traefik/)

## Hardware

### Router

| Eigenschaft | Wert |
|-------------|------|
| Modell | UniFi Dream Machine Pro (UDMPRO) |
| WAN | SFP+ (eth9) via ISP-Router, öffentliche IP dynamisch |
| LAN-Ports | 8x RJ45 1G, 1x RJ45 WAN (nicht verbunden), 1x SFP+ WAN (aktiv), 1x SFP+ LAN |
| Controller | Integriert (UniFi Network) |
| URL | `https://10.0.0.1` |

### Switches

| Switch | Modell | Ports | PoE | Standort |
|--------|--------|-------|-----|----------|
| 10G-Switch-Rack | USL8A (Aggregation) | 8x SFP+ | - | Rack |
| POE-Switch-Keller | US-8-60W | 8 | 60W | Keller |
| 1G-Switch-Kammerli | US-24 | 24 | - | Kämmerli |
| US-24 | US-24 | 24 | - | unbekannt |
| US-8-150W | US-8-150W | 8 | 150W | unbekannt |
| USW-Flex-Mini-Dani | USW Flex Mini | 5 | - | Zimmer Dani |
| USW-Flex-Mini-Gaeste | USW Flex Mini | 5 | - | Gästezimmer |

### Access Points

| AP | Modell | Standort | Band | PoE |
|----|--------|----------|------|-----|
| AP-AC-LR-Werkstadt | UAP-AC-LR | Werkstatt | 2.4+5 GHz | ja |
| AP-AC-LR-Dani | UAP-AC-LR | Zimmer Dani | 2.4+5 GHz | ja |
| AP-AC-LR-Gaste | UAP-AC-LR | Gästezimmer | 2.4+5 GHz | ja |
| AP-AC-LR-Koffer | UAP-AC-LR | Kofferraum(?) | 2.4+5 GHz | ja |
| AP-AC-LR-Garage | UAP-AC-LR | Garage | 2.4+5 GHz | ja |
| AP-U6-PRO-Nina | UAP-U6-Pro | Zimmer Nina | 2.4+5 GHz | ja |
| AP-U6-PRO-Kuche | UAP-U6-Pro | Küche | 2.4+5 GHz | ja |

### VLAN-Konfiguration

| VLAN ID | Name | Subnetz | Gateway | Beschreibung |
|---------|------|---------|---------|--------------|
| native | Management | 10.0.0.0/22 | 10.0.0.1 | VMs, Proxmox, Services |
| 10 | Device Network | 10.0.10.0/24 | 10.0.10.1 | Endgeräte |
| 30 | Guest Network | 10.0.30.0/24 | 10.0.30.1 | Gäste-WLAN |
| 100 | Rack Network | 10.0.100.0/24 | 10.0.100.1 | Rack-Infrastruktur |
| 200 | IoT Network | 10.0.200.0/24 | 10.0.200.1 | Home Assistant, Zigbee, NAS |

### Verkabelung

| Strecke | Kabeltyp | Länge | Bemerkung |
|---------|----------|-------|-----------|
| pve01 -- pve02 | 2x Thunderbolt 4 | unbekannt | DRBD + Migration |
| Server -- Switch | unbekannt | unbekannt | - |

## Verwandte Seiten

- [UniFi](../unifi/) -- Controller, Geräte, WLAN, Firewall-Konfiguration
- [Proxmox](../proxmox/) -- Cluster-Knoten und VM-Übersicht
- [DNS](../dns/) -- Pi-hole, Unbound, Consul DNS
- [Traefik](../traefik/) -- Reverse Proxy und Middleware Chains
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Vollständige IP-Zuordnung
