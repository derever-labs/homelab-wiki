---
title: Infrastruktur-Übersicht
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

**Weitere Informationen:** [Sicherheit](../03-platforms/security.md) | [Datenstrategie](./data-strategy.md)

## Services

### Core Services

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Traefik | traefik.ackermannprivat.ch | Reverse Proxy, SSL - [Details](../04-services/core/traefik.md) |
| Keycloak | sso.ackermannprivat.ch | Identity Provider (OAuth2/OIDC) |
| Wiki.js | wiki.ackermannprivat.ch | Dokumentation |

### Media

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Jellyfin | watch.ackermannprivat.ch | Media Server - [Details](../04-services/media/jellyfin.md) |
| Jellyseerr | wish.ackermannprivat.ch | Media Requests |
| Sonarr | sonarr.ackermannprivat.ch | Serien Management |
| Radarr | radarr.ackermannprivat.ch | Film Management |
| Prowlarr | prowlarr.ackermannprivat.ch | Indexer Management |
| SABnzbd | sabnzbd.ackermannprivat.ch | Usenet Downloader |
| AudioBookShelf | audio.ackermannprivat.ch | Hörbücher |

### Monitoring

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Grafana | graf.ackermannprivat.ch | Dashboards - [Details](../04-services/monitoring/stack.md) |
| Uptime Kuma | uptime.ackermannprivat.ch | Availability Monitoring |
| CheckMK | monitoring.ackermannprivat.ch | Infrastructure Monitoring |

### Productivity

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Vaultwarden | p.ackermannprivat.ch | Passwort Manager - [Details](../04-services/productivity/vaultwarden.md) |
| Paperless | paperless.ackermannprivat.ch | DMS - [Details](../04-services/productivity/paperless.md) |
| Tandoor | tandoor.ackermannprivat.ch | Rezepte |
| Guacamole | remote.ackermannprivat.ch | Remote Desktop Gateway |

### AI/LLM

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Ollama | ollama.ackermannprivat.ch | LLM Backend |
| Open-WebUI | - | LLM Chat Interface |
| HolLama | hollama.ackermannprivat.ch | Alternative LLM UI |

## Infrastruktur & Plattformen

- **Compute:** [Proxmox Cluster](../02-infrastructure/proxmox-cluster.md)
- **Storage:** [NAS Storage](../02-infrastructure/storage-nas.md)
- **Backup:** [Proxmox Backup Server](../04-services/core/pbs.md)
- **Orchestrierung:** [HashiCorp Stack](../03-platforms/hashicorp-stack.md)
- **Nomad Architektur:** [Job Overview](../03-platforms/nomad-architecture.md)
- **IoT:** [Zigbee / HomeAssistant](../04-services/iot/zigbee.md)

## Wartung

- **Notfall:** [Cluster Restart Runbook](../05-runbooks/cluster-restart.md)

## Storage

| Pfad | Beschreibung |
|------|--------------|
| /nfs/docker/ | Persistente Container-Daten |
| /nfs/nomad/jobs/ | Nomad Job Files |
| /nfs/cert/ | Zertifikate (read-only) |
| /local-docker/ | Lokaler Docker Storage (Litestream) |

## Zugang

- **SSH:** User `sam` für VMs, `root` für Proxmox-Nodes (IPs siehe Tabellen oben)
- **Vault:** `http://10.0.2.104:8200` — Details siehe [HashiCorp Stack](../03-platforms/hashicorp-stack.md)
- **Nomad/Consul:** Details siehe [HashiCorp Stack](../03-platforms/hashicorp-stack.md)
