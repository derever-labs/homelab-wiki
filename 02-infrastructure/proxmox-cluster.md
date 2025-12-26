---
title: Proxmox Cluster
description: Übersicht der physikalischen Virtualisierungs-Hosts
published: true
date: 2025-12-26T18:30:00+00:00
tags: infrastructure, proxmox, hosts
editor: markdown
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

| VM | IP | Rolle |
| :--- | :--- | :--- |
| **vm-proxy-dns-01** | 10.0.2.1 | Primary DNS, Traefik, Keycloak |
| **vm-vpn-dns-01** | 10.0.2.2 | Secondary DNS, VPN Gateway |
| **checkmk** | 10.0.2.150 | Monitoring System |
| **pbs-backup-server** | 10.0.2.50 | Proxmox Backup Server |

## Netzwerk
Alle Nodes sind über ein dediziertes Management-VLAN (10.0.2.x) erreichbar.
Für die Replikation wird ein separates Thunderbolt-Netzwerk (10.99.1.x) verwendet, um den normalen Traffic nicht zu belasten.

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
*Letztes Update: 26.12.2025*
