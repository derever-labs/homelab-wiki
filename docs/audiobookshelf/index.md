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
| **Storage** | NFS `/nfs/docker/audiobookshelf/` (Config, Metadata) |
| **Mediathek** | NFS `/nfs/jellyfin/media/books/` |
| **Auth** | Intern: `intern-api@file` / Extern: `public-auth@file` |
| **Consul Service** | `audiobookshelf` |

## Rolle im Stack

Audiobookshelf ist der zentrale Server für Hörbücher und Podcasts. Die Mediathek liegt auf dem gleichen NFS-Share wie die Jellyfin-Bibliothek (`/nfs/jellyfin/media/books/`), wird aber eigenständig verwaltet. Im Gegensatz zu Jellyfin bietet Audiobookshelf spezialisierte Features wie Kapitel-Navigation, Lesezeichen und Fortschrittsverfolgung über mehrere Geräte.

## Architektur

```d2
direction: right

Client: Clients {
  style.stroke-dash: 4
  APP: "Audiobookshelf App (iOS/Android)" { style.border-radius: 8 }
  WEB: Web-UI { style.border-radius: 8 }
}

Traefik: "Traefik (10.0.2.20)" {
  style.stroke-dash: 4
  tooltip: "10.0.2.20"
  INT: "Router: intern intern-api" { style.border-radius: 8 }
  EXT: "Router: extern public-auth" { style.border-radius: 8 }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  ABS: Audiobookshelf { style.border-radius: 8 }
}

NFS: NAS {
  style.stroke-dash: 4
  CFG: "/nfs/docker/audiobookshelf/ config + metadata" { shape: cylinder }
  BOOKS: "/nfs/jellyfin/media/books/" { shape: cylinder }
}

Client.APP -> Traefik.INT: HTTPS intern
Client.APP -> Traefik.EXT: HTTPS extern
Client.WEB -> Traefik.EXT: HTTPS
Traefik.INT -> Nomad.ABS
Traefik.EXT -> Nomad.ABS
Nomad.ABS -> NFS.CFG
Nomad.ABS -> NFS.BOOKS
```

## Konfiguration

### Storage-Pfade

| Mount | Pfad im Container | NFS-Pfad |
| :--- | :--- | :--- |
| Config | `/config` | `/nfs/docker/audiobookshelf/config` |
| Metadata | `/metadata` | `/nfs/docker/audiobookshelf/metadata` |
| Hörbücher | `/audiobooks` | `/nfs/jellyfin/media/books` |

### Traefik Routing

Audiobookshelf nutzt ein Dual-Router-Setup: Intern ohne Auth (nur IP-Whitelist), extern mit Authentik ForwardAuth. Das ist wichtig, damit die mobilen Apps im Heimnetz ohne Auth-Redirect funktionieren.

::: info Ressourcen
Siehe Nomad Job `media/audiobookshelf.nomad`.
:::

## Verwandte Seiten

- [Jellyfin](../jellyfin/index.md) -- Media Player, teilt die Bücher-Mediathek
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Mediathek und Config
- [Traefik Referenz](../traefik/referenz.md) -- Middleware Chains für Authentifizierung
