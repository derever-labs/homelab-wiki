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

## Übersicht

Das Homelab ist in mehrere Netzwerk-Segmente aufgeteilt, die über einen UniFi-Router verbunden sind.

::: warning Unvollständig
Folgende Details fehlen noch:
- ISP- und WAN-Anbindung (Provider, Bandbreite, öffentliche IP)
- Router-Modell und Firmware-Version
- Firewall-Regeln zwischen VLANs
- Inter-VLAN Routing-Konfiguration
- Tailscale Exit-Node Konfiguration
:::

## Netzwerk-Diagramm

```mermaid
flowchart TB
    subgraph WAN["WAN / Internet"]
        ISP:::ext["ISP Router"]
    end

    subgraph Core["Core Network"]
        Router:::accent["UniFi Router"]
        SW:::accent["UniFi Switch"]
    end

    subgraph MGMT["Management VLAN 10.0.2.0/24"]
        PVE00:::svc["pve00 - 10.0.2.40"]
        PVE01:::svc["pve01 - 10.0.2.41"]
        PVE02:::svc["pve02 - 10.0.2.42"]
        PROXY:::entry["vm-proxy-dns-01 - 10.0.2.1"]
        VPN:::svc["vm-vpn-dns-01 - 10.0.2.2"]
        NS04:::svc["vm-nomad-server-04 - 10.0.2.104"]
        NS05:::svc["vm-nomad-server-05 - 10.0.2.105"]
        NS06:::svc["vm-nomad-server-06 - 10.0.2.106"]
        NC04:::svc["vm-nomad-client-04 - 10.0.2.124"]
        NC05:::svc["vm-nomad-client-05 - 10.0.2.125"]
        NC06:::svc["vm-nomad-client-06 - 10.0.2.126"]
        PBS:::svc["pbs-backup-server - 10.0.2.50"]
        CMK:::svc["checkmk - 10.0.2.150"]
        DCM:::svc["datacenter-manager - 10.0.2.60"]
    end

    subgraph IOT["IoT VLAN 10.0.0.0/24"]
        NAS:::db["Synology NAS - 10.0.0.200"]
        HA:::svc["Home Assistant - 10.0.0.100"]
        ZIG:::svc["Zigbee Node - 10.0.0.110"]
    end

    subgraph TB["Thunderbolt P2P 10.99.1.0/24"]
        TB01:::accent["pve01-tb - 10.99.1.1"]
        TB02:::accent["pve02-tb - 10.99.1.2"]
    end

    subgraph TS["Tailscale Overlay 100.64.0.0/10"]
        TAIL:::ext["Tailscale CGNAT"]
    end

    ISP --> Router
    Router --> SW
    SW --> MGMT
    SW --> IOT
    TB01 <-->|"~20 Gbps DRBD + Migration"| TB02
    TAIL -.->|"VPN Overlay"| Router

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Netzwerk-Segmente

| Segment | Subnetz | VLAN | Verwendung | Gateway |
|---------|---------|------|------------|---------|
| **Management** | 10.0.2.0/24 | - | VMs, Proxmox, Services | unbekannt |
| **IoT** | 10.0.0.0/24 | - | Home Assistant, Zigbee, NAS | unbekannt |
| **Docker Proxy** | 192.168.90.0/24 | - | Traefik Proxy Network (intern) | - |
| **Thunderbolt** | 10.99.1.0/24 | - | Peer-to-Peer DRBD-Replikation, VM-Migration | - |
| **Tailscale** | 100.64.0.0/10 | - | Remote Access (CGNAT Overlay) | - |

## DNS

| Rolle | IP | Host | Beschreibung |
|-------|-----|------|-------------|
| Primärer DNS | 10.0.2.1 | vm-proxy-dns-01 | Pi-hole v6 + Unbound + Consul DNS |
| Sekundärer DNS | 10.0.2.2 | vm-vpn-dns-01 | Pi-hole (Fallback) |

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

::: warning Unvollständig
- Exit-Node Konfiguration
- Welche Nodes sind Tailscale-Mitglieder
- Subnet-Router Konfiguration
- ACL-Regeln
:::

## Externe Erreichbarkeit

Alle externen Services sind über `*.ackermannprivat.ch` erreichbar. Traefik auf vm-proxy-dns-01 (10.0.2.1) terminiert TLS mit Cloudflare-Zertifikaten.

Middleware-Chains und Zugangssteuerung: [Traefik](../traefik/)

## Hardware

::: warning Unvollständig
Die meisten Hardware-Details müssen noch ergänzt werden (Modelle, Ports, Firmware-Versionen, PoE-Budget, Patchfeld-Belegung).
:::

### Router

| Eigenschaft | Wert |
|-------------|------|
| Modell | unbekannt |
| Firmware | unbekannt |
| WAN | unbekannt |
| LAN-Ports | unbekannt |

### Switches

| Switch | Modell | Ports | PoE | Standort |
|--------|--------|-------|-----|----------|
| unbekannt | unbekannt | unbekannt | unbekannt | unbekannt |

### Access Points

| AP | Modell | Standort | Band | PoE |
|----|--------|----------|------|-----|
| unbekannt | unbekannt | unbekannt | unbekannt | unbekannt |

### UniFi Controller

| Eigenschaft | Wert |
|-------------|------|
| Typ | unbekannt (Cloud Key / VM / Docker) |
| Version | unbekannt |
| URL | unbekannt |

### VLAN-Konfiguration

| VLAN ID | Name | Subnetz | Beschreibung | Switch-Ports |
|---------|------|---------|--------------|-------------|
| - | Management | 10.0.2.0/24 | VMs, Proxmox, Services | unbekannt |
| - | IoT | 10.0.0.0/24 | Home Assistant, Zigbee, NAS | unbekannt |

### Verkabelung

| Strecke | Kabeltyp | Länge | Bemerkung |
|---------|----------|-------|-----------|
| pve01 -- pve02 | 2x Thunderbolt 4 | unbekannt | DRBD + Migration |
| Server -- Switch | unbekannt | unbekannt | - |

## Verwandte Seiten

- [Proxmox](../proxmox/) -- Cluster-Knoten und VM-Übersicht
- [DNS](../dns/) -- Pi-hole, Unbound, Consul DNS
- [Traefik](../traefik/) -- Reverse Proxy und Middleware Chains
- [Hosts und IPs](../_referenz/hosts-und-ips.md) -- Vollständige IP-Zuordnung
