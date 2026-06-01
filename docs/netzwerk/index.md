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

Das Homelab ist in mehrere Netzwerk-Segmente (VLANs) aufgeteilt, die über einen UniFi Dream Machine Pro geroutet werden. Der WAN-Uplink läuft über SFP+ (eth9) via ISP-Router, die öffentliche IP ist dynamisch. Diese Seite ist die kanonische Quelle für Topologie, Segmente und das Hardware-Inventar; Controller-Spezifika (Firewall, WLAN, Zugang) führt [UniFi](../unifi/).

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | UDM Pro (integriert) + UniFi Switches + APs |


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
TB.TB01 <-> TB.TB02: ~20 Gbps DRBD + Migration
TS.TAIL -> Core.UDMPRO: VPN Overlay { style.stroke-dash: 5 }
```

## Physische Topologie

Verkabelung von Gateway, Aggregation-Switch, Zugangs-Switches und Access Points. Modelle und Standorte: [Hardware-Inventar](../_referenz/hardware-inventar.md#unifi-netzwerk-hardware).

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

Zwei redundante DNS-Knoten (Pi-hole + Unbound + Consul DNS) bedienen das Netz; der Reverse Proxy ist über eine Keepalived-VIP hochverfügbar. IPs und Hosts: [Hosts und IPs](../_referenz/hosts-und-ips.md). Vollständige DNS-Architektur: [DNS](../dns/)

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

Tailscale wird für den Remote-Zugang verwendet. Geräte erhalten IPs aus dem CGNAT-Bereich 100.64.0.0/10. Seit Mai 2026 ist das Tailnet durch eine ACL-Policy in zwei Cluster getrennt -- HSLU/DCLab und Homelab sehen einander nicht, `tag:admin` sieht beide. Details, Tag-Schema und Diagramm: [Tailscale](./tailscale.md).


## Externe Erreichbarkeit

Alle externen Services sind über `*.ackermannprivat.ch` erreichbar. Traefik (Keepalived HA, VIP: [Hosts und IPs](../_referenz/hosts-und-ips.md)) terminiert TLS mit Cloudflare-Zertifikaten.

Middleware-Chains und Zugangssteuerung: [Traefik](../traefik/)

## Hardware-Inventar

Das physische Inventar (Aggregation-Switch USL8A, PoE- und Flex-Mini-Switches, AC-LR- und U6-Pro-Access-Points) ist in der physischen Topologie oben verortet. Modelle, Portzahlen, PoE-Budgets und Standorte sind kanonisch im [Hardware-Inventar](../_referenz/hardware-inventar.md#unifi-netzwerk-hardware) geführt; IP-Adressen aller Geräte in [Hosts und IPs](../_referenz/hosts-und-ips.md#unifi-netzwerk).

### Router und WAN

| Attribut | Wert |
|----------|------|
| Modell | UniFi Dream Machine Pro (UDMPRO) |
| WAN | SFP+ (eth9) via ISP-Router, öffentliche IP dynamisch |
| LAN-Ports | 8x RJ45 1G, 1x RJ45 WAN (nicht verbunden), 1x SFP+ WAN (aktiv), 1x SFP+ LAN |
| Controller | Integriert (UniFi Network), Spezifika: [UniFi](../unifi/) |

### Verkabelung

| Strecke | Kabeltyp | Länge | Bemerkung |
|---------|----------|-------|-----------|
| pve01 -- pve02 | 2x Thunderbolt 4 | unbekannt | DRBD + Migration |
| Server -- Switch | unbekannt | unbekannt | - |

## Verwandte Seiten

- [UniFi](../unifi/) -- Controller, WLAN, Firewall-Konfiguration
- [Proxmox](../proxmox/) -- Cluster-Knoten und VM-Übersicht
- [DNS](../dns/) -- Pi-hole, Unbound, Consul DNS
- [Traefik](../traefik/) -- Reverse Proxy und Middleware Chains
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Vollständige IP-Zuordnung
