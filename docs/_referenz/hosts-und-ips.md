---
title: Hosts und IPs
description: Kanonische IP-Adresstabelle aller Systeme im Homelab
tags:
  - referenz
  - netzwerk
  - hosts
---

# Hosts und IPs

::: info Single Source of Truth
Diese Seite ist die kanonische Quelle für alle IP-Adressen im Homelab. Andere Seiten verlinken hierher, anstatt IP-Adressen zu duplizieren.
:::

## Netzwerk-Bereiche

| Netzwerk | Bereich | Verwendung |
| :--- | :--- | :--- |
| Management | 10.0.2.0/24 | VMs, Proxmox, Services |
| IoT | 10.0.0.0/24 | Home Assistant, Zigbee |
| Docker Proxy | 192.168.90.0/24 | Traefik Proxy Network |
| Thunderbolt | 10.99.1.0/24 | Peer-to-Peer Replikation |

## Proxmox Cluster

| Node | IP | Rolle | CPU / RAM |
| :--- | :--- | :--- | :--- |
| pve00 | 10.0.2.40 | Quorum / VM Host | 4 CPU / 16 GB |
| pve01 | 10.0.2.41 | Main Compute Node | 16 CPU / 64 GB |
| pve02 | 10.0.2.42 | Main Compute Node | 16 CPU / 64 GB |

## Infrastruktur

| Ressource | IP | VM-ID | Host | Rolle |
| :--- | :--- | :--- | :--- | :--- |
| lxc-dns-01 | 10.0.2.1 | 4021 | pve01 | Pi-hole v6 + Unbound (Primary DNS) |
| lxc-dns-02 | 10.0.2.2 | 4022 | pve02 | Pi-hole v6 + Unbound (Secondary DNS) |
| vm-traefik-01 | 10.0.2.21 | 4011 | pve01 | Traefik HA (MASTER) + CrowdSec |
| vm-traefik-02 | 10.0.2.22 | 4012 | pve02 | Traefik HA (BACKUP) + CrowdSec |
| Traefik VIP | 10.0.2.20 | -- | Keepalived | VRRP Virtual IP |
| checkmk | 10.0.2.150 | 2000 | pve01 | Monitoring System |
| pbs-backup-server | 10.0.2.50 | 99999 | pve02 | Proxmox Backup Server |
| datacenter-manager | 10.0.2.60 | 99998 | pve01 | Management Tools |

### Stillgelegte VMs (Parallelbetrieb)

| VM | IP | VM-ID | Host | Status |
| :--- | :--- | :--- | :--- | :--- |
| vm-proxy-dns-01 | 10.0.2.3 | 4001 | pve01 | IP verschoben, wird stillgelegt |
| vm-vpn-dns-01 | 10.0.2.4 | 4002 | pve02 | IP verschoben, wird stillgelegt |

## Nomad Server

| VM | IP | VM-ID | Host | Specs |
| :--- | :--- | :--- | :--- | :--- |
| vm-nomad-server-04 | 10.0.2.104 | 3004 | pve00 | 2 CPU, 4 GB RAM |
| vm-nomad-server-05 | 10.0.2.105 | 3005 | pve01 | 2 CPU, 4 GB RAM |
| vm-nomad-server-06 | 10.0.2.106 | 3006 | pve02 | 2 CPU, 4 GB RAM |

## Nomad Clients

| VM | IP | VM-ID | Host | Specs |
| :--- | :--- | :--- | :--- | :--- |
| vm-nomad-client-04 | 10.0.2.124 | 3104 | pve00 | 4 CPU, 12 GB RAM |
| vm-nomad-client-05 | 10.0.2.125 | 3105 | pve01 | 16 CPU, 74 GB RAM |
| vm-nomad-client-06 | 10.0.2.126 | 3106 | pve02 | 16 CPU, 74 GB RAM |

## IoT-VMs

| VM | IP | VM-ID | Host | Rolle |
| :--- | :--- | :--- | :--- | :--- |
| homeassistant | 10.0.0.100 | 1000 | pve02 | Home Assistant OS |
| zigbee-node | 10.0.0.110 | 1100 | pve02 | Zigbee2MQTT, Mosquitto |

## NAS

| Gerät | IP | Funktion |
| :--- | :--- | :--- |
| Synology NAS | 10.0.0.200 | NFS-Exports, MinIO S3, Backup-Ziel |

## Thunderbolt-Netzwerk

Zwei Thunderbolt 4 Kabel verbinden pve01 und pve02 für High-Speed VM-Migration und DRBD-Replikation.

| Host | vmbr-tb IP | Bandbreite |
| :--- | :--- | :--- |
| pve01 | 10.99.1.1 | ~20 Gbps |
| pve02 | 10.99.1.2 | ~20 Gbps |

## Verwandte Seiten

- [Proxmox](../proxmox/) -- Virtualisierungsplattform und Cluster-Konfiguration
- [Netzwerk](../netzwerk/) -- VLANs, DNS, Routing
- [Hardware](./hardware-inventar.md) -- Physische Server-Details
