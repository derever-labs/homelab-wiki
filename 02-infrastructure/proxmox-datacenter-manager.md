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

- **Traefik Middleware**: `intern-admin-chain` (OAuth2 Admin + IP Whitelist)
- **API Token**: `root@pam!datacenter-manager` (auf allen PVE/PBS Nodes)

## Services

```bash
# API Service
systemctl status proxmox-datacenter-api

# Privileged API Service
systemctl status proxmox-datacenter-privileged-api
```

## Konfigurationsdateien

| Datei | Beschreibung |
|-------|--------------|
| `/etc/proxmox-datacenter-manager/remotes.cfg` | Remote-Konfiguration |
| `/etc/proxmox-datacenter-manager/remotes.shadow` | Token Storage |

## Installation (Referenz)

Falls eine Neuinstallation erforderlich ist:

```bash
# Repository hinzufuegen
echo "deb http://download.proxmox.com/debian/pdm trixie pdm-release" > /etc/apt/sources.list.d/pdm.list

# GPG Key
wget https://enterprise.proxmox.com/debian/proxmox-release-trixie.gpg -O /etc/apt/trusted.gpg.d/proxmox-release-trixie.gpg

# Installation
apt update
apt install proxmox-datacenter-manager
```

## Traefik Route

Die Route ist in `/nfs/docker/traefik/configurations/config.yml` konfiguriert:

```yaml
routers:
  pdm:
    entryPoints: [https]
    rule: Host(`pdm.ackermannprivat.ch`)
    service: pdm
    middlewares: [intern-admin-chain]

  oauth2-pdm:
    entryPoints: [https]
    rule: Host(`pdm.ackermannprivat.ch`) && PathPrefix(`/oauth2/`)
    service: oauth2-admin-backend
    priority: 1000

services:
  pdm:
    loadBalancer:
      servers:
        - url: https://10.0.2.60:8443
      serversTransport: insecureSkipVerify
```
