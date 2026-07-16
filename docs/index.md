---
title: Homelab Wiki
description: Zentrale Dokumentation der Homelab-Infrastruktur
tags:
  - index
  - home
  - overview
---

# Homelab Wiki

Willkommen in der zentralen Wissensdatenbank für das Homelab. Diese Dokumentation umfasst die Architektur, die Infrastruktur-Komponenten und alle laufenden Services.

## Schnelleinstieg

| Ressource | Beschreibung |
| :--- | :--- |
| [Hosts und IPs](./_referenz/hosts-und-ips.md) | Alle IPs im Homelab |
| [Web-Interfaces](./_referenz/web-interfaces.md) | URLs aller Web-UIs |
| [Credentials](./_referenz/credentials.md) | Wo Passwörter und Tokens gespeichert sind |
| [SSH-Zugang](./_referenz/ssh-zugang.md) | SSH-Zugänge zu allen Systemen |
| [Nomad Jobs](./_referenz/nomad-jobs.md) | Job-Verzeichnis und Übersicht |
| [Globale Referenz](./_referenz/) | Alle Referenzseiten im Überblick |

## Kern-Infrastruktur

| Thema | Beschreibung |
| :--- | :--- |
| [Proxmox](./proxmox/) | Virtualisierungsplattform (3 Nodes, HA-Cluster) |
| [Vault](./plattform/vault/) | Zentrale Secrets-Verwaltung |
| [Nomad](./plattform/nomad/) | Container- und Job-Orchestrierung |
| [Consul](./plattform/consul/) | Service Discovery und Health Checks |
| [Traefik](./edge/traefik/) | Reverse Proxy, SSL-Terminierung |
| [DNS](./dns/) | Pi-hole, Unbound, Consul-Forwarding |
| [Netzwerk](./netzwerk/) | VLANs, Subnets, Routing |
| [UniFi](./unifi/) | Netzwerk-Hardware, Access Points, VLAN-Segmentierung |
| [USV](./ups/) | Unterbrechungsfreie Stromversorgung, NUT Server |

## Storage und Backup

| Thema | Beschreibung |
| :--- | :--- |
| [NAS Storage](./storage/nas/) | Synology NFS-Exports und Garage S3 |
| [Linstor Storage](./storage/linstor/) | DRBD-repliziertes Block-Storage (CSI) |
| [Backup](./storage/backup/) | Backup-Strategie, PBS, pg_dumpall |

## Kerndienste

| Thema | Beschreibung |
| :--- | :--- |
| [Authentik](./edge/authentik/) | Identity Provider, SSO, ForwardAuth, OIDC |
| [LDAP im Homelab](./edge/ldap.md) | Authentik als Identity Store, LDAP Outpost für Jellyfin |
| [Docker Registry](./plattform/docker-registry/) | Zot OCI Registry |
| [SMTP Relay](./smtp-relay/) | Mail-Relay für Services |
| [Wiki](./vitepress-wiki/) | VitePress Dokumentations-Deployment |
| [Security](./security/) | CrowdSec, Authentik, Zugriffskontrolle |
| [DbGate](./dbgate/) | Datenbank-Verwaltungs-UI |

## Media

| Thema | Beschreibung |
| :--- | :--- |
| [Jellyfin](./medien/jellyfin/) | Media Server |
| [Arr-Stack](./medien/arr-stack/) | Sonarr, Radarr, Prowlarr, SABnzbd |
| [Jellyseerr](./medien/jellyseerr.md) | Media Requests |
| [Content Pipeline](./medien/content-pipeline/) | Download-Automatisierung |
| [Stash](./stash/) | Media Organizer |
| [AudioBookShelf](./medien/audiobookshelf.md) | Hörbücher und E-Books |
| [Video Download](./video-download/) | YouTube-DL, Video-Grabber |
| [Media Tools](./medien/media-tools.md) | Jellystat, Handbrake, LazyLibrarian, Profilarr |
| [SuggestArr](./suggestarr/) | AI-Empfehlungen für Jellyfin via Jellyseerr |

## Monitoring

| Thema | Beschreibung |
| :--- | :--- |
| [Monitoring Stack](./monitoring/) | Grafana, InfluxDB, Loki, Alloy |
| [CheckMK](./monitoring/checkmk/) | Infrastructure Monitoring |
| [CrowdSec](./edge/crowdsec/) | Intrusion Prevention |
| [Dashboards](./dashboards/) | Flame, Homepage |
| [Uptime Kuma](./monitoring/uptime-kuma/) | Interne Verfügbarkeits-Checks und Push-Monitore |
| [Synology NAS Monitoring](./synology-monitoring/) | CheckMK-Hardware-Health, lokaler Telegraf, Grafana NAS-Dashboard |

## Produktivität

| Thema | Beschreibung |
| :--- | :--- |
| [Paperless](./paperless/) | Dokumentenmanagement |
| [Vaultwarden](./vaultwarden/) | Passwort Manager |
| [Gitea](./gitea/) | Git Server |
| [n8n](./n8n/) | Workflow Automation |
| [Tandoor](./tandoor/) | Rezeptverwaltung |
| [ChangeDetection](./changedetection/) | Website-Änderungsüberwachung |
| [Obsidian LiveSync](./obsidian-livesync/) | Obsidian Synchronisation |
| [Metabase](./metabase/) | Business Intelligence |
| [Zeiterfassung](./zeiterfassung/) | solidtime und Kimai |
| [Immobilien-Monitoring](./immobilien-monitoring/) | Immobilien-Überwachung |
| [Directus Gravel](./directus-gravel/) | Headless CMS für Gravel-Bike-Recherche |
| [Utility Tools](./utility-tools/) | Czkawka, MeshCommander, Filebrowser |

## IoT und AI

| Thema | Beschreibung |
| :--- | :--- |
| [IoT Stack](./smart-home/iot-stack/) | Home Assistant, Zigbee2MQTT, Mosquitto |
| [LLM Stack](./llm-stack/) | Ollama, Open-WebUI, HolLama |
| [Claude Code](./claude-code/) | Claude-Agent-Setup, MCP-Server, Skills |
| [Secrets (Claude-Agent)](./secrets/) | PRIVAT-Agent-Vault-Struktur für Claude |

## Querschnittsthemen

| Thema | Beschreibung |
| :--- | :--- |
| [Cluster-Restart](./_querschnitt/cluster-restart.md) | Runbook für Cluster-Neustart |
| [Smart Shutdown](./_querschnitt/smart-shutdown.md) | Graceful Drain für Nomad und Linstor |
| [Batch Jobs](./_querschnitt/batch-jobs.md) | Periodische Aufgaben (Renovate, Backups, Cleanup) |
| [Datenbank-Architektur](./_querschnitt/datenbank-architektur.md) | PostgreSQL Shared Cluster, DRBD |
| [Service-Abhängigkeiten](./_querschnitt/service-abhaengigkeiten.md) | Abhängigkeitsdiagramm aller Services |
| [Datenstrategie](./_querschnitt/datenstrategie.md) | Speicher-Ebenen, Replikation, Backups |

## Verwandte Seiten

- [Wiki-Richtlinien](./wiki-richtlinien.md) -- Regeln und Konventionen für diese Dokumentation
- [Globale Referenz](./_referenz/) -- IP-Adressen, Ports, Credentials, Hardware
- [Querschnittsthemen](./_querschnitt/) -- Systemübergreifende Runbooks und Architektur
