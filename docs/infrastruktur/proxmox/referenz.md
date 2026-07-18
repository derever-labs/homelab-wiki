---
title: Proxmox Referenz
description: iGPU-Passthrough, VM-Disk- und ZFS-Tuning, SSO/OIDC-Felder und Datacenter-Manager-Konfiguration
tags:
  - proxmox
  - referenz
  - virtualisierung
---

# Proxmox Referenz

Referenz-Details zum Proxmox VE Cluster "lenzburg": iGPU-Passthrough, VM-Disk- und ZFS-Parameter, SSO/OIDC-Felder und Datacenter-Manager-Konfiguration. Architektur und Steckbrief: [Proxmox Übersicht](./index.md). Betriebsprozeduren: [Proxmox Betrieb](./betrieb.md).

## iGPU Passthrough

Die Intel Iris Xe iGPU (Alder Lake, 96 EU) auf pve01 und pve02 wird per **Full Passthrough** an die Nomad-Client VMs durchgereicht. Hauptanwendung: [Jellyfin](../../medien/jellyfin/index.md) Hardware-Transcoding (QSV).

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

## VM Disk-Konfiguration

Alle VMs nutzen **virtio-blk** (statt virtio-scsi) mit folgenden Flags:

| Parameter | Wert | Grund |
|-----------|------|-------|
| Bus | `virtio` (virtio-blk) | Dünnerer Emulations-Stack, 10-20% mehr IOPS als virtio-scsi |
| `aio` | `io_uring` | Modernster async I/O, beste Performance auf ZFS |
| `cache` | `none` | Kein doppeltes Caching (ZFS ARC cached bereits) |
| `discard` | `on` | TRIM/Unmap bis ZFS durchreichen |
| `iothread` | `1` | Separater I/O-Thread pro Disk |

Prozedur zur Umstellung einer bestehenden VM von virtio-scsi auf virtio-blk: [Betrieb -- VM-Disk auf virtio-blk umstellen](./betrieb.md#vm-disk-auf-virtio-blk-umstellen).

## ZFS Performance Tuning

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

Jeder Node ist als `pveXX.ackermannprivat.ch:8006` erreichbar (vollständige URL-Liste: [Web-Interfaces](../../_referenz/web-interfaces.md)). Die Zertifikate werden automatisch via Let's Encrypt (ACME) mit Cloudflare DNS-Challenge erneuert. DNS-Einträge liegen in den Pi-hole Overrides (`06-specific-overrides.conf`).

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

| Remote | Typ | Anbindung |
| :--- | :--- | :--- |
| lenzburg | PVE-Cluster (3 Nodes) | lokal |
| pbs | Proxmox Backup Server | lokal |
| pve-01-nana | Standalone-Node Dottikon | via Tailscale |
| pve-lu-01 | Standalone-Node Luzern | via Tailscale |

IPs und Ports siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md).

::: tip Alle Remotes auf FQDN + CA-Trust
Alle Remotes sind über ihren **FQDN mit CA-Trust** eingebunden (kein Fingerprint-Pinning mehr). Die Node-FQDNs lösen via Pi-hole-Split-DNS auf die jeweilige Tailscale-IP auf und tragen ein gültiges Let's-Encrypt-Zertifikat ([TLS-Zertifikate](../../_referenz/tls-zertifikate.md#proxmox-nodes-eigene-acme-zertifikate)). Damit überlebt die Anbindung jede Zertifikats-Erneuerung -- ein gepinnter Fingerprint wäre bei jedem Renewal gebrochen.

PDM selbst nutzt **kein** `accept-routes` (das würde sein eigenes Netz `10.0.0.0/22` über Tailscale routen und es aussperren). Die externen Remotes erreicht PDM daher über die direkte Tailscale-Peer-IP, auf die der FQDN auflöst.
:::

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

- [Proxmox Übersicht](./index.md) -- Steckbrief, Cluster-Knoten und Architektur
- [Proxmox Betrieb](./betrieb.md) -- HA-Prüfungen, Wartung und Betriebsprozeduren
- [Hardware-Inventar](../../_referenz/hardware-inventar.md) -- Physische Hardware-Details
- [Web-Interfaces](../../_referenz/web-interfaces.md) -- URL-Liste der Node-Weboberflächen
