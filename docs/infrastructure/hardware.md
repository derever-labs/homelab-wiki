---
title: Hardware
description: Physische Server und NAS im Homelab
tags:
  - infrastructure
  - hardware
  - server
---

# Hardware

::: warning Unvollständig
Diese Seite ist ein Platzhalter. Folgende Details müssen noch ergänzt werden:
- Server-Marke und Modell (pve00, pve01, pve02)
- CPU-Typ (Intel/AMD, Modell, Taktfrequenz)
- RAM-Module (Hersteller, Typ, Taktfrequenz, Slots)
- PSU (Wattage, Modell, Effizienzklasse)
- Gehäuse (Modell, Formfaktor)
- Garantie und Kaufdatum
- NAS-Modell (Synology Modellbezeichnung)
- NAS-Festplatten (Anzahl, Grösse, Typ, RAID-Level)
- Stromverbrauch (gemessen, Leerlauf vs. Last)
:::

## Server-Übersicht

Detaillierte VM-Zuordnung und IP-Adressen: [Proxmox Cluster](./proxmox-cluster.md)

| Server | Rolle | IP | CPU (Kerne) | RAM | Storage | Modell |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **pve00** | Quorum / VM Host | 10.0.2.40 | 4 | 16 GB | unbekannt | unbekannt |
| **pve01** | Main Compute Node | 10.0.2.41 | 16 | 64 GB | unbekannt | unbekannt |
| **pve02** | Main Compute Node | 10.0.2.42 | 16 | 64 GB | unbekannt | unbekannt |

### pve00 -- Quorum Node

Kleinster Node im Cluster. Dient primär als Quorum-Geber für die Proxmox-Cluster-Mitgliedschaft und hostet den leichtesten Nomad Server/Client.

| Eigenschaft | Wert |
| :--- | :--- |
| CPU | 4 Kerne (Details unbekannt) |
| RAM | 16 GB |
| Lokaler Storage | unbekannt |
| VMs | vm-nomad-server-04, vm-nomad-client-04 |

### pve01 -- Main Compute Node

Einer der beiden leistungsstarken Nodes. Mit pve02 über Thunderbolt verbunden.

| Eigenschaft | Wert |
| :--- | :--- |
| CPU | 16 Kerne (Details unbekannt) |
| RAM | 64 GB |
| Lokaler Storage | unbekannt |
| Thunderbolt IP | 10.99.1.1 |
| VMs | vm-proxy-dns-01, checkmk, datacenter-manager, vm-nomad-server-05, vm-nomad-client-05 |

### pve02 -- Main Compute Node

Zweiter leistungsstarker Node. Mit pve01 über Thunderbolt verbunden.

| Eigenschaft | Wert |
| :--- | :--- |
| CPU | 16 Kerne (Details unbekannt) |
| RAM | 64 GB |
| Lokaler Storage | unbekannt |
| Thunderbolt IP | 10.99.1.2 |
| VMs | vm-vpn-dns-01, pbs-backup-server, homeassistant, zigbee-node, vm-nomad-server-06, vm-nomad-client-06 |

## NAS

| Eigenschaft | Wert |
| :--- | :--- |
| Typ | Synology (Modell unbekannt) |
| Funktion | NFS-Exports, MinIO S3, Backup-Ziel |
| Festplatten | unbekannt (Anzahl, Grösse, RAID-Level) |

NFS-Exports und Mount-Pfade: [NAS-Speicher](./storage-nas.md)

## Peripherie

| Gerät | Funktion | Standort |
| :--- | :--- | :--- |
| 2x Thunderbolt 4 Kabel | DRBD-Replikation, VM-Migration | pve01 <-> pve02 |
| USV | unbekannt | unbekannt |

## Verwandte Seiten

- [Proxmox Cluster](./proxmox-cluster.md) -- VM-Zuordnung und IPs der Hosts
- [NAS-Speicher](./storage-nas.md) -- NFS-Exports, MinIO, Wartung
- [Netzwerk-Hardware](./network-hardware.md) -- Switches, Access Points, Verkabelung
- [Netzwerk-Topologie](../architecture/network-topology.md) -- Thunderbolt-Netzwerk
