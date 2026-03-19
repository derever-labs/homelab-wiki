---
title: Proxmox Cluster
description: Übersicht der physikalischen Virtualisierungs-Hosts
tags:
  - infrastructure
  - proxmox
  - hosts
---

# Proxmox Cluster

## Übersicht
Das Cluster besteht aus drei Knoten, die für Hochverfügbarkeit und Lastverteilung konfiguriert sind.

| Node | IP (Management) | Rolle | Hardware (CPU/RAM) |
| :--- | :--- | :--- | :--- |
| **pve00** | 10.0.2.40 | Quorum / VM Host | 4 CPU / 16GB |
| **pve01** | 10.0.2.41 | Main Compute Node | 16 CPU / 64GB |
| **pve02** | 10.0.2.42 | Main Compute Node | 16 CPU / 64GB |

## Infrastructure VMs

| VM | IP | VM-ID | Host | Rolle |
| :--- | :--- | :--- | :--- | :--- |
| **vm-proxy-dns-01** | 10.0.2.1 | 4001 | pve01 | Primary DNS, Traefik, Keycloak, CrowdSec |
| **vm-vpn-dns-01** | 10.0.2.2 | 4002 | pve02 | Secondary DNS, ZeroTier VPN |
| **checkmk** | 10.0.2.150 | 2000 | pve01 | Monitoring System |
| **pbs-backup-server** | 10.0.2.50 | 99999 | pve02 | Proxmox Backup Server |
| **datacenter-manager** | 10.0.2.60 | 99998 | pve01 | Management Tools |

## HashiCorp Stack VMs

### Nomad Server (3x)

| VM | IP | VM-ID | Host | Specs |
| :--- | :--- | :--- | :--- | :--- |
| **vm-nomad-server-04** | 10.0.2.104 | 3004 | pve00 | 2 CPU, 4GB RAM |
| **vm-nomad-server-05** | 10.0.2.105 | 3005 | pve01 | 2 CPU, 4GB RAM |
| **vm-nomad-server-06** | 10.0.2.106 | 3006 | pve02 | 2 CPU, 4GB RAM |

### Nomad Clients (3x)

| VM | IP | VM-ID | Host | Specs |
| :--- | :--- | :--- | :--- | :--- |
| **vm-nomad-client-04** | 10.0.2.124 | 3104 | pve00 | 4 CPU, 12GB RAM |
| **vm-nomad-client-05** | 10.0.2.125 | 3105 | pve01 | 16 CPU, 48GB RAM |
| **vm-nomad-client-06** | 10.0.2.126 | 3106 | pve02 | 16 CPU, 48GB RAM |

## IoT VMs

| VM | IP | VM-ID | Host | Rolle |
| :--- | :--- | :--- | :--- | :--- |
| **homeassistant** | 10.0.0.100 | 1000 | pve02 | Home Assistant OS |
| **zigbee-node** | 10.0.0.110 | 1100 | pve02 | Zigbee2MQTT, Mosquitto |

## Netzwerk

Alle Nodes sind über ein dediziertes Management-VLAN (10.0.2.x) erreichbar.

### Thunderbolt Netzwerk (pve01 <-> pve02)

Zwei Thunderbolt 4 Kabel verbinden pve01 und pve02 für High-Speed VM-Migration und DRBD-Replikation. Ein Linux Bond (`bond-tb`, active-backup) aggregiert beide TB-Interfaces und löst damit das Problem der nicht-deterministischen Interface-Benennung nach Reboots. Die Bridge `vmbr-tb` nutzt den Bond als einzigen Port.

| Host | vmbr-tb | Bandbreite |
|------|---------|------------|
| pve01 | 10.99.1.1 | ~20 Gbps |
| pve02 | 10.99.1.2 | ~20 Gbps |

Detaillierte Dokumentation: Siehe `homelab-hashicorp-stack/docs/THUNDERBOLT_NETWORKING.md` im Repo

### HA Konfiguration

- **shutdown_policy:** `migrate` — VMs werden bei geplanten Host-Shutdowns automatisch migriert
- **Migration Network:** `10.99.1.0/24` (Thunderbolt Bridge)

## Storage
- **Local ZFS:** Schneller Speicher für OS und Caches auf jedem Node.
- **NFS (Synology):** Geteilter Speicher für Backups und ISOs.
- **PBS:** Proxmox Backup Server (vm-id 99999) auf pve02 für inkrementelle Backups.
- **Linstor/DRBD:** Replizierter Block-Storage über Thunderbolt für CSI-Volumes (Nomad).

## Management
Die Web-UI ist unter `https://<node-ip>:8006` erreichbar. SSH-Zugang erfolgt als `root` auf den jeweiligen Management-IPs.

## Verwandte Seiten

- [Server-Hardware](./hardware.md) -- Physische Hardware-Details der Nodes
- [Proxmox Datacenter Manager](./proxmox-datacenter-manager.md) -- Zentrale Cluster-Verwaltung
- [Netzwerk-Topologie](../architecture/network-topology.md) -- VLANs, Subnets, Thunderbolt
- [NAS-Speicher](./storage-nas.md) -- NFS-Exports und Mount-Pfade
- [HashiCorp Stack](../platforms/hashicorp-stack.md) -- Nomad, Consul, Vault auf den VMs
- [Proxmox Backup Server](../services/core/pbs.md) -- Inkrementelle VM-Backups
