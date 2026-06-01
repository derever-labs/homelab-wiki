---
title: Nomad Jobs
description: Verzeichnisstruktur und Übersicht aller Nomad Jobs
tags:
  - referenz
  - nomad
  - jobs
---

# Nomad Jobs

::: info Single Source of Truth
Diese Seite ist die kanonische Übersicht aller Nomad Jobs. Job-Definitionen liegen im Repository `nomad-jobs/` unter `/nfs/nomad/jobs/` auf den Nodes.
:::

## Verzeichnisstruktur

| Verzeichnis | Jobs |
| :--- | :--- |
| batch-jobs/ | Renovate, Renovate Backlog Watchdog, Docker Prune, PostgreSQL Backup, InfluxDB Backup, MariaDB Backup, Vault Backup, Consul Snapshot, Nomad Snapshot, CSI GC, DRBD Verify, Zot Verify, fstrim, DNS Performance, Authentik Audit, Daily Cleanup, Daily Container Restart, Daily Restart Jellyfin, Jellyfin Adult Sync, Reddit Downloader, Reddit Gallery DL, Reddit Gallery DL Backfill, PH Downloader |
| databases/ | PostgreSQL (DRBD), MariaDB (DRBD), MariaDB Setup, DbGate, OpenLDAP (Legacy) |
| identity/ | Authentik |
| infrastructure/ | SMTP Relay, Nebula Sync, Zot Registry, GitHub Runner |
| media/ | Jellyfin, Sonarr, Radarr, Prowlarr, SABnzbd, Jellyseerr, Janitorr, JellyStat, Stash, Stash-Secure, Stash-Jellyfin-Proxy, Suggestarr, AudioBookShelf, LazyLibrarian, YouTube-DL, Special-YouTube-DL, Special-YT-DLP, Video-Grabber |
| monitoring/ | Grafana, InfluxDB, Loki, Uptime Kuma, Gatus, Keep, iperf3-to-InfluxDB |
| services/ | VitePress Wiki, Paperless (simple), Vaultwarden, Ollama, Open-WebUI, Flame, Flame-Intra, Homepage-Intra, Guacamole, Tandoor, ChangeDetection, Notifiarr, Obsidian-LiveSync, Mosquitto, Zigbee2MQTT, Gitea, Metabase, solidtime, n8n, MeshCommander, PHDler Telegram Bot, Telegram Relay, PocketBase, Directus Gravel, Immo-Monitor, Immoscraper, Immoscraper Weekly |
| system/ | Alloy (Log-Collector), Linstor CSI |
| volumes/ | CSI-Volume-Spezifikationen (.hcl) |

## Abhängigkeiten

Alle Nomad Jobs setzen folgende Infrastruktur voraus:

- **NFS Storage** -- Persistente Daten unter `/nfs/docker/`
- **Docker** -- Alle Jobs nutzen den Docker Task Driver
- **Consul** -- Service Discovery via `*.service.consul`
- **Vault** -- Secret Injection via Workload Identity (JWT)
- **PostgreSQL** -- Viele Services nutzen den Shared Cluster (siehe [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md))

## Job-Konfigurationsmuster

- Docker als Task Driver
- Volumes von `/nfs/docker/` für persistente Daten
- Bridge Networking mit Port Mappings
- Health Checks wo anwendbar
- Resource Limits gesetzt
- PostgreSQL-abhängige Jobs haben `wait-for-postgres` Init-Task

## Deprecated Jobs

| Datei | Ersetzt durch | Grund |
| :--- | :--- | :--- |
| `services/paperless-workload.nomad.deprecated` | `services/paperless-simple.nomad` | Vereinfachtes Single-Container-Deployment |
| `media/handbrake.nomad.deprecated` | -- | Transkodierung nicht mehr aktiv betrieben |
| `system/linstor-gui.nomad.deprecated` | -- | Linstor-Verwaltung erfolgt per CLI |

## Verwandte Seiten

- [Nomad](../nomad/) -- Nomad-Plattform und Cluster-Architektur
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster und Service-Zuordnung
