---
title: Proxmox
description: Proxmox VE Cluster mit drei Knoten, VM-Übersicht, HA-Konfiguration und Datacenter Manager
tags:
  - proxmox
  - virtualisierung
  - cluster
  - ha
---

# Proxmox

## Übersicht

Drei-Knoten-Proxmox-Cluster (lenzburg) als Virtualisierungsplattform für alle Homelab-VMs und LXCs.

| Attribut | Wert |
|----------|------|
| Deployment | Bare-metal (3 Knoten: pve00, pve01, pve02) |
| HA-Modus | Migrate bei Shutdown |
| Migration-Netzwerk | 10.99.1.0/24 (Thunderbolt) |
| IPs | [Hosts und IPs](../../_referenz/hosts-und-ips.md) |

## Cluster-Knoten und VMs

Der Cluster besteht aus drei Knoten (pve00 als Quorum/VM-Host, pve01 und pve02 als Compute-Nodes). Alle Nodes sind über das Management-Netzwerk (10.0.2.0/24) erreichbar; SSH-Zugang erfolgt als `root` auf den jeweiligen Management-IPs.

Vollständige Knoten-, VM- und LXC-Liste mit IPs, VM-IDs und Host-Zuordnung: [Hosts und IPs](../../_referenz/hosts-und-ips.md#proxmox-cluster). Physische Hardware-Specs (CPU, RAM, Storage): [Hardware-Inventar](../../_referenz/hardware-inventar.md).

## Externe / Standalone-Nodes

Neben dem Lenzburg-Cluster gibt es zwei eigenständige Proxmox-Nodes an anderen Standorten. Sie sind **kein Cluster-Mitglied** (kein Quorum, kein HA, kein DRBD), nutzen lokale ZFS-Disks und sind via Tailscale ins Homelab eingebunden. Verwaltet werden sie zentral über den [Datacenter Manager](./referenz.md#datacenter-manager-pdm), gesichert über den gemeinsamen PBS.

| Node | Standort | Netz | Rolle |
| :--- | :--- | :--- | :--- |
| pve-01-nana | Dottikon | 192.168.2.0/23 | Externer Watchdog (Subnet-Router 192.168.2.0/23), hostet homeassistant-dottikon |
| pve-lu-01 | Luzern | 172.16.0.0/24 | Standalone-Node (Subnet-Router 172.16.0.0/24), hostet homeassistant-luzern |

IPs, DNS und Details: [Hosts und IPs -- Externe Plattformen](../../_referenz/hosts-und-ips.md#externe-plattformen). Hardware: [Hardware-Inventar -- Externe Nodes](../../_referenz/hardware-inventar.md#externe-nodes). Betrieb (Wartung, Migration): [Betrieb -- Externe Standalone-Nodes](./betrieb.md#externe-standalone-nodes).

### Standort-Topologie

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

lenzburg: Standort Lenzburg {
  class: container
  tooltip: "Hauptstandort, 10.0.0.0/22"

  cluster: PVE-Cluster lenzburg {
    class: container
    pve00: pve00 { class: node; tooltip: "10.0.2.40 | Quorum" }
    pve01: pve01 { class: node; tooltip: "10.0.2.41 | Compute" }
    pve02: pve02 { class: node; tooltip: "10.0.2.42 | Compute" }
    pve01 <-> pve02: Thunderbolt / DRBD {
      style.stroke: "#6b7280"
      tooltip: "10.99.1.0/24, Linstor-Replikation"
    }
  }

  pbs: PBS { class: node; tooltip: "10.0.2.50 | VM 99999 auf pve02" }
  pdm: PDM { class: node; tooltip: "10.0.2.60 | VM 99998 auf pve01" }
}

dottikon: Standort Dottikon {
  class: container
  tooltip: "192.168.2.0/23"
  nana: pve-01-nana { class: node; tooltip: "192.168.2.41 | TS 100.81.116.122" }
}

luzern: Standort Luzern {
  class: container
  tooltip: "172.16.0.0/24"
  pvelu: pve-lu-01 { class: node; tooltip: "172.16.0.200 | TS 100.112.213.18" }
}

lenzburg.pdm -> lenzburg.cluster: verwaltet {
  style.stroke: "#7c3aed"
}
lenzburg.pdm -> lenzburg.pbs: verwaltet {
  style.stroke: "#7c3aed"
}
lenzburg.pdm -> dottikon.nana: verwaltet (Tailscale) {
  style.stroke: "#7c3aed"
  style.stroke-dash: 3
}
lenzburg.pdm -> luzern.pvelu: verwaltet (Tailscale) {
  style.stroke: "#7c3aed"
  style.stroke-dash: 3
}

lenzburg.cluster -> lenzburg.pbs: Backup {
  style.stroke: "#2563eb"
}
dottikon.nana -> lenzburg.pbs: Backup (Tailscale) {
  style.stroke: "#2563eb"
  style.stroke-dash: 3
}
luzern.pvelu -> lenzburg.pbs: Backup (Tailscale) {
  style.stroke: "#2563eb"
  style.stroke-dash: 3
}
```

::: info Zwei Sichten auf die Standorte
Diese Map zeigt die **Verwaltungs- und Backup-Sicht** (PDM verwaltet, PBS sichert). Die **Netz- und
Tailscale-Sicht** derselben Standorte (Gateways, Subnetze, Schlüssel-Devices als Gesamtmap) führt die
[Netzwerk-Übersicht](../../netz/netzwerk/#gesamtubersicht); Standort-Details die [Standorte](../../netz/netzwerk/standorte.md)-Seite.
:::

## Thunderbolt Netzwerk

Zwei Thunderbolt 4 Kabel verbinden pve01 und pve02 für High-Speed VM-Migration und DRBD-Replikation. Ein Linux Bond (`bond-tb`, active-backup) aggregiert beide TB-Interfaces und löst damit das Problem der nicht-deterministischen Interface-Benennung nach Reboots. Die Bridge `vmbr-tb` nutzt den Bond als einzigen Port. Bandbreite ca. 20 Gbps; IPs im Subnetz 10.99.1.0/24 siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md#thunderbolt-netzwerk).

## HA Konfiguration

- **shutdown_policy:** `migrate` -- VMs werden bei geplanten Host-Shutdowns automatisch migriert
- **Migration Network:** 10.99.1.0/24 (Thunderbolt Bridge)

## Storage

| Typ | Beschreibung |
|-----|--------------|
| Local ZFS | Schneller Speicher für OS und Caches auf jedem Node |
| NFS (Synology) | Geteilter Speicher für Backups und ISOs |
| PBS | Proxmox Backup Server (VM-ID 99999) auf pve02 für inkrementelle Backups |
| Linstor/DRBD | Replizierter Block-Storage über Thunderbolt für CSI-Volumes (Nomad) |

## Referenz-Details

Die referenz-artigen Detail-Parameter und Tabellen sind in der [Proxmox Referenz](./referenz.md) ausgelagert:

- [iGPU Passthrough](./referenz.md#igpu-passthrough) -- PCI-Zuordnung, VFIO-Blacklist und VAAPI/QSV-Treiber
- [VM Disk-Konfiguration](./referenz.md#vm-disk-konfiguration) -- virtio-blk-Flags (aio, cache, discard, iothread)
- [ZFS Performance Tuning](./referenz.md#zfs-performance-tuning) -- ARC-Grösse und ZFS-Modulparameter
- [Authentifizierung (SSO)](./referenz.md#authentifizierung-sso) -- Authentik-OIDC-Felder und Web-Zugang
- [Datacenter Manager (PDM)](./referenz.md#datacenter-manager-pdm) -- Remotes, API-Token und Konfigurationsdateien

Die Umstellung einer VM-Disk von scsi auf virtio-blk als Betriebsprozedur: [Betrieb -- VM-Disk auf virtio-blk umstellen](./betrieb.md#vm-disk-auf-virtio-blk-umstellen).

## Verwandte Seiten

- [Referenz](./referenz.md) -- iGPU-Passthrough, VM-Disk-/ZFS-Tuning, SSO/OIDC-Felder und PDM-Konfiguration
- [Betrieb](./betrieb.md) -- HA-Prüfungen, Wartung, bekannte Probleme
- [Netzwerk](../../netz/netzwerk/) -- VLANs, Subnets, Hardware
- [Backup](../../storage/backup/) -- Backup-Strategie und PBS
- [Hardware-Inventar](../../_referenz/hardware-inventar.md) -- Physische Hardware-Details
- [Linstor Storage](../../storage/linstor/) -- DRBD-replizierter Block-Storage
- [Nomad](../../plattform/nomad/) -- Container-Orchestrierung auf den VMs
- [Consul](../../plattform/consul/) -- Service Discovery und KV Store
- [Vault](../../plattform/vault/) -- Secrets Management
