---
title: Infrastruktur-Uebersicht
---

## Infrastruktur

Das Cluster besteht aus 3 Proxmox-Hosts, 6 HashiCorp-VMs (3 Server, 3 Worker), 2 Infrastruktur-VMs und 2 IoT-VMs.

Vollstaendige Auflistung aller Hosts, IPs und Specs: [Proxmox Cluster](../infrastructure/proxmox-cluster.md)

## Netzwerk

| Netzwerk | Bereich | Verwendung |
|----------|---------|------------|
| Management | 10.0.2.0/24 | VMs, Proxmox, Services |
| IoT | 10.0.0.0/24 | Home Assistant, Zigbee |
| Docker Proxy | 192.168.90.0/24 | Traefik Proxy Network |
| Thunderbolt | 10.99.1.0/24 | Peer-to-Peer Replikation |

**Weitere Informationen:** [Sicherheit](../platforms/security.md) | [Datenstrategie](./data-strategy.md)

## Services

### Core Services

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Traefik | traefik.ackermannprivat.ch | Reverse Proxy, SSL - [Details](../services/core/traefik.md) |
| Keycloak | sso.ackermannprivat.ch | Identity Provider (OAuth2/OIDC) |
| OpenLDAP | - (intern) | Benutzerverzeichnis - [Details](../services/core/ldap.md) |
| Wiki | wiki.ackermannprivat.ch | Dokumentation |

### Media

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Jellyfin | watch.ackermannprivat.ch | Media Server - [Details](../services/media/jellyfin.md) |
| Jellyseerr | wish.ackermannprivat.ch | Media Requests |
| Sonarr | sonarr.ackermannprivat.ch | Serien Management |
| Radarr | radarr.ackermannprivat.ch | Film Management |
| Prowlarr | prowlarr.ackermannprivat.ch | Indexer Management |
| SABnzbd | sabnzbd.ackermannprivat.ch | Usenet Downloader |
| AudioBookShelf | audio.ackermannprivat.ch | Hoerbuecher |

### Monitoring

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Grafana | graf.ackermannprivat.ch | Dashboards - [Details](../services/monitoring/stack.md) |
| Uptime Kuma | uptime.ackermannprivat.ch | Availability Monitoring |
| CheckMK | monitoring.ackermannprivat.ch | Infrastructure Monitoring |

### Productivity

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Vaultwarden | p.ackermannprivat.ch | Passwort Manager - [Details](../services/productivity/vaultwarden.md) |
| Paperless | paperless.ackermannprivat.ch | DMS - [Details](../services/productivity/paperless.md) |
| Tandoor | tandoor.ackermannprivat.ch | Rezepte |
| Guacamole | remote.ackermannprivat.ch | Remote Desktop Gateway |

### AI/LLM

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Ollama | ollama.ackermannprivat.ch | LLM Backend |
| Open-WebUI | - | LLM Chat Interface |
| HolLama | hollama.ackermannprivat.ch | Alternative LLM UI |

## Infrastruktur & Plattformen

- **Compute:** [Proxmox Cluster](../infrastructure/proxmox-cluster.md)
- **Storage:** [NAS Storage](../infrastructure/storage-nas.md)
- **Backup:** [Proxmox Backup Server](../services/core/pbs.md)
- **Orchestrierung:** [HashiCorp Stack](../platforms/hashicorp-stack.md)
- **Nomad Architektur:** [Job Overview](../platforms/nomad-architecture.md)
- **IoT:** [Zigbee / HomeAssistant](../services/iot/zigbee.md)

## Wartung

- **Notfall:** [Cluster Restart Runbook](../runbooks/cluster-restart.md)

## Storage

NFS-Exports und Mount-Pfade: [NAS-Speicher](../infrastructure/storage-nas.md)

## Zugang

- **SSH:** User `sam` fuer VMs, `root` fuer Proxmox-Nodes (IPs siehe Tabellen oben)
- **Vault:** `http://10.0.2.104:8200` -- Details siehe [HashiCorp Stack](../platforms/hashicorp-stack.md)
- **Nomad/Consul:** Details siehe [HashiCorp Stack](../platforms/hashicorp-stack.md)
