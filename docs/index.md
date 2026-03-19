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
| [Vault](./vault/) | Zentrale Secrets-Verwaltung |
| [Nomad](./nomad/) | Container- und Job-Orchestrierung |
| [Consul](./consul/) | Service Discovery und Health Checks |
| [Traefik](./traefik/) | Reverse Proxy, SSL-Terminierung |
| [DNS](./dns/) | Pi-hole v6, Unbound, Consul-Forwarding |
| [Netzwerk](./netzwerk/) | VLANs, Subnets, Routing |

## Storage und Backup

| Thema | Beschreibung |
| :--- | :--- |
| [NAS Storage](./nas-storage/) | Synology NFS-Exports und MinIO S3 |
| [Linstor Storage](./linstor-storage/) | DRBD-repliziertes Block-Storage (CSI) |
| [Backup](./backup/) | Backup-Strategie, PBS, pg_dumpall |

## Core Services

| Thema | Beschreibung |
| :--- | :--- |
| [LDAP](./ldap/) | OpenLDAP Benutzerverzeichnis |
| [Docker Registry](./docker-registry/) | Zot OCI Registry |
| [SMTP Relay](./smtp-relay/) | Mail-Relay für Services |
| [Wiki](./vitepress-wiki/) | VitePress Dokumentations-Deployment |
| [Security](./security/) | CrowdSec, Keycloak, OAuth2-Proxy |
| [DbGate](./dbgate/) | Datenbank-Verwaltungs-UI |

## Media

| Thema | Beschreibung |
| :--- | :--- |
| [Jellyfin](./jellyfin/) | Media Server |
| [Arr-Stack](./arr-stack/) | Sonarr, Radarr, Prowlarr, SABnzbd |
| [Jellyseerr](./jellyseerr/) | Media Requests |
| [Content Pipeline](./content-pipeline/) | Download-Automatisierung |
| [Stash](./stash/) | Media Organizer |
| [AudioBookShelf](./audiobookshelf/) | Hörbücher und E-Books |
| [Video Download](./video-download/) | YouTube-DL, Video-Grabber |
| [Media Tools](./media-tools/) | Handbrake, Janitorr, Maintainerr |

## Monitoring

| Thema | Beschreibung |
| :--- | :--- |
| [Monitoring Stack](./monitoring/) | Grafana, InfluxDB, Loki, Alloy |
| [Gatus](./gatus/) | Öffentliche Status Page |
| [CheckMK](./checkmk/) | Infrastructure Monitoring |
| [CrowdSec](./crowdsec/) | Intrusion Prevention |
| [Dashboards](./dashboards/) | Flame, Homepage |

## Produktivität

| Thema | Beschreibung |
| :--- | :--- |
| [Paperless](./paperless/) | Dokumentenmanagement |
| [Vaultwarden](./vaultwarden/) | Passwort Manager |
| [Gitea](./gitea/) | Git Server |
| [n8n](./n8n/) | Workflow Automation |
| [Guacamole](./guacamole/) | Remote Desktop Gateway |
| [Tandoor](./tandoor/) | Rezeptverwaltung |
| [ChangeDetection](./changedetection/) | Website-Änderungsüberwachung |
| [Obsidian LiveSync](./obsidian-livesync/) | Obsidian Synchronisation |
| [Notifiarr](./notifiarr/) | Benachrichtigungsservice |
| [Metabase](./metabase/) | Business Intelligence |
| [Zeiterfassung](./zeiterfassung/) | solidtime und Kimai |
| [Immobilien-Monitoring](./immobilien-monitoring/) | Immobilien-Überwachung |
| [Utility Tools](./utility-tools/) | Czkawka, MeshCommander, Filebrowser |

## IoT und AI

| Thema | Beschreibung |
| :--- | :--- |
| [IoT Stack](./iot-stack/) | Home Assistant, Zigbee2MQTT, Mosquitto |
| [LLM Stack](./llm-stack/) | Ollama, Open-WebUI, HolLama |

## Querschnittsthemen

| Thema | Beschreibung |
| :--- | :--- |
| [Cluster-Restart](./_querschnitt/cluster-restart.md) | Runbook für Cluster-Neustart |
| [Smart Shutdown](./_querschnitt/smart-shutdown.md) | Graceful Drain für Nomad und Linstor |
| [Batch Jobs](./_querschnitt/batch-jobs.md) | Periodische Aufgaben (Watchtower, Backups, Cleanup) |
| [Datenbank-Architektur](./_querschnitt/datenbank-architektur.md) | PostgreSQL Shared Cluster, DRBD |
| [Service-Abhängigkeiten](./_querschnitt/service-abhaengigkeiten.md) | Abhängigkeitsdiagramm aller Services |
| [Datenstrategie](./_querschnitt/datenstrategie.md) | Speicher-Ebenen, Replikation, Backups |
