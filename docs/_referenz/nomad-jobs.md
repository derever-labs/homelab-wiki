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
| batch-jobs/ | Renovate, Docker Prune, PostgreSQL Backup, Daily Cleanup, Daily Reboot, Daily Restart, Daily Restart Jellyfin, Reddit Downloader, PH Downloader |
| databases/ | PostgreSQL (DRBD), DbGate, OpenLDAP (Legacy, Abschaltung offen) |
| infrastructure/ | SMTP Relay, Filebrowser, Zot Registry, GitHub Runner |
| media/ | Jellyfin, Sonarr, Radarr, Prowlarr, SABnzbd, Jellyseerr, Janitorr, JellyStat, Stash, Stash-Secure, Handbrake, AudioBookShelf, LazyLibrarian, YouTube-DL, Special-YouTube-DL, Special-YT-DLP, Video-Grabber |
| monitoring/ | Grafana, InfluxDB, Loki, Uptime Kuma, Gatus |
| services/ | VitePress Wiki, Paperless (simple), Vaultwarden, Ollama, Open-WebUI, HolLama, Flame, Flame-Intra, Homepage-Intra, Guacamole, Tandoor, ChangeDetection, Notifiarr, Czkawka, Obsidian-LiveSync, Mosquitto, Zigbee2MQTT, Gitea, Metabase, solidtime, Kimai, n8n, MeshCommander, PHDler Telegram Bot, Swissbau Viewer |
| system/ | Alloy (Log-Collector), Linstor CSI, Linstor GUI |
| test/ | Linstor Volume Test |

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
| `services/paperless-workload.nomad` | `services/paperless-simple.nomad` | Vereinfachtes Single-Container-Deployment |

## Verwandte Seiten

- [Nomad](../nomad/) -- Nomad-Plattform und Cluster-Architektur
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster und Service-Zuordnung
