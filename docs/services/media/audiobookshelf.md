---
title: Audiobookshelf
description: Selbstgehosteter Server für Hörbücher und Podcasts
tags:
  - service
  - media
  - nomad
---

# Audiobookshelf

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [audio.ackermannprivat.ch](https://audio.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`media/audiobookshelf.nomad`) |
| **Image** | `ghcr.io/advplyr/audiobookshelf:latest` |
| **Storage** | NFS `/nfs/docker/audiobookshelf/` (Config, Metadata) |
| **Mediathek** | NFS `/nfs/jellyfin/media/books/` |
| **Auth** | Intern: `intern-chain@file` / Extern: `public-admin-chain-v2@file` |
| **Consul Service** | `audiobookshelf` |

## Rolle im Stack

Audiobookshelf ist der zentrale Server für Hörbücher und Podcasts. Die Mediathek liegt auf dem gleichen NFS-Share wie die Jellyfin-Bibliothek (`/nfs/jellyfin/media/books/`), wird aber eigenständig verwaltet. Im Gegensatz zu Jellyfin bietet Audiobookshelf spezialisierte Features wie Kapitel-Navigation, Lesezeichen und Fortschrittsverfolgung über mehrere Geräte.

## Architektur

```mermaid
flowchart LR
    subgraph Client["Clients"]
        APP:::entry["Audiobookshelf App<br>(iOS/Android)"]
        WEB:::entry["Web-UI"]
    end

    subgraph Traefik["Traefik (10.0.2.1)"]
        INT:::svc["Router: intern<br>intern-chain"]
        EXT:::svc["Router: extern<br>public-admin-chain-v2"]
    end

    subgraph Nomad["Nomad Cluster"]
        ABS:::accent["Audiobookshelf"]
    end

    subgraph NFS["NAS (10.0.0.200)"]
        CFG:::db["/nfs/docker/audiobookshelf/<br>config + metadata"]
        BOOKS:::db["/nfs/jellyfin/media/books/"]
    end

    APP -->|HTTPS intern| INT
    APP -->|HTTPS extern| EXT
    WEB -->|HTTPS| EXT
    INT --> ABS
    EXT --> ABS
    ABS --> CFG
    ABS --> BOOKS

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Konfiguration

### Storage-Pfade

| Mount | Pfad im Container | NFS-Pfad |
| :--- | :--- | :--- |
| Config | `/config` | `/nfs/docker/audiobookshelf/config` |
| Metadata | `/metadata` | `/nfs/docker/audiobookshelf/metadata` |
| Hörbücher | `/audiobooks` | `/nfs/jellyfin/media/books` |

### Traefik Routing

Audiobookshelf nutzt ein Dual-Router-Setup: Intern ohne OAuth (nur IP-Whitelist), extern mit OAuth2 via Keycloak. Das ist wichtig, damit die mobilen Apps im Heimnetz ohne OAuth-Redirect funktionieren.

### Ressourcen

| Ressource | Wert |
| :--- | :--- |
| CPU | 128 MHz |
| Memory | 256 MB (max 2048 MB) |
| Affinität | `vm-nomad-client-05/06` |

## Abhängigkeiten

- [Jellyfin](./jellyfin.md) -- Teilt die Bücher-Mediathek über `/nfs/jellyfin/media/books/`
- [Traefik Middlewares](../../platforms/traefik-middlewares.md) -- Auth Chains

## Verwandte Seiten

- [Media Services](./index.md)
- [NAS-Speicher](../../infrastructure/storage-nas.md)
