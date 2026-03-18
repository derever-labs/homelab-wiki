---
title: Proxmox Datacenter Manager
description: Zentrale Verwaltung mehrerer Proxmox VE Cluster und Backup Server
tags:
  - infrastructure
  - proxmox
  - pdm
---

# Proxmox Datacenter Manager (PDM)

Der Proxmox Datacenter Manager ermoeglicht die zentrale Verwaltung mehrerer Proxmox VE Cluster und Proxmox Backup Server.

## Uebersicht

| Eigenschaft | Wert |
|-------------|------|
| Host | pdm (10.0.2.60) |
| Web UI | https://pdm.ackermannprivat.ch |
| Port | 8443 |
| OS | Debian 13 (trixie) |
| Version | 1.0.1 |

## Konfigurierte Remotes

### Proxmox VE Cluster "lenzburg"

| Node | IP | Fingerprint |
|------|-----|-------------|
| pve00 | 10.0.2.40 | 50:8C:8B:8D:... |
| pve01 | 10.0.2.41 | 44:D2:C8:51:... |
| pve02 | 10.0.2.42 | 2D:8F:08:79:... |

### Proxmox Backup Server "pbs"

| Host | IP | Port |
|------|-----|------|
| pbs-backup-server | 10.0.2.50 | 8007 |

## Authentifizierung

- **Traefik Middleware**: `intern-admin-chain-v2` (OAuth2 Admin + IP Whitelist)
- **API Token**: `root@pam!datacenter-manager` (auf allen PVE/PBS Nodes)

## Konfigurationsdateien

| Datei | Beschreibung |
|-------|--------------|
| `/etc/proxmox-datacenter-manager/remotes.cfg` | Remote-Konfiguration |
| `/etc/proxmox-datacenter-manager/remotes.shadow` | Token Storage |

Die Traefik-Route ist in der Traefik Dynamic Config definiert (`/nfs/docker/traefik/configurations/config.yml`).
