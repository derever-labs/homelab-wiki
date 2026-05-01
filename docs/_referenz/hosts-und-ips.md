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

| Netzwerk | Bereich | VLAN | Verwendung |
| :--- | :--- | :--- | :--- |
| Management | 10.0.0.0/22 | -- | UniFi-Geräte, Gateway, UDM Pro |
| Device | 10.0.10.0/24 | 10 | Endgeräte |
| Guest | 10.0.30.0/24 | 30 | Gästenetz |
| Rack | 10.0.100.0/24 | 100 | VMs, Proxmox, Services |
| IoT | 10.0.200.0/24 | 200 | Home Assistant, Zigbee |
| Docker Proxy | 192.168.90.0/24 | -- | Traefik Proxy Network |
| Thunderbolt | 10.99.1.0/24 | -- | Peer-to-Peer Replikation |

## UniFi Netzwerk

| Gerät | IP | Rolle |
| :--- | :--- | :--- |
| UDM Pro Lenzburg | 10.0.0.1 | Gateway + Controller |
| 10G-Switch-Rack | 10.0.0.172 | Aggregation Switch (10 GbE) |
| 1G-Switch-Kammerli | 10.0.0.181 | Zugangsswitch Kämmerli |
| POE-Switch-Keller | 10.0.0.184 | PoE Switch Keller |
| USW-Flex-Mini-Dani | 10.0.0.185 | Mini Switch Dani |
| USW-Flex-Mini-Gaeste | 10.0.0.186 | Mini Switch Gäste |
| AP-U6-PRO-Nina | 10.0.0.191 | Access Point Wi-Fi 6 |
| AP-AC-LR-Dani | 10.0.0.192 | Access Point Wi-Fi 5 |
| AP-AC-LR-Gaste | 10.0.0.193 | Access Point Wi-Fi 5 |
| AP-U6-PRO-Kuche | 10.0.0.194 | Access Point Wi-Fi 6 |
| AP-AC-LR-Koffer | 10.0.0.195 | Access Point Wi-Fi 5 |
| AP-AC-LR-Werkstadt | 10.0.0.196 | Access Point Wi-Fi 5 |
| AP-AC-LR-Garage | 10.0.0.197 | Access Point Wi-Fi 5 |

## Proxmox Cluster

| Node | IP | Rolle | CPU / RAM |
| :--- | :--- | :--- | :--- |
| pve00 | 10.0.2.40 | Quorum / VM Host | 4 CPU / 16 GB |
| pve01 | 10.0.2.41 | Main Compute Node | 16 CPU / 64 GB |
| pve02 | 10.0.2.42 | Main Compute Node | 16 CPU / 64 GB |

## Externe Plattformen

| Host | IP (LAN) | IP (Tailscale) | Standort | Rolle |
| :--- | :--- | :--- | :--- | :--- |
| pve-01-nana | 192.168.2.41 | 100.81.116.122 | Dottikon Nana | Externer Watchdog-Proxmox (Single-Node, kein Cluster-Mitglied) |

::: info Externer Watchdog
`pve-01-nana` steht physisch ausserhalb des Homelab-Standorts und ist via Tailscale als Subnet-Router für `192.168.2.0/23` ins Tailnet eingebunden. Wird vom Homelab-Ansible über die Inventory-Gruppe `proxmox_external` (bzw. `all_proxmox_hosts` für gemeinsame Plays) angesprochen.
:::

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
| vm-nomad-server-04 | 10.0.2.104 | 3004 | pve00 | 2 CPU, 2 GB RAM |
| vm-nomad-server-05 | 10.0.2.105 | 3005 | pve01 | 2 CPU, 2 GB RAM |
| vm-nomad-server-06 | 10.0.2.106 | 3006 | pve02 | 2 CPU, 2 GB RAM |

## Nomad Clients

| VM | IP | VM-ID | Host | Specs |
| :--- | :--- | :--- | :--- | :--- |
| vm-nomad-client-04 | 10.0.2.124 | 3104 | pve00 | 4 CPU, 14 GB RAM |
| vm-nomad-client-05 | 10.0.2.125 | 3105 | pve01 | 16 CPU, 74 GB RAM |
| vm-nomad-client-06 | 10.0.2.126 | 3106 | pve02 | 16 CPU, 74 GB RAM |

## IoT-VMs

| VM | IP | VM-ID | Host | Rolle |
| :--- | :--- | :--- | :--- | :--- |
| homeassistant | 10.0.0.100 | 1000 | pve02 | Home Assistant OS |
| ~~zigbee-node~~ | ~~10.0.0.110~~ | ~~1100~~ | ~~pve02~~ | ~~Dekomissioniert 2026-04-17. Dienste migriert nach Nomad.~~ |

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
