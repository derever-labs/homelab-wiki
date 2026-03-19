---
title: Infrastruktur-Übersicht
description: Gesamtübersicht aller Services, Netzwerke und Plattformen im Homelab
tags:
  - architecture
  - overview
  - services
---

# Infrastruktur-Übersicht

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

### Core

- [Traefik](../services/core/traefik.md) -- Reverse Proxy, SSL (traefik.ackermannprivat.ch)
- Keycloak -- Identity Provider, OAuth2/OIDC (sso.ackermannprivat.ch)
- [OpenLDAP](../services/core/ldap.md) -- Benutzerverzeichnis (intern)
- [PostgreSQL](./database-architecture.md) -- Shared DB Cluster (intern)
- Gitea -- Git Server (gitea.ackermannprivat.ch)
- DbGate -- Datenbank-Verwaltung (dbgate.ackermannprivat.ch)
- SMTP Relay -- Mail-Relay für Services (intern)
- [Wiki](../services/core/wiki.md) -- Dokumentation (wiki.ackermannprivat.ch)

### Media

- [Jellyfin](../services/media/jellyfin.md) -- Media Server (watch.ackermannprivat.ch)
- Jellyseerr -- Media Requests (wish.ackermannprivat.ch)
- Sonarr -- Serien Management (sonarr.ackermannprivat.ch)
- Radarr -- Film Management (radarr.ackermannprivat.ch)
- Prowlarr -- Indexer Management (prowlarr.ackermannprivat.ch)
- SABnzbd -- Usenet Downloader (sabnzbd.ackermannprivat.ch)
- AudioBookShelf -- Hörbücher (audio.ackermannprivat.ch)
- LazyLibrarian -- E-Book Management (lazylibrarian.ackermannprivat.ch)
- Stash -- Media Organizer (s.ackermannprivat.ch)
- JellyStat -- Jellyfin Statistiken (jellystat.ackermannprivat.ch)
- Maintainerr -- Jellyfin Collection Cleanup (intern)
- Janitorr -- Automatische Medienbereinigung (intern)
- YouTube-DL -- Video Download (download.ackermannprivat.ch)
- Video-Grabber -- Video Download Frontend (grab.ackermannprivat.ch)
- Handbrake -- Video Transcoding (handbrake.ackermannprivat.ch)

### Monitoring

- [Grafana](../services/monitoring/stack.md) -- Dashboards (graf.ackermannprivat.ch)
- Uptime Kuma -- Availability Monitoring (uptime.ackermannprivat.ch)
- Gatus -- Status Page, öffentlich (status.ackermannprivat.ch)
- CheckMK -- Infrastructure Monitoring (monitoring.ackermannprivat.ch)
- Loki -- Log-Aggregation (loki.ackermannprivat.ch)
- InfluxDB -- Zeitreihen-Datenbank (influx.ackermannprivat.ch)
- Alloy -- Log-Collector (System Job)

### Productivity

- [Vaultwarden](../services/productivity/vaultwarden.md) -- Passwort Manager (p.ackermannprivat.ch)
- [Paperless](../services/productivity/paperless.md) -- DMS (paperless.ackermannprivat.ch)
- Tandoor -- Rezepte (tandoor.ackermannprivat.ch)
- [solidtime](../services/productivity/zeiterfassung.md) -- Zeiterfassung (time.ackermannprivat.ch)
- [Kimai](../services/productivity/zeiterfassung.md) -- Zeiterfassung Backup (kimai.ackermannprivat.ch)
- n8n -- Workflow Automation (n8n.ackermannprivat.ch)
- Guacamole -- Remote Desktop Gateway (remote.ackermannprivat.ch)
- ChangeDetection -- Website-Änderungsüberwachung (change.ackermannprivat.ch)
- Obsidian LiveSync -- Obsidian Synchronisation (obsidian-sync.ackermannprivat.ch)
- Notifiarr -- Benachrichtigungsservice (notifiarr.ackermannprivat.ch)
- Metabase -- Business Intelligence (metabase.ackermannprivat.ch)
- Czkawka -- Duplikat-Finder (double.ackermannprivat.ch)
- MeshCommander -- Intel AMT Management (mesh.ackermannprivat.ch)

### AI/LLM

- Ollama -- LLM Backend (ollama.ackermannprivat.ch)
- Open-WebUI -- LLM Chat Interface (chat.ackermannprivat.ch)
- HolLama -- Alternative LLM UI (hollama.ackermannprivat.ch)

### Dashboards

- Flame -- Startseite extern (welcome.ackermannprivat.ch)
- Homepage -- Dashboard intern (intra.ackermannprivat.ch)

### Batch Jobs

Automatisierte Aufgaben als Nomad Periodic/Batch Jobs. Details: [Nomad Architektur](../platforms/nomad-architecture.md)

- Watchtower (Container-Updates)
- Docker Prune (Speicher-Bereinigung)
- PostgreSQL Backup (tägliches pg_dumpall) - [Details](../services/core/backup-strategy.md)
- Daily Container Restart, Daily Cleanup, Daily Reboot
- Reddit/PH Downloader

## Architektur & Plattformen

- [Netzwerk-Topologie](./network-topology.md) -- VLANs, Subnets, Routing
- [Datenbank-Architektur](./database-architecture.md) -- PostgreSQL Cluster, DRBD
- [Service-Abhängigkeiten](./service-dependencies.md) -- Abhängigkeitsdiagramm
- [Datenstrategie](./data-strategy.md) -- Speicher-Ebenen, Backups
- [Proxmox Cluster](../infrastructure/proxmox-cluster.md) -- Hosts, VMs, IPs
- [Server-Hardware](../infrastructure/hardware.md) -- Physische Server, NAS
- [Netzwerk-Hardware](../infrastructure/network-hardware.md) -- Switches, APs
- [NAS Storage](../infrastructure/storage-nas.md) -- NFS-Exports, MinIO
- [Proxmox Backup Server](../services/core/pbs.md) -- Inkrementelle Backups
- [HashiCorp Stack](../platforms/hashicorp-stack.md) -- Nomad, Consul, Vault
- [Nomad Architektur](../platforms/nomad-architecture.md) -- Job Overview
- [Zigbee / HomeAssistant](../services/iot/zigbee.md) -- IoT

## Wartung

- **Notfall:** [Cluster Restart Runbook](../runbooks/cluster-restart.md)

## Storage

NFS-Exports und Mount-Pfade: [NAS-Speicher](../infrastructure/storage-nas.md)

## Zugang

- **SSH:** User `sam` für VMs, `root` für Proxmox-Nodes (IPs siehe [Proxmox Cluster](../infrastructure/proxmox-cluster.md))
- **Vault:** Details siehe [HashiCorp Stack](../platforms/hashicorp-stack.md)
- **Nomad/Consul:** Details siehe [HashiCorp Stack](../platforms/hashicorp-stack.md)

## Verwandte Seiten

- [Netzwerk-Topologie](./network-topology.md) -- VLANs, Subnets und Routing
- [Service-Abhängigkeiten](./service-dependencies.md) -- Abhängigkeitsdiagramm aller Services
- [Datenstrategie](./data-strategy.md) -- Speicher-Konzepte und Backups
- [Proxmox Cluster](../infrastructure/proxmox-cluster.md) -- Vollständige Host- und VM-Liste
