---
title: Infrastructure Übersicht
description:
published: true
date: 2025-12-26T17:52:12+00:00
tags:
editor: markdown
dateCreated: 2025-12-26T17:52:12+00:00
---

## Proxmox Cluster

| Host | IP | Beschreibung |
|------|----|--------------|
| pve00 | 10.0.2.40 | Proxmox VE Node (4 CPU, 16GB RAM) |
| pve01 | 10.0.2.41 | Proxmox VE Node |
| pve02 | 10.0.2.42 | Proxmox VE Node |

## Netzwerk

| Netzwerk | Bereich | Verwendung |
|----------|---------|------------|
| Management | 10.0.2.0/24 | VMs, Proxmox, Services |
| IoT | 10.0.0.0/24 | Home Assistant, Zigbee |
| Docker Proxy | 192.168.90.0/24 | Traefik Proxy Network |
| Thunderbolt | 10.99.1.0/24 | Peer-to-Peer Replikation |

## Virtuelle Maschinen

### Infrastructure VMs

| VM | IP | Beschreibung |
|----|-----|--------------|
| vm-proxy-dns-01 | 10.0.2.1 | Traefik, Keycloak, DNS, CrowdSec |
| vm-vpn-dns-01 | 10.0.2.2 | Secondary DNS, ZeroTier |

### Nomad Server (3x)

| Host | IP | VM ID |
|------|-----|-------|
| vm-nomad-server-04 | 10.0.2.104 | 3004 |
| vm-nomad-server-05 | 10.0.2.105 | 3005 |
| vm-nomad-server-06 | 10.0.2.106 | 3006 |

### Nomad Clients (3x)

| Host | IP | Proxmox Host | Specs |
|------|-----|--------------|-------|
| vm-nomad-client-04 | 10.0.2.124 | pve00 | 4 CPU, 12GB RAM |
| vm-nomad-client-05 | 10.0.2.125 | pve01 | 16 CPU, 48GB RAM |
| vm-nomad-client-06 | 10.0.2.126 | pve02 | 16 CPU, 48GB RAM |

### IoT VMs

| Host | IP | Beschreibung |
|------|----|--------------|
| homeassistant | 10.0.0.100 | Home Assistant OS |
| zigbee-node | 10.0.0.110 | Zigbee2MQTT VM |

**Weitere Informationen:** [Sicherheit](../03-platforms/security) | [Datenstrategie](./data-strategy)

## Services

### Core Services

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Traefik | traefik.ackermannprivat.ch | Reverse Proxy, SSL - [Details](../04-services/core/traefik) |
| Keycloak | sso.ackermannprivat.ch | Identity Provider (OAuth2/OIDC) |
| Wiki.js | wiki.ackermannprivat.ch | Dokumentation |

### Media

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Jellyfin | watch.ackermannprivat.ch | Media Server - [Details](../04-services/media/jellyfin) |
| Jellyseerr | wish.ackermannprivat.ch | Media Requests |
| Sonarr | sonarr.ackermannprivat.ch | Serien Management |
| Radarr | radarr.ackermannprivat.ch | Film Management |
| Prowlarr | prowlarr.ackermannprivat.ch | Indexer Management |
| SABnzbd | sabnzbd.ackermannprivat.ch | Usenet Downloader |
| AudioBookShelf | audio.ackermannprivat.ch | Hörbücher |

### Monitoring

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Grafana | graf.ackermannprivat.ch | Dashboards - [Details](../04-services/monitoring/stack) |
| Uptime Kuma | uptime.ackermannprivat.ch | Availability Monitoring |
| CheckMK | monitoring.ackermannprivat.ch | Infrastructure Monitoring |

### Productivity

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Vaultwarden | p.ackermannprivat.ch | Passwort Manager - [Details](../04-services/productivity/vaultwarden) |
| Paperless | paperless.ackermannprivat.ch | DMS - [Details](../04-services/productivity/paperless) |
| Tandoor | tandoor.ackermannprivat.ch | Rezepte |
| Guacamole | remote.ackermannprivat.ch | Remote Desktop Gateway |

### AI/LLM

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Ollama | ollama.ackermannprivat.ch | LLM Backend |
| Open-WebUI | - | LLM Chat Interface |
| HolLama | hollama.ackermannprivat.ch | Alternative LLM UI |

## Infrastruktur & Plattformen

- **Compute:** [Proxmox Cluster](../02-infrastructure/proxmox-cluster)
- **Storage:** [NAS Storage](../02-infrastructure/storage-nas)
- **Backup:** [Proxmox Backup Server](../04-services/core/pbs)
- **Orchestrierung:** [HashiCorp Stack](../03-platforms/hashicorp-stack)
- **Nomad Architektur:** [Job Overview](../03-platforms/nomad-architecture)
- **IoT:** [Zigbee / HomeAssistant](../04-services/iot/zigbee)

## Wartung

- **Notfall:** [Cluster Restart Runbook](../05-runbooks/cluster-restart)

## Storage

| Pfad | Beschreibung |
|------|--------------|
| /nfs/docker/ | Persistente Container-Daten |
| /nfs/nomad/jobs/ | Nomad Job Files |
| /nfs/cert/ | Zertifikate (read-only) |
| /local-docker/ | Lokaler Docker Storage (Litestream) |

## SSH Zugang

```bash
# Proxmox Nodes
ssh root@10.0.2.40  # pve00
ssh root@10.0.2.41  # pve01
ssh root@10.0.2.42  # pve02

# Infrastructure VMs
ssh sam@10.0.2.1    # vm-proxy-dns-01
ssh sam@10.0.2.2    # vm-vpn-dns-01

# Nomad Server
ssh sam@10.0.2.104  # vm-nomad-server-04
ssh sam@10.0.2.105  # vm-nomad-server-05
ssh sam@10.0.2.106  # vm-nomad-server-06

# Nomad Clients
ssh sam@10.0.2.124  # vm-nomad-client-04
ssh sam@10.0.2.125  # vm-nomad-client-05
ssh sam@10.0.2.126  # vm-nomad-client-06

# IoT
ssh sam@10.0.0.110         # zigbee-node
ssh root@10.0.0.100 -p 2222  # homeassistant
```

## Vault

```bash
export VAULT_ADDR=http://10.0.2.104:8200
export VAULT_TOKEN=$(cat ~/.vault-token)
vault kv list kv/
vault kv get kv/<service>
```

## Wichtige Befehle

```bash
# Cluster Status
consul members
nomad server members
nomad node status

# Job Management
nomad job run <job>.nomad
nomad job status <job>
nomad job stop <job>

# Logs
nomad alloc logs -job <job>
journalctl -u consul -f
journalctl -u nomad -f
```
