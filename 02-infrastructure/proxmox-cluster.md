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
Für die Replikation wird ein separates Thunderbolt-Netzwerk (10.99.1.x) verwendet, um den normalen Traffic nicht zu belasten.

### Thunderbolt Boot-Konfiguration

Das Thunderbolt-Interface (`thunderbolt1`) erscheint erst nach dem Firmware-Init (~20s). Um Race Conditions zu vermeiden, ist auf pve01 und pve02 ein Dual-Layer Fix implementiert:

**Systemd Drop-in** (`/etc/systemd/system/networking.service.d/wait-for-thunderbolt.conf`):
```ini
[Unit]
Wants=sys-subsystem-net-devices-thunderbolt1.device
After=sys-subsystem-net-devices-thunderbolt1.device
```

**udev Fallback** (`/etc/udev/rules.d/99-thunderbolt-bridge.rules`):
```
ACTION=="add", SUBSYSTEM=="net", KERNEL=="thunderbolt1", RUN+="/usr/local/bin/thunderbolt-bridge-add.sh"
```

**Verifikation nach Reboot:**
```bash
brctl show vmbr-tb | grep thunderbolt1
journalctl -u networking.service | grep -i thunder
```

## Storage
- **Local ZFS:** Schneller Speicher für OS und Caches auf jedem Node.
- **NFS (Synology):** Geteilter Speicher für Backups und ISOs.
- **PBS:** Proxmox Backup Server (vm-id 99999) auf pve02 für inkrementelle Backups.

## Management
Die Web-UI ist unter `https://<node-ip>:8006` erreichbar.

### SSH Zugriff
```bash
ssh root@10.0.2.40
ssh root@10.0.2.41
ssh root@10.0.2.42
```

---
*Letztes Update: 12.01.2026*
