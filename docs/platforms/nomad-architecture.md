---
title: Nomad Job-Übersicht
description: Verzeichnisstruktur, Abhängigkeiten und Konfigurationsmuster der Nomad Jobs
tags:
  - platform
  - nomad
  - jobs
---

## Verzeichnisstruktur

| Verzeichnis | Inhalt |
|-------------|--------|
| batch-jobs/ | Watchtower, Docker Prune, Daily Cleanup/Reboot/Restart, Daily Restart Jellyfin, Reddit Downloader, PH Downloader, PostgreSQL Backup |
| databases/ | OpenLDAP, PostgreSQL (DRBD), DbGate |
| infrastructure/ | SMTP Relay, Filebrowser, Zot Registry, GitHub Runner |
| media/ | Jellyfin, Sonarr, Radarr, Prowlarr, SABnzbd, Jellyseerr, Janitorr, JellyStat, Stash, Stash-Secure, Handbrake, AudioBookShelf, LazyLibrarian, YouTube-DL, Special-YouTube-DL, Special-YT-DLP, Video-Grabber |
| monitoring/ | Grafana, InfluxDB, Loki, Uptime Kuma, Gatus, iperf3-to-influxdb |
| services/ | VitePress Wiki, Paperless, Vaultwarden, Ollama, Open-WebUI, HolLama, Flame, Flame-Intra, Homepage-Intra, Guacamole, Tandoor, ChangeDetection, Notifiarr, Czkawka, Obsidian-LiveSync, Mosquitto, Zigbee2MQTT, Gitea, Metabase, solidtime, Kimai, n8n, MeshCommander, PHDler Telegram Bot, Swissbau Viewer |
| system/ | Alloy (Log-Collector), Linstor CSI, Linstor GUI |
| test/ | Linstor Volume Test |

## Traefik Middlewares

Siehe [Traefik Middleware Chains](traefik-middlewares.md) für die vollständige Dokumentation der v2 Middleware Chains.

## Infrastructure

Alle VMs und IPs: [Proxmox Cluster](../infrastructure/proxmox-cluster.md)

## DNS

Siehe [DNS-Architektur](dns-architecture.md) für die vollständige Dokumentation der DNS-Kette (Pi-hole v6, Unbound, Consul DNS).

## Datenbank-Architektur

Siehe [Datenbank-Architektur](../architecture/database-architecture.md) für den PostgreSQL Shared Cluster, DRBD-Replikation und Service-Zuordnung.

## Service-Abhängigkeiten

Siehe [Service-Abhängigkeiten](../architecture/service-dependencies.md) für ein vollständiges Diagramm aller Abhängigkeiten.

## Job Configuration

- Docker als Task Driver
- Volumes von `/nfs/docker/` für persistente Daten
- Bridge Networking mit Port Mappings
- Health Checks wo anwendbar
- Resource Limits gesetzt
- PostgreSQL-abhängige Jobs haben `wait-for-postgres` Init-Task

## Dependencies

- **NFS Storage**: Jobs erwarten NFS Mounts unter `/nfs/docker/`
- **Docker**: Alle Jobs nutzen Docker Task Driver
- **Consul**: Service Discovery via `*.service.consul`
- **Vault**: Secret Injection via `template` Stanzas
- **PostgreSQL**: Viele Services nutzen den Shared Cluster (siehe [Datenbank-Architektur](../architecture/database-architecture.md))

## Verwandte Seiten

- [HashiCorp Stack](hashicorp-stack.md) -- Cluster-Architektur (Nomad/Consul/Vault)
- [Traefik Middlewares](traefik-middlewares.md) -- Middleware Chains für Service-Zugriffskontrolle
- [Datenbank-Architektur](../architecture/database-architecture.md) -- PostgreSQL Shared Cluster
- [Service-Abhängigkeiten](../architecture/service-dependencies.md) -- Abhängigkeitsdiagramm
- [Linstor & DRBD](linstor-drbd.md) -- CSI-Volumes für persistenten Speicher
