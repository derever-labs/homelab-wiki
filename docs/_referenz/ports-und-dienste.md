---
title: Ports und Dienste
description: Port-Zuordnung aller Services und Infrastruktur-Komponenten
tags:
  - referenz
  - netzwerk
  - ports
---

# Ports und Dienste

::: info Single Source of Truth
Diese Seite ist die kanonische Quelle für alle Port-Zuordnungen. Andere Seiten verlinken hierher, anstatt Ports zu duplizieren.
:::

## Infrastruktur

| Port | Protokoll | Dienst | Bemerkung |
| :--- | :--- | :--- | :--- |
| 53 | TCP/UDP | DNS (Pi-hole) | lxc-dns-01, lxc-dns-02 |
| 2049 | TCP | NFS | Synology NAS |
| 8006 | TCP | Proxmox Web-UI | Auf jedem Proxmox-Node |
| 8007 | TCP | PBS Web-UI | Proxmox Backup Server |
| 8443 | TCP | PDM Web-UI | Proxmox Datacenter Manager |

## HashiCorp Stack

| Port | Protokoll | Dienst | Bemerkung |
| :--- | :--- | :--- | :--- |
| 4646 | TCP | Nomad HTTP API / UI | Auf allen Server-Nodes |
| 4647 | TCP | Nomad RPC | Interne Cluster-Kommunikation |
| 4648 | TCP/UDP | Nomad Serf | Gossip-Protokoll |
| 8200 | TCP | Vault HTTP API / UI | Auf allen Server-Nodes |
| 8201 | TCP | Vault Cluster | Interne Replikation |
| 8500 | TCP | Consul HTTP API / UI | Auf allen Nodes |
| 8600 | TCP/UDP | Consul DNS | Service Discovery DNS Interface |
| 8301 | TCP/UDP | Consul Serf LAN | Gossip innerhalb Datacenter |
| 8302 | TCP/UDP | Consul Serf WAN | Gossip zwischen Datacentern |
| 8300 | TCP | Consul Server RPC | Client-zu-Server Kommunikation |

## UniFi

| Port | Protokoll | Dienst | Bemerkung |
| :--- | :--- | :--- | :--- |
| 22 | TCP | SSH | UDM Pro, root, keyboard-interactive |
| 443 | TCP | UniFi OS Web-UI | UDM Pro |
| 3478 | UDP | STUN | UniFi |
| 6789 | TCP | Speed Test | UniFi |
| 8080 | TCP | Device Inform | UniFi Controller |
| 10001 | UDP | Device Discovery | UniFi |

## Datenbanken

| Port | Protokoll | Dienst | Bemerkung |
| :--- | :--- | :--- | :--- |
| 5432 | TCP | PostgreSQL | Shared Cluster via `postgres.service.consul` |

## Ingress

| Port | Protokoll | Dienst | Bemerkung |
| :--- | :--- | :--- | :--- |
| 80 | TCP | Traefik HTTP | Weiterleitung auf HTTPS |
| 443 | TCP | Traefik HTTPS | Reverse Proxy Eingang |

## Nomad Jobs -- Statische Ports

::: warning Port-Kollisionen vermeiden
Alle hier gelisteten Ports sind statisch im Host-Netzwerk gebunden. Vor dem Hinzufügen neuer statischer Ports diese Liste prüfen. Services hinter Traefik können alternativ dynamische Ports mit Consul Service Discovery nutzen. Einige Ports bleiben bewusst statisch, weil sie direkt adressiert werden -- etwa Ollama (`11434`, von mehreren AI-Jobs referenziert) und Jellyfin (`8096`, von externen Clients wie Infuse/Apple TV direkt angesprochen).
:::

### Datenbanken und Infrastruktur

| Port | Protokoll | Dienst | Nomad Job | Bemerkung |
| :--- | :--- | :--- | :--- | :--- |
| 5000 | TCP | Container Registry | `zot-registry` | OCI Registry |
| 3306 | TCP | MariaDB | `mariadb-drbd` | DRBD-Volume, `mariadb.service.consul` |
| 5432 | TCP | PostgreSQL | `postgres` | Shared Cluster, `postgres.service.consul` |
| 16379 | TCP | Redis | `paperless` | Ephemeral, nur Task Queue |

### Identity und Auth

| Port | Protokoll | Dienst | Nomad Job | Bemerkung |
| :--- | :--- | :--- | :--- | :--- |
| 389 | TCP | OpenLDAP | `open-ldap` | LDAP-Verzeichnisdienst |
| 3389 | TCP | LDAP Outpost | `authentik` | Achtung: gleicher Port wie RDP |
| 9010 | TCP | Authentik Proxy | `authentik` | Forward Auth Outpost |
| 9300 | TCP | Authentik Metrics Server | `authentik` | Telegraf via Consul DNS |
| 9301 | TCP | Authentik Metrics Proxy | `authentik` | Telegraf via Consul DNS |
| 9303 | TCP | Authentik Metrics LDAP | `authentik` | Telegraf via Consul DNS |

### Services

| Port | Protokoll | Dienst | Nomad Job | Bemerkung |
| :--- | :--- | :--- | :--- | :--- |
| 25 | TCP | SMTP Relay | `smtp-relay` | Ausgehend |
| 1883 | TCP | MQTT | `mosquitto` | IoT Message Broker |
| 2222 | TCP | Gitea SSH | `gitea` | Git über SSH |
| 3002 | TCP | DbGate | `dbgate` | DB-Manager, hinter Traefik |
| 3003 | TCP | Gitea HTTP | `gitea` | Web-UI, hinter Traefik |
| 5984 | TCP | Obsidian LiveSync | `obsidian-livesync` | CouchDB Sync |
| 8000 | TCP | Paperless Web | `paperless` | DMS, hinter Traefik |
| 8081 | TCP | Paperless-GPT | `paperless` | AI-Tagging, hinter Traefik |
| 9001 | TCP | MQTT WebSocket | `mosquitto` | WebSocket Interface |
| 9095 | TCP | Telegram Relay | `telegram-relay` | Benachrichtigungs-Relay |
| 11434 | TCP | Ollama API | `ollama` | LLM Inference |

### Media

| Port | Protokoll | Dienst | Nomad Job | Bemerkung |
| :--- | :--- | :--- | :--- | :--- |
| 3000 | TCP | Paperless-AI | `paperless` | AI-Assistent, hinter Traefik |
| 3033 | TCP | yt-dlp | `special-yt-dlp` | Download UI, hinter Traefik |
| 5055 | TCP | Jellyseerr | `jellyseerr` | Request Management, hinter Traefik |
| 5100 | TCP | Suggestarr | `suggestarr` | Empfehlungen, hinter Traefik |
| 5667 | TCP | SABnzbd | `sabnzbd` | Usenet Downloader, hinter Traefik |
| 7878 | TCP | Radarr | `radarr` | Film-Management, hinter Traefik |
| 8096 | TCP | Jellyfin | `jellyfin` | Media Server |
| 8098 | TCP | Stash-Jellyfin-Proxy | `stash-jellyfin-proxy` | Jellyfin API Proxy |
| 8989 | TCP | Sonarr | `sonarr` | Serien-Management, hinter Traefik |
| 9696 | TCP | Prowlarr | `prowlarr` | Indexer-Manager, hinter Traefik |

### Monitoring

| Port | Protokoll | Dienst | Nomad Job | Bemerkung |
| :--- | :--- | :--- | :--- | :--- |
| 1514 | TCP | Syslog | `alloy` | Log-Collector (bridge mode) |
| 3001 | TCP | Uptime Kuma | `uptime-kuma` | Monitoring, hinter Traefik |
| 3100 | TCP | Loki | `loki` | Log-Aggregation |
| 8080 | TCP | Gatus | `gatus` | Health Dashboard, hinter Traefik |
| 8086 | TCP | InfluxDB | `influxdb` | Metriken-Datenbank |

## Verwandte Seiten

- [Hosts und IPs](./hosts-und-ips.md) -- IP-Adressen aller Systeme
- [Web-Interfaces](./web-interfaces.md) -- URLs aller Web-UIs
