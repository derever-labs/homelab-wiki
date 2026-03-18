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

```mermaid
flowchart TB
    subgraph Core["Core Infrastructure"]
        TRAEFIK:::entry["Traefik"]
        DNS:::entry["Pi-hole + Unbound"]
        CONSUL:::accent["Consul"]
        VAULT:::accent["Vault"]
        KEYCLOAK:::entry["Keycloak"]
        LDAP:::svc["OpenLDAP"]
        PG:::db["PostgreSQL 16"]
        SMTP:::svc["SMTP Relay"]
        NFS:::db["Synology NAS"]
    end

    subgraph Media["Media Stack"]
        JF:::svc["Jellyfin"]
        JS:::svc["Jellyseerr"]
        SONARR:::svc["Sonarr"]
        RADARR:::svc["Radarr"]
        PROWLARR:::svc["Prowlarr"]
        SAB:::svc["SABnzbd"]
        JSTAT:::svc["JellyStat"]
        MAINT:::svc["Maintainerr"]
        JANI:::svc["Janitorr"]
        STASH:::svc["Stash"]
        ABS:::svc["AudioBookShelf"]
        YTDL:::svc["YouTube-DL"]
        SYDL:::svc["Special-YT-DLP"]
        VG:::svc["Video-Grabber"]
    end

    subgraph Mon["Monitoring"]
        GRAFANA:::svc["Grafana"]
        LOKI:::svc["Loki"]
        INFLUX:::db["InfluxDB"]
        ALLOY:::svc["Alloy"]
        UK:::svc["Uptime Kuma"]
        GATUS:::svc["Gatus"]
    end

    subgraph Prod["Productivity"]
        VW:::svc["Vaultwarden"]
        PL:::svc["Paperless"]
        TD:::svc["Tandoor"]
        GUA:::svc["Guacamole"]
        CD:::svc["ChangeDetection"]
        OBS:::svc["Obsidian LiveSync"]
        NOTIF:::svc["Notifiarr"]
        GITEA:::svc["Gitea"]
        N8N:::svc["n8n"]
        META:::svc["Metabase"]
        SOLID:::svc["solidtime"]
    end

    subgraph AI["AI / LLM"]
        OLLAMA:::svc["Ollama"]
        OWUI:::svc["Open-WebUI"]
        HOLLA:::svc["HolLama"]
    end

    subgraph IoT["IoT"]
        Z2M:::svc["Zigbee2MQTT"]
        MOSQ:::svc["Mosquitto"]
    end

    KEYCLOAK --> LDAP

    SONARR --> PG
    RADARR --> PG
    PROWLARR --> PG
    JS --> PG
    JSTAT --> PG
    JS --> JF
    JSTAT --> JF
    MAINT --> JF
    SONARR --> SAB
    RADARR --> SAB
    SONARR --> PROWLARR
    RADARR --> PROWLARR
    JANI --> SONARR
    JANI --> RADARR
    VG --> SYDL

    VW --> PG
    PL --> PG
    TD --> PG
    GITEA --> PG
    N8N --> PG
    META --> PG
    SOLID --> PG
    VW --> SMTP
    PL --> OLLAMA

    GRAFANA --> INFLUX
    GRAFANA --> LOKI
    GRAFANA --> PG
    ALLOY --> LOKI

    OWUI --> OLLAMA
    HOLLA --> OLLAMA
    N8N --> SOLID
    Z2M --> MOSQ
    NOTIF --> SONARR
    NOTIF --> RADARR

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
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

### Keycloak/OAuth2-geschützte Services

Alle Services hinter einer `*-chain-v2@file` Middleware benötigen Keycloak für die Authentifizierung. Fällt Keycloak aus, sind diese Services nicht zugänglich (ausser über Tailscale/intern mit `intern-chain@file`).

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

Janitorr und Maintainerr automatisieren die Bereinigung (Janitorr loescht, Maintainerr verwaltet Sammlungen).

### Monitoring-Pipeline

```
Alle Container --> Alloy (Log-Collector) --> Loki (Log-Storage)
                                                    |
                                              Grafana (Dashboards)
                                                    |
                                              InfluxDB (Metriken)
```

Uptime Kuma und Gatus überwachen Service-Verfügbarkeit unabhängig.
