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
| IPs | [Hosts und IPs](../_referenz/hosts-und-ips.md) |

## Cluster-Knoten und VMs

Der Cluster besteht aus drei Knoten (pve00 als Quorum/VM-Host, pve01 und pve02 als Compute-Nodes). Alle Nodes sind über das Management-Netzwerk (10.0.2.0/24) erreichbar; SSH-Zugang erfolgt als `root` auf den jeweiligen Management-IPs.

Vollständige Knoten-, VM- und LXC-Liste mit IPs, VM-IDs und Host-Zuordnung: [Hosts und IPs](../_referenz/hosts-und-ips.md#proxmox-cluster). Physische Hardware-Specs (CPU, RAM, Storage): [Hardware-Inventar](../_referenz/hardware-inventar.md).

## iGPU Passthrough

Die Intel Iris Xe iGPU (Alder Lake, 96 EU) auf pve01 und pve02 wird per **Full Passthrough** an die Nomad-Client VMs durchgereicht. Hauptanwendung: [Jellyfin](../jellyfin/index.md) Hardware-Transcoding (QSV).

| Host | iGPU | PCI-Adresse | Ziel-VM | Machine Type |
|------|------|-------------|---------|--------------|
| pve01 | Intel Iris Xe (i9-12900H) | `0000:00:02.0` | vm-nomad-client-05 (3105) | q35 |
| pve02 | Intel Iris Xe (i9-12900H) | `0000:00:02.0` | vm-nomad-client-06 (3106) | q35 |

### Konfiguration auf den Hosts

Die iGPU-Treiber (`i915`, `xe`) sind auf den Hosts blacklisted, damit VFIO-PCI die Geräte übernimmt. IOMMU ist via GRUB aktiviert (`intel_iommu=on iommu=pt`). Die Konfiguration liegt in:

- `/etc/default/grub` -- IOMMU-Parameter
- `/etc/modules` -- VFIO-Module (`vfio`, `vfio_iommu_type1`, `vfio_pci`)
- `/etc/modprobe.d/blacklist-igpu.conf` -- i915/xe Blacklist

::: warning Kein SR-IOV
Full Passthrough bindet die gesamte iGPU exklusiv an eine VM. Sollte ein zweiter GPU-Consumer nötig werden (z.B. Frigate), muss auf SR-IOV (`i915-sriov-dkms`) umgestellt werden.
:::

### In der VM

Die VMs benötigen `intel-media-va-driver-non-free` für VAAPI/QSV. Der Render-Node (`/dev/dri/renderD128`) wird im Docker-Container via Nomad `devices`-Block gemountet.

## Thunderbolt Netzwerk

Zwei Thunderbolt 4 Kabel verbinden pve01 und pve02 für High-Speed VM-Migration und DRBD-Replikation. Ein Linux Bond (`bond-tb`, active-backup) aggregiert beide TB-Interfaces und löst damit das Problem der nicht-deterministischen Interface-Benennung nach Reboots. Die Bridge `vmbr-tb` nutzt den Bond als einzigen Port. Bandbreite ca. 20 Gbps; IPs im Subnetz 10.99.1.0/24 siehe [Hosts und IPs](../_referenz/hosts-und-ips.md#thunderbolt-netzwerk).

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

## VM Disk-Konfiguration

Alle VMs nutzen **virtio-blk** (statt virtio-scsi) mit folgenden Flags:

| Parameter | Wert | Grund |
|-----------|------|-------|
| Bus | `virtio` (virtio-blk) | Dünnerer Emulations-Stack, 10-20% mehr IOPS als virtio-scsi |
| `aio` | `io_uring` | Modernster async I/O, beste Performance auf ZFS |
| `cache` | `none` | Kein doppeltes Caching (ZFS ARC cached bereits) |
| `discard` | `on` | TRIM/Unmap bis ZFS durchreichen |
| `iothread` | `1` | Separater I/O-Thread pro Disk |

::: warning Umstellung von scsi auf virtio
Die VM muss gestoppt sein. Boot-Order auf `virtio0` setzen. `ssd=1` wird bei virtio-blk nicht unterstützt (und nicht nötig -- virtio-blk ist immer non-rotational).
:::

### ZFS Performance Tuning

Auf allen Proxmox-Hosts (`/etc/modprobe.d/zfs.conf`):

- `zfs_arc_max=26843545600` -- 25 GB ARC (ca. 25% vom RAM)
- `metaslab_lba_weighting_enabled=0` -- HDD-optimierte Allokation deaktiviert (reiner SSD-Pool)
- `zfs_vdev_async_read_max_active=8` -- Mehr parallele Async-Reads (Default 3)
- `zfs_txg_timeout=3` -- Kürzere Sync-Intervalle für bessere Write-Latenz (Default 5)

Nach Änderung muss das initramfs neu generiert werden, damit die Parameter beim Boot greifen.

## Authentifizierung (SSO)

Die PVE-Nodes nutzen Authentik als OpenID Connect Provider für SSO-Login.

| Attribut | Wert |
|-------------|------|
| Realm | `authentik` (Default) |
| Typ | OpenID Connect |
| Issuer URL | `https://auth.ackermannprivat.ch/application/o/proxmox/` |
| Client ID | `proxmox` |
| Username Claim | `email` |
| Autocreate | Ja |

### Web-Zugang (mit gültigen ACME-Zertifikaten)

Jeder Node ist als `pveXX.ackermannprivat.ch:8006` erreichbar (vollständige URL-Liste: [Web-Interfaces](../_referenz/web-interfaces.md)). Die Zertifikate werden automatisch via Let's Encrypt (ACME) mit Cloudflare DNS-Challenge erneuert. DNS-Einträge liegen in den Pi-hole Overrides (`06-specific-overrides.conf`).

### SSO-Benutzer

| User | Realm | Rolle |
|------|-------|-------|
| `samuel@ackermannprivat.ch` | authentik | Administrator |

::: info Fallback
PAM-Login (`root@pam`) bleibt als Fallback verfügbar -- einfach im Realm-Dropdown wechseln.
:::

## Datacenter Manager (PDM)

Der Proxmox Datacenter Manager ermöglicht die zentrale Verwaltung des PVE Clusters und des Proxmox Backup Servers.

| Attribut | Wert |
|-------------|------|
| Host | datacenter-manager (10.0.2.60) |
| Web UI | `https://pdm.ackermannprivat.ch` |
| Port | 8443 |

### Konfigurierte Remotes

Remotes: PVE-Cluster "lenzburg" (3 Nodes) und PBS "pbs" -- IPs und Ports siehe [Hosts und IPs](../_referenz/hosts-und-ips.md).

### Authentifizierung

- **Traefik Middleware:** `intern-auth` (Authentik ForwardAuth + IP-Allowlist)
- **API Token:** `root@pam!datacenter-manager` (auf allen PVE/PBS Nodes)

### Konfigurationsdateien

| Datei | Beschreibung |
|-------|--------------|
| `/etc/proxmox-datacenter-manager/remotes.cfg` | Remote-Konfiguration |
| `/etc/proxmox-datacenter-manager/remotes.shadow` | Token Storage |

Die Traefik-Route ist in der Traefik Dynamic Config definiert (`/nfs/docker/traefik/configurations/config.yml`).

## Verwandte Seiten

- [Betrieb](./betrieb.md) -- HA-Prüfungen, Wartung, bekannte Probleme
- [Netzwerk](../netzwerk/) -- VLANs, Subnets, Hardware
- [Backup](../backup/) -- Backup-Strategie und PBS
- [Hardware-Inventar](../_referenz/hardware-inventar.md) -- Physische Hardware-Details
- [Linstor Storage](../linstor-storage/) -- DRBD-replizierter Block-Storage
- [Nomad](../nomad/) -- Container-Orchestrierung auf den VMs
- [Consul](../consul/) -- Service Discovery und KV Store
- [Vault](../vault/) -- Secrets Management
