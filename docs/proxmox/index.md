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

| Eigenschaft | Wert |
|-------------|------|
| Cluster-Name | lenzburg |
| Knoten | 3 (pve00, pve01, pve02) |
| PVE Version | 9.1.7 |
| PBS Version | 4.1.5 |
| HA-Modus | Migrate bei Shutdown |
| Migration-Netzwerk | 10.99.1.0/24 (Thunderbolt) |
| Web-UI | `https://<node-ip>:8006` |

## Cluster-Knoten

| Node | IP (Management) | Rolle | Hardware (CPU/RAM) |
|------|-----------------|-------|--------------------|
| **pve00** | 10.0.2.40 | Quorum / VM Host | 4 CPU / 16 GB |
| **pve01** | 10.0.2.41 | Main Compute Node | 16 CPU / 64 GB |
| **pve02** | 10.0.2.42 | Main Compute Node | 16 CPU / 64 GB |

Alle Nodes sind über das Management-Netzwerk (10.0.2.0/24) erreichbar. SSH-Zugang erfolgt als `root` auf den jeweiligen Management-IPs.

## VM-Übersicht

### Infrastructure VMs und LXCs

| Host | IP | VM-ID | Host | Rolle |
|----|-----|-------|------|-------|
| **lxc-dns-01** | 10.0.2.1 | -- | pve01 | Pi-hole v6 + Unbound (Primary DNS) |
| **lxc-dns-02** | 10.0.2.2 | -- | pve02 | Pi-hole v6 + Unbound (Secondary DNS) |
| **vm-traefik-01** | 10.0.2.21 | -- | pve01 | Traefik Reverse Proxy (VIP: 10.0.2.20) |
| **vm-traefik-02** | 10.0.2.22 | -- | pve02 | Traefik Reverse Proxy (VIP: 10.0.2.20, Keepalived HA) |
| **checkmk** | 10.0.2.150 | 2000 | pve01 | Monitoring System |
| **pbs-backup-server** | 10.0.2.50 | 99999 | pve02 | Proxmox Backup Server |
| **datacenter-manager** | 10.0.2.60 | 99998 | pve01 | Management Tools |

### HashiCorp Stack -- Nomad Server (3x)

| VM | IP | VM-ID | Host | Specs |
|----|-----|-------|------|-------|
| **vm-nomad-server-04** | 10.0.2.104 | 3004 | pve00 | 2 CPU, 4 GB RAM |
| **vm-nomad-server-05** | 10.0.2.105 | 3005 | pve01 | 2 CPU, 4 GB RAM |
| **vm-nomad-server-06** | 10.0.2.106 | 3006 | pve02 | 2 CPU, 4 GB RAM |

### HashiCorp Stack -- Nomad Clients (3x)

| VM | IP | VM-ID | Host | Specs |
|----|-----|-------|------|-------|
| **vm-nomad-client-04** | 10.0.2.124 | 3104 | pve00 | 4 CPU, 12 GB RAM |
| **vm-nomad-client-05** | 10.0.2.125 | 3105 | pve01 | 16 CPU, 74 GB RAM, iGPU Passthrough |
| **vm-nomad-client-06** | 10.0.2.126 | 3106 | pve02 | 16 CPU, 74 GB RAM, iGPU Passthrough |

### IoT VMs

| VM | IP | VM-ID | Host | Rolle |
|----|-----|-------|------|-------|
| **homeassistant** | 10.0.0.100 | 1000 | pve02 | Home Assistant OS |
| **zigbee-node** | 10.0.0.110 | 1100 | pve02 | Zigbee2MQTT, Mosquitto |

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

Zwei Thunderbolt 4 Kabel verbinden pve01 und pve02 für High-Speed VM-Migration und DRBD-Replikation. Ein Linux Bond (`bond-tb`, active-backup) aggregiert beide TB-Interfaces und löst damit das Problem der nicht-deterministischen Interface-Benennung nach Reboots. Die Bridge `vmbr-tb` nutzt den Bond als einzigen Port.

| Host | vmbr-tb | Bandbreite |
|------|---------|------------|
| pve01 | 10.99.1.1 | ~20 Gbps |
| pve02 | 10.99.1.2 | ~20 Gbps |

## HA Konfiguration

- **shutdown_policy:** `migrate` -- VMs werden bei geplanten Host-Shutdowns automatisch migriert
- **Migration Network:** 10.99.1.0/24 (Thunderbolt Bridge)
- **Letzte HA-Prüfung:** 2026-04-05 (Details: [Betrieb](./betrieb.md))

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

Nach Änderung: `update-initramfs -u -k all`

## Authentifizierung (SSO)

Die PVE-Nodes nutzen Authentik als OpenID Connect Provider für SSO-Login.

| Eigenschaft | Wert |
|-------------|------|
| Realm | `authentik` (Default) |
| Typ | OpenID Connect |
| Issuer URL | `https://auth.ackermannprivat.ch/application/o/proxmox/` |
| Client ID | `proxmox` |
| Username Claim | `email` |
| Autocreate | Ja |

### Web-Zugang (mit gültigen ACME-Zertifikaten)

| Node | URL |
|------|-----|
| pve00 | `https://pve00.ackermannprivat.ch:8006` |
| pve01 | `https://pve01.ackermannprivat.ch:8006` |
| pve02 | `https://pve02.ackermannprivat.ch:8006` |

Die Zertifikate werden automatisch via Let's Encrypt (ACME) mit Cloudflare DNS-Challenge erneuert. DNS-Einträge liegen in den Pi-hole Overrides (`06-specific-overrides.conf`).

### SSO-Benutzer

| User | Realm | Rolle |
|------|-------|-------|
| `samuel@ackermannprivat.ch` | authentik | Administrator |

::: info Fallback
PAM-Login (`root@pam`) bleibt als Fallback verfügbar -- einfach im Realm-Dropdown wechseln.
:::

## Datacenter Manager (PDM)

Der Proxmox Datacenter Manager ermöglicht die zentrale Verwaltung des PVE Clusters und des Proxmox Backup Servers.

| Eigenschaft | Wert |
|-------------|------|
| Host | datacenter-manager (10.0.2.60) |
| Web UI | `https://pdm.ackermannprivat.ch` |
| Port | 8443 |
| OS | Debian 13 (trixie) |
| Version | 1.0.1 |

### Konfigurierte Remotes

**Proxmox VE Cluster "lenzburg":** pve00 (10.0.2.40), pve01 (10.0.2.41), pve02 (10.0.2.42)

**Proxmox Backup Server "pbs":** pbs-backup-server (10.0.2.50, Port 8007)

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
