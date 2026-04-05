---
title: Web-Interfaces
description: Alle Web-UIs mit URLs und Beschreibungen
tags:
  - referenz
  - web-ui
  - urls
---

# Web-Interfaces

::: info Single Source of Truth
Diese Seite ist die kanonische Liste aller Web-Interfaces im Homelab. Zugangsdaten sind in [Credentials](./credentials.md) dokumentiert.
:::

## Management

| Service | URL | Beschreibung |
| :--- | :--- | :--- |
| Proxmox pve00 | `https://10.0.2.40:8006` | Proxmox Web-UI |
| Proxmox pve01 | `https://10.0.2.41:8006` | Proxmox Web-UI |
| Proxmox pve02 | `https://10.0.2.42:8006` | Proxmox Web-UI |
| PBS | `https://10.0.2.50:8007` | Proxmox Backup Server |
| Datacenter Manager | `https://10.0.2.60:8443` | Proxmox Datacenter Manager |
| Nomad UI | `http://10.0.2.104:4646` | Job-Orchestrierung (ACL Token erforderlich) |
| Consul UI | `http://10.0.2.104:8500` | Service Discovery und KV Store |
| UniFi Network | `https://10.0.0.1` | Lokaler Zugang, UI.com SSO |

## Core

| Service | URL | Beschreibung |
| :--- | :--- | :--- |
| Traefik | `https://traefik.ackermannprivat.ch` | Reverse Proxy Dashboard |
| Authentik | `https://auth.ackermannprivat.ch` | Identity Provider, SSO/OIDC |
| Wiki | `https://wiki.ackermannprivat.ch` | Homelab-Dokumentation |
| Gitea | `https://gitea.ackermannprivat.ch` | Git Server |
| DbGate | `https://dbgate.ackermannprivat.ch` | Datenbank-Verwaltung |

## Media

| Service | URL | Beschreibung |
| :--- | :--- | :--- |
| Jellyfin | `https://watch.ackermannprivat.ch` | Media Server |
| Jellyseerr | `https://wish.ackermannprivat.ch` | Media Requests |
| Sonarr | `https://sonarr.ackermannprivat.ch` | Serien Management |
| Radarr | `https://radarr.ackermannprivat.ch` | Film Management |
| Prowlarr | `https://prowlarr.ackermannprivat.ch` | Indexer Management |
| SABnzbd | `https://sabnzbd.ackermannprivat.ch` | Usenet Downloader |
| AudioBookShelf | `https://audio.ackermannprivat.ch` | Hörbücher |
| LazyLibrarian | `https://lazylibrarian.ackermannprivat.ch` | E-Book Management |
| Stash | `https://s.ackermannprivat.ch` | Media Organizer |
| JellyStat | `https://jellystat.ackermannprivat.ch` | Jellyfin Statistiken |
| YouTube-DL | `https://download.ackermannprivat.ch` | Video Download |
| Video-Grabber | `https://grab.ackermannprivat.ch` | Video Download Frontend |
| Handbrake | `https://handbrake.ackermannprivat.ch` | Video Transcoding |

## Monitoring

| Service | URL | Beschreibung |
| :--- | :--- | :--- |
| Grafana | `https://graf.ackermannprivat.ch` | Dashboards und Metriken |
| Uptime Kuma | `https://uptime.ackermannprivat.ch` | Availability Monitoring |
| Gatus | `https://status.ackermannprivat.ch` | Status Page (öffentlich) |
| CheckMK | `https://monitoring.ackermannprivat.ch` | Infrastructure Monitoring |
| Loki | `https://loki.ackermannprivat.ch` | Log-Aggregation |
| InfluxDB | `https://influx.ackermannprivat.ch` | Zeitreihen-Datenbank |

## Produktivität

| Service | URL | Beschreibung |
| :--- | :--- | :--- |
| Paperless | `https://paperless.ackermannprivat.ch` | Dokumentenmanagement |
| Vaultwarden | `https://p.ackermannprivat.ch` | Passwort Manager |
| Tandoor | `https://tandoor.ackermannprivat.ch` | Rezepte |
| solidtime | `https://time.ackermannprivat.ch` | Zeiterfassung |
| Kimai | `https://kimai.ackermannprivat.ch` | Zeiterfassung Backup |
| n8n | `https://n8n.ackermannprivat.ch` | Workflow Automation |
| Guacamole | `https://remote.ackermannprivat.ch` | Remote Desktop Gateway |
| ChangeDetection | `https://change.ackermannprivat.ch` | Website-Änderungsüberwachung |
| Obsidian LiveSync | `https://obsidian-sync.ackermannprivat.ch` | Obsidian Synchronisation |
| Notifiarr | `https://notifiarr.ackermannprivat.ch` | Benachrichtigungsservice |
| Metabase | `https://metabase.ackermannprivat.ch` | Business Intelligence |
| Czkawka | `https://double.ackermannprivat.ch` | Duplikat-Finder |
| MeshCommander | `https://mesh.ackermannprivat.ch` | Intel AMT Management |

## AI / LLM

| Service | URL | Beschreibung |
| :--- | :--- | :--- |
| Ollama | `https://ollama.ackermannprivat.ch` | LLM Backend |
| Open-WebUI | `https://chat.ackermannprivat.ch` | LLM Chat Interface |
| HolLama | `https://hollama.ackermannprivat.ch` | Alternative LLM UI |

## Dashboards

| Service | URL | Beschreibung |
| :--- | :--- | :--- |
| Flame | `https://welcome.ackermannprivat.ch` | Startseite extern |
| Homepage | `https://intra.ackermannprivat.ch` | Dashboard intern |

## Verwandte Seiten

- [Hosts und IPs](./hosts-und-ips.md) -- IP-Adressen aller Systeme
- [Traefik](../traefik/) -- Reverse Proxy und Routing-Konfiguration
- [Credentials](./credentials.md) -- Speicherorte von Zugangsdaten
