---
title: Infrastruktur-Übersicht
---

## Infrastruktur

Das Cluster besteht aus 3 Proxmox-Hosts, 6 HashiCorp-VMs (3 Server, 3 Worker), 2 Infrastruktur-VMs und 2 IoT-VMs.

Vollstaendige Auflistung aller Hosts, IPs und Specs: [Proxmox Cluster](../02-infrastructure/proxmox-cluster.md)

## Netzwerk

| Netzwerk | Bereich | Verwendung |
|----------|---------|------------|
| Management | 10.0.2.0/24 | VMs, Proxmox, Services |
| IoT | 10.0.0.0/24 | Home Assistant, Zigbee |
| Docker Proxy | 192.168.90.0/24 | Traefik Proxy Network |
| Thunderbolt | 10.99.1.0/24 | Peer-to-Peer Replikation |

**Weitere Informationen:** [Sicherheit](../03-platforms/security.md) | [Datenstrategie](./data-strategy.md)

## Services

### Core Services

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Traefik | traefik.ackermannprivat.ch | Reverse Proxy, SSL - [Details](../04-services/core/traefik.md) |
| Keycloak | sso.ackermannprivat.ch | Identity Provider (OAuth2/OIDC) |
| OpenLDAP | - (intern) | Benutzerverzeichnis - [Details](../04-services/core/ldap.md) |
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

NFS-Exports und Mount-Pfade: [NAS-Speicher](../02-infrastructure/storage-nas.md)

## Zugang

- **SSH:** User `sam` für VMs, `root` für Proxmox-Nodes (IPs siehe Tabellen oben)
- **Vault:** `http://10.0.2.104:8200` — Details siehe [HashiCorp Stack](../03-platforms/hashicorp-stack.md)
- **Nomad/Consul:** Details siehe [HashiCorp Stack](../03-platforms/hashicorp-stack.md)
