---
title: Hardware
description: Physische Server und NAS im Homelab
tags:
  - infrastructure
  - hardware
  - server
---

# Hardware

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
  container: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
}

direction: down

rack: Lenzburg Rack {
  class: container

  pve00: pve00 {
    class: node
    tooltip: "Minisforum DeskMini N100\nBIOS: DNB20 V0.07 (2024-07-31)\nRAM: 16 GB DDR4-3200\nStorage: 512 GB NVMe HighRel"
  }

  pve01: pve01 {
    class: node
    tooltip: "Minisforum MS-01 (Venus Series)\nBIOS: 1.26 (2024-10-14)\nRAM: 96 GB DDR5-4800\nStorage: 2x 4 TB Kingston Fury Renegade"
  }

  pve02: pve02 {
    class: node
    tooltip: "Minisforum MS-01 (Venus Series)\nBIOS: 1.26 (2024-10-14)\nRAM: 96 GB DDR5-4800\nStorage: 2x 4 TB Kingston Fury Renegade"
  }

  pve01 <-> pve02: 2x Thunderbolt 4 Bond

  aggregation: UniFi USL8A {
    class: node
  }

  pve00 -> aggregation
  pve01 -> aggregation
  pve02 -> aggregation
}

udmpro: UDM Pro {
  class: node
}

internet: Internet {
  class: node
}

rack.aggregation -> udmpro
udmpro -> internet
```

## Server-Übersicht

Detaillierte VM-Zuordnung und IP-Adressen: [Proxmox Cluster](../proxmox/index.md)

| Server | Rolle | IP | CPU (Kerne) | RAM | Storage | Modell |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **pve00** | Quorum / VM Host | 10.0.2.40 | 4 | 16 GB DDR4-3200 | 512 GB NVMe | Minisforum DeskMini |
| **pve01** | Main Compute Node | 10.0.2.41 | 14 (6P+8E, 20 Threads) | 96 GB DDR5-4800 | 2× 4 TB NVMe | Minisforum MS-01 |
| **pve02** | Main Compute Node | 10.0.2.42 | 14 (6P+8E, 20 Threads) | 96 GB DDR5-4800 | 2× 4 TB NVMe | Minisforum MS-01 |

### pve00 -- Quorum Node

Kleinster Node im Cluster. Dient primär als Quorum-Geber für die Proxmox-Cluster-Mitgliedschaft und hostet den leichtesten Nomad Server/Client.

| Eigenschaft | Wert |
| :--- | :--- |
| Hersteller/Modell | Micro Computer (HK) -- DeskMini Series (Board DNBOE) |
| Seriennummer | YY047LU10PCCMPE00322 |
| CPU | Intel N100, 4 Kerne / 4 Threads, 1 Socket |
| RAM | 1× 16 GB DDR4-3200 (Part: DDR4 NB 16GB 3200MHZ) |
| Lokaler Storage | 512 GB NVMe -- HighRel 512GB SSD (FW: SN14665) |
| NICs | Intel I226-V 2.5G, Intel CNVi Wi-Fi |
| VMs | vm-nomad-server-04, vm-nomad-client-04 |

#### Firmware-Stand pve00

Stand: 2026-04-17

- BIOS: DNB20 V0.07 -- 2024-07-31
- NVMe HighRel 512GB: SN14665
- Proxmox: pve-manager/9.1.7
- Kernel: 6.17.13-2-pve

### pve01 -- Main Compute Node

Einer der beiden leistungsstarken Nodes. Mit pve02 über Thunderbolt verbunden.

| Eigenschaft | Wert |
| :--- | :--- |
| Hersteller/Modell | Micro Computer (HK) -- Venus Series / MS-01 (Board AHWSA) |
| Seriennummer | MD126US129QQMQG00027 |
| CPU | Intel i9-12900H, 14 Kerne (20 Threads), 1 Socket |
| RAM | 2× 48 GB DDR5-5600 @4800 (Micron CT48G56C46S5.M16B1) |
| Lokaler Storage | 2× 4 TB NVMe -- Kingston FURY Renegade SFYRDK4000G (FW: EIFK31.7) |
| NICs | 2× Intel X710 10G SFP+, Intel I226-V 2.5G, Intel I226-LM 2.5G, MediaTek MT7922 Wi-Fi 6E |
| Thunderbolt IP | 10.99.1.1 |
| VMs | vm-proxy-dns-01, checkmk, datacenter-manager, vm-nomad-server-05, vm-nomad-client-05 |

#### Firmware-Stand pve01

Stand: 2026-04-17

- BIOS: 1.26 -- 2024-10-14
- NVMe Kingston FURY Renegade (nvme0n1): EIFK31.7
- NVMe Kingston FURY Renegade (nvme1n1): EIFK31.7
- Proxmox: pve-manager/9.1.7
- Kernel: 6.17.13-2-pve

### pve02 -- Main Compute Node

Zweiter leistungsstarker Node. Mit pve01 über Thunderbolt verbunden.

| Eigenschaft | Wert |
| :--- | :--- |
| Hersteller/Modell | Micro Computer (HK) -- Venus Series / MS-01 (Board AHWSA) |
| Seriennummer | MF146VS129EDMHA00010 |
| CPU | Intel i9-12900H, 14 Kerne (20 Threads), 1 Socket |
| RAM | 2× 48 GB DDR5-5600 @4800 (Micron CT48G56C46S5.M16B1) |
| Lokaler Storage | 2× 4 TB NVMe -- Kingston FURY Renegade SFYRDK4000G (FW: EIFK31.7) |
| NICs | 2× Intel X710 10G SFP+, Intel I226-V 2.5G, Intel I226-LM 2.5G, MediaTek MT7922 Wi-Fi 6E |
| Thunderbolt IP | 10.99.1.2 |
| VMs | vm-vpn-dns-01, pbs-backup-server, homeassistant, vm-nomad-server-06, vm-nomad-client-06 |

#### Firmware-Stand pve02

Stand: 2026-04-17

- BIOS: 1.26 -- 2024-10-14
- NVMe Kingston FURY Renegade (nvme0n1): EIFK31.7
- NVMe Kingston FURY Renegade (nvme1n1): EIFK31.7
- Proxmox: pve-manager/9.1.7
- Kernel: 6.17.13-2-pve

## NAS

| Eigenschaft | Wert |
| :--- | :--- |
| Typ | Synology (Modell unbekannt) |
| Funktion | NFS-Exports, MinIO S3, Backup-Ziel |
| Festplatten | unbekannt (Anzahl, Grösse, RAID-Level) |

NFS-Exports und Mount-Pfade: [NAS-Speicher](../nas-storage/index.md)

## UniFi Netzwerk-Hardware

| Gerät | Modell | Typ | Ports | Standort |
| :--- | :--- | :--- | :--- | :--- |
| UDM Pro | UDM Pro | Gateway + Controller | 1x SFP+ WAN, 8x RJ45 LAN | Rack |
| Aggregation Switch | USL8A | 10G Switch | 8x SFP+ | Rack |
| Rack Switch | US-24 | 1G Switch | 24x RJ45 | Kämmerli |
| Switch (unbekannt) | US-24 | 1G Switch | 24x RJ45 | unbekannt |
| PoE Switch Keller | US-8-60W | PoE Switch | 8x RJ45, 60W PoE | Keller |
| PoE Switch (unbekannt) | US-8-150W | PoE Switch | 8x RJ45, 150W PoE | unbekannt |
| Mini Switch Dani | USW Flex Mini | Mini Switch | 5x RJ45 | Dani |
| Mini Switch Gäste | USW Flex Mini | Mini Switch | 5x RJ45 | Gäste |
| AP Nina | UAP-U6-Pro | Access Point | Wi-Fi 6, 2.4+5 GHz | -- |
| AP Küche | UAP-U6-Pro | Access Point | Wi-Fi 6, 2.4+5 GHz | -- |
| AP Dani | UAP-AC-LR | Access Point | Wi-Fi 5, 2.4+5 GHz | -- |
| AP Gäste | UAP-AC-LR | Access Point | Wi-Fi 5, 2.4+5 GHz | -- |
| AP Koffer | UAP-AC-LR | Access Point | Wi-Fi 5, 2.4+5 GHz | -- |
| AP Werkstatt | UAP-AC-LR | Access Point | Wi-Fi 5, 2.4+5 GHz | -- |
| AP Garage | UAP-AC-LR | Access Point | Wi-Fi 5, 2.4+5 GHz | -- |

IP-Adressen aller UniFi-Geräte: [Hosts und IPs](./hosts-und-ips.md#unifi-netzwerk)

## Peripherie

| Gerät | Funktion | Standort |
| :--- | :--- | :--- |
| 2x Thunderbolt 4 Kabel | DRBD-Replikation, VM-Migration | pve01 <-> pve02 |
| USV | unbekannt | unbekannt |

## Verwandte Seiten

- [Proxmox Cluster](../proxmox/index.md) -- VM-Zuordnung und IPs der Hosts
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Exports, MinIO, Wartung
- [Netzwerk-Hardware](../netzwerk/index.md) -- Switches, Access Points, Verkabelung
- [Netzwerk-Topologie](../netzwerk/index.md) -- Thunderbolt-Netzwerk
