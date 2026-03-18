---
title: Infrastruktur-Übersicht
---

## Infrastruktur

Das Cluster besteht aus 3 Proxmox-Hosts, 6 HashiCorp-VMs (3 Server, 3 Worker), 2 Infrastruktur-VMs und 2 IoT-VMs.

Vollständige Auflistung aller Hosts, IPs und Specs: [Proxmox Cluster](../infrastructure/proxmox-cluster.md)

## Netzwerk

| Netzwerk | Bereich | Verwendung |
|----------|---------|------------|
| Management | 10.0.2.0/24 | VMs, Proxmox, Services |
| IoT | 10.0.0.0/24 | Home Assistant, Zigbee |
| Docker Proxy | 192.168.90.0/24 | Traefik Proxy Network |
| Thunderbolt | 10.99.1.0/24 | Peer-to-Peer Replikation |

**Weitere Informationen:** [Netzwerk-Topologie](./network-topology.md) | [Sicherheit](../platforms/security.md) | [Datenstrategie](./data-strategy.md)

## Services

### Core Services

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Traefik | traefik.ackermannprivat.ch | Reverse Proxy, SSL - [Details](../services/core/traefik.md) |
| Keycloak | sso.ackermannprivat.ch | Identity Provider (OAuth2/OIDC) |
| OpenLDAP | - (intern) | Benutzerverzeichnis - [Details](../services/core/ldap.md) |
| PostgreSQL | - (intern) | Shared DB Cluster - [Details](./database-architecture.md) |
| Gitea | gitea.ackermannprivat.ch | Git Server (intern) |
| DbGate | dbgate.ackermannprivat.ch | Datenbank-Verwaltung |
| SMTP Relay | - (intern) | Mail-Relay für Services |
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
| AudioBookShelf | audio.ackermannprivat.ch | Hörbücher |
| LazyLibrarian | lazylibrarian.ackermannprivat.ch | E-Book Management |
| Stash | s.ackermannprivat.ch | Media Organizer |
| JellyStat | jellystat.ackermannprivat.ch | Jellyfin Statistiken |
| Maintainerr | - (intern) | Jellyfin Collection Cleanup |
| Janitorr | - (intern) | Automatische Medienbereinigung |
| YouTube-DL | download.ackermannprivat.ch | Video Download |
| Video-Grabber | grab.ackermannprivat.ch | Video Download (Frontend) |
| Handbrake | handbrake.ackermannprivat.ch | Video Transcoding |

### Monitoring

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Grafana | graf.ackermannprivat.ch | Dashboards - [Details](../services/monitoring/stack.md) |
| Uptime Kuma | uptime.ackermannprivat.ch | Availability Monitoring |
| Gatus | status.ackermannprivat.ch | Status Page (öffentlich) |
| CheckMK | monitoring.ackermannprivat.ch | Infrastructure Monitoring |
| Loki | loki.ackermannprivat.ch | Log-Aggregation |
| InfluxDB | influx.ackermannprivat.ch | Zeitreihen-Datenbank |
| Alloy | - (System Job) | Log-Collector |

### Productivity

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Vaultwarden | p.ackermannprivat.ch | Passwort Manager - [Details](../services/productivity/vaultwarden.md) |
| Paperless | paperless.ackermannprivat.ch | DMS - [Details](../services/productivity/paperless.md) |
| Tandoor | tandoor.ackermannprivat.ch | Rezepte |
| solidtime | time.ackermannprivat.ch | Zeiterfassung - [Details](../services/productivity/zeiterfassung.md) |
| Kimai | kimai.ackermannprivat.ch | Zeiterfassung (Backup) - [Details](../services/productivity/zeiterfassung.md) |
| n8n | n8n.ackermannprivat.ch | Workflow Automation (intern) |
| Guacamole | remote.ackermannprivat.ch | Remote Desktop Gateway |
| ChangeDetection | change.ackermannprivat.ch | Website-Änderungsüberwachung |
| Obsidian LiveSync | obsidian-sync.ackermannprivat.ch | Obsidian Synchronisation |
| Notifiarr | notifiarr.ackermannprivat.ch | Benachrichtigungsservice |
| Metabase | metabase.ackermannprivat.ch | Business Intelligence |
| Czkawka | double.ackermannprivat.ch | Duplikat-Finder |
| MeshCommander | mesh.ackermannprivat.ch | Intel AMT Management |

### AI/LLM

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Ollama | ollama.ackermannprivat.ch | LLM Backend |
| Open-WebUI | chat.ackermannprivat.ch | LLM Chat Interface |
| HolLama | hollama.ackermannprivat.ch | Alternative LLM UI |

### Dashboards

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Flame | welcome.ackermannprivat.ch | Startseite (extern) |
| Homepage | intra.ackermannprivat.ch | Dashboard (intern) |

### Batch Jobs

Automatisierte Aufgaben als Nomad Periodic/Batch Jobs. Details: [Nomad Architektur](../platforms/nomad-architecture.md)

- Watchtower (Container-Updates)
- Docker Prune (Speicher-Bereinigung)
- PostgreSQL Backup (tägliches pg_dumpall) - [Details](../services/core/backup-strategy.md)
- Daily Container Restart, Daily Cleanup, Daily Reboot
- Reddit/PH Downloader

## Architektur-Detail-Seiten

- **Netzwerk:** [Netzwerk-Topologie](./network-topology.md)
- **Datenbanken:** [Datenbank-Architektur](./database-architecture.md)
- **Abhängigkeiten:** [Service-Abhängigkeiten](./service-dependencies.md)
- **Datenstrategie:** [Datenstrategie](./data-strategy.md)

## Infrastruktur & Plattformen

- **Compute:** [Proxmox Cluster](../infrastructure/proxmox-cluster.md)
- **Hardware:** [Server-Hardware](../infrastructure/hardware.md)
- **Netzwerk-Hardware:** [Netzwerk-Hardware](../infrastructure/network-hardware.md)
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

- **SSH:** User `sam` für VMs, `root` für Proxmox-Nodes (IPs siehe Tabellen oben)
- **Vault:** `http://10.0.2.104:8200` -- Details siehe [HashiCorp Stack](../platforms/hashicorp-stack.md)
- **Nomad/Consul:** Details siehe [HashiCorp Stack](../platforms/hashicorp-stack.md)
