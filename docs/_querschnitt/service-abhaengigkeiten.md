---
title: Service-Abhängigkeiten
description: Übersicht aller Service-Abhängigkeiten im Homelab
tags:
  - architecture
  - services
  - dependencies
---

# Service-Abhängigkeiten

## Übersicht

Dieses Diagramm zeigt, welche Services von welchen Infrastruktur-Komponenten und voneinander abhängen.

## Abhängigkeits-Diagramm

```d2
direction: down

Core: Core Infrastructure {
  style.stroke-dash: 4
  TRAEFIK: Traefik { style.border-radius: 8 }
  DNS: Pi-hole + Unbound { style.border-radius: 8 }
  CONSUL: Consul { style.border-radius: 8 }
  VAULT: Vault { style.border-radius: 8 }
  AUTHENTIK: Authentik { style.border-radius: 8 }
  PG: PostgreSQL 16 { shape: cylinder; style.border-radius: 8 }
  SMTP: SMTP Relay { style.border-radius: 8 }
  NFS: Synology NAS { shape: cylinder; style.border-radius: 8 }
}

Media: Media Stack {
  style.stroke-dash: 4
  JF: Jellyfin { style.border-radius: 8 }
  JS: Jellyseerr { style.border-radius: 8 }
  SONARR: Sonarr { style.border-radius: 8 }
  RADARR: Radarr { style.border-radius: 8 }
  PROWLARR: Prowlarr { style.border-radius: 8 }
  SAB: SABnzbd { style.border-radius: 8 }
  JSTAT: JellyStat { style.border-radius: 8 }
  MAINT: Maintainerr { style.border-radius: 8 }
  JANI: Janitorr { style.border-radius: 8 }
  STASH: Stash { style.border-radius: 8 }
  ABS: AudioBookShelf { style.border-radius: 8 }
  YTDL: YouTube-DL { style.border-radius: 8 }
  SYDL: Special-YT-DLP { style.border-radius: 8 }
  VG: Video-Grabber { style.border-radius: 8 }
}

Mon: Monitoring {
  style.stroke-dash: 4
  GRAFANA: Grafana { style.border-radius: 8 }
  LOKI: Loki { style.border-radius: 8 }
  INFLUX: InfluxDB { shape: cylinder; style.border-radius: 8 }
  ALLOY: Alloy { style.border-radius: 8 }
  UK: Uptime Kuma { style.border-radius: 8 }
  GATUS: Gatus { style.border-radius: 8 }
}

Prod: Productivity {
  style.stroke-dash: 4
  VW: Vaultwarden { style.border-radius: 8 }
  PL: Paperless { style.border-radius: 8 }
  TD: Tandoor { style.border-radius: 8 }
  GUA: Guacamole { style.border-radius: 8 }
  CD: ChangeDetection { style.border-radius: 8 }
  OBS: Obsidian LiveSync { style.border-radius: 8 }
  NOTIF: Notifiarr { style.border-radius: 8 }
  GITEA: Gitea { style.border-radius: 8 }
  N8N: n8n { style.border-radius: 8 }
  META: Metabase { style.border-radius: 8 }
  SOLID: solidtime { style.border-radius: 8 }
}

AI: AI / LLM {
  style.stroke-dash: 4
  OLLAMA: Ollama { style.border-radius: 8 }
  OWUI: Open-WebUI { style.border-radius: 8 }
  HOLLA: HolLama { style.border-radius: 8 }
}

IoT: IoT {
  style.stroke-dash: 4
  Z2M: Zigbee2MQTT { style.border-radius: 8 }
  MOSQ: Mosquitto { style.border-radius: 8 }
}

Core.AUTHENTIK -> Core.PG

Media.JF -> Core.AUTHENTIK: LDAP Bind
Media.SONARR -> Core.PG
Media.RADARR -> Core.PG
Media.PROWLARR -> Core.PG
Media.JS -> Core.PG
Media.JSTAT -> Core.PG
Media.JS -> Media.JF
Media.JSTAT -> Media.JF
Media.MAINT -> Media.JF
Media.SONARR -> Media.SAB
Media.RADARR -> Media.SAB
Media.SONARR -> Media.PROWLARR
Media.RADARR -> Media.PROWLARR
Media.JANI -> Media.SONARR
Media.JANI -> Media.RADARR
Media.VG -> Media.SYDL

Prod.VW -> Core.PG
Prod.PL -> Core.PG
Prod.TD -> Core.PG
Prod.GITEA -> Core.PG
Prod.N8N -> Core.PG
Prod.META -> Core.PG
Prod.SOLID -> Core.PG
Prod.VW -> Core.SMTP
Prod.PL -> AI.OLLAMA

Mon.GRAFANA -> Mon.INFLUX
Mon.GRAFANA -> Mon.LOKI
Mon.GRAFANA -> Core.PG
Mon.ALLOY -> Mon.LOKI

AI.OWUI -> AI.OLLAMA
AI.HOLLA -> AI.OLLAMA
Prod.N8N -> Prod.SOLID
IoT.Z2M -> IoT.MOSQ
Prod.NOTIF -> Media.SONARR
Prod.NOTIF -> Media.RADARR
```

## Abhängigkeits-Gruppen

### Alle Services hängen von diesen Komponenten ab

Jeder Service im Nomad Cluster ist implizit abhängig von:

- **Traefik** -- Reverse Proxy und TLS-Terminierung
- **Consul** -- Service Discovery (DNS und Health Checks)
- **Vault** -- Secret Management (Datenbank-Passwörter, API-Keys)
- **NFS** -- Persistenter Storage (`/nfs/docker/`)
- **DNS** -- Pi-hole für Namensauflösung

### PostgreSQL-abhängige Services

Diese Services starten erst nach einem erfolgreichen Health-Check gegen `postgres.service.consul:5432` (via `wait-for-postgres` Init-Task):

- Radarr, Sonarr, Prowlarr, Jellyseerr, JellyStat
- Vaultwarden, Paperless, Gitea, Tandoor
- solidtime, n8n, Metabase

### Authentik-geschützte Services

Alle Services hinter `intern-auth@file` oder `public-auth@file` benötigen Authentik für die Authentifizierung. Fällt Authentik aus, sind diese Services nicht zugänglich (ausser über Tailscale/intern mit `intern-noauth@file`).

### Media-Pipeline

```
Prowlarr (Indexer) --> Sonarr/Radarr (Management)
                              |
                        SABnzbd (Download)
                              |
                        Jellyfin (Playback)
                              |
                   Jellyseerr (Requests) <-- Benutzer
```

Janitorr und Maintainerr automatisieren die Bereinigung (Janitorr löscht, Maintainerr verwaltet Sammlungen).

### Monitoring-Pipeline

```
Alle Container --> Alloy (Log-Collector) --> Loki (Log-Storage)
                                                    |
                                              Grafana (Dashboards)
                                                    |
                                              InfluxDB (Metriken)
```

Uptime Kuma und Gatus überwachen Service-Verfügbarkeit unabhängig.

## Verwandte Seiten

- [Infrastruktur-Übersicht](../index.md) -- Vollständige Service-Liste mit URLs
- [Datenbank-Architektur](./datenbank-architektur.md) -- PostgreSQL Cluster und Service-Zuordnung
- [Traefik Middlewares](../traefik/referenz.md) -- Middleware Chains für Authentifizierung
- [Authentik](../authentik/index.md) -- Identity Provider und SSO
- [Nomad Architektur](../nomad/index.md) -- Job-Scheduling und Constraints
