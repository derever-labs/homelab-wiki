---
title: Audiobookshelf
description: Selbstgehosteter Server für Hörbücher und Podcasts
tags:
  - service
  - media
  - nomad
---

# Audiobookshelf

Audiobookshelf ist der zentrale Server für Hörbücher und Podcasts. Die Mediathek liegt auf dem gleichen NFS-Share wie die Jellyfin-Bibliothek, wird aber eigenständig verwaltet. Im Gegensatz zu Jellyfin bietet Audiobookshelf spezialisierte Features wie Kapitel-Navigation, Lesezeichen und Fortschrittsverfolgung über mehrere Geräte. Das Dual-Router-Setup (intern ohne Auth-Redirect, extern mit Authentik ForwardAuth) ermöglicht den mobilen Apps im Heimnetz eine nahtlose Nutzung ohne Login-Weiterleitung.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [audio.ackermannprivat.ch](https://audio.ackermannprivat.ch) |
| Deployment | Nomad Job `media/audiobookshelf.nomad` |
| Storage | NFS `/nfs/docker/audiobookshelf/` (Config, Metadata) |
| Mediathek | NFS `/nfs/jellyfin/media/books/` |
| Auth | Intern: `intern-noauth@file` / Extern: `public-auth@file` |

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: right

Client: Clients {
  style.stroke-dash: 4
  APP: "Audiobookshelf App (iOS/Android)" { style.border-radius: 8 }
  WEB: Web-UI { style.border-radius: 8 }
}

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: "10.0.2.20"
  INT: "Router: intern intern-noauth" { style.border-radius: 8 }
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

## Verwandte Seiten

- [Jellyfin](../jellyfin/index.md) -- Media Player, teilt die Bücher-Mediathek
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Mediathek und Config
- [Traefik Referenz](../traefik/referenz.md) -- Middleware Chains für Authentifizierung
