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
| Storage | Linstor CSI `audiobookshelf-config` (`/config`), `audiobookshelf-metadata` (`/metadata`) |
| Mediathek | NFS `/nfs/jellyfin/media/books/` |
| Auth | Intern: `intern-noauth@file` / Extern: `public-auth@file` |

## Architektur

```d2
direction: right

Clients: Zugriff {
  style.stroke-dash: 4
  APP: "Audiobookshelf-App\n(iOS/Android)" { style.border-radius: 8 }
  WEB: Web-UI { style.border-radius: 8 }
}

Traefik: Traefik {
  style.stroke-dash: 4
  INT: "Router intern\nintern-noauth" { style.border-radius: 8 }
  EXT: "Router extern\npublic-auth" { style.border-radius: 8 }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  ABS: Audiobookshelf { style.border-radius: 8 }
}

Storage: Storage {
  style.stroke-dash: 4
  CFG: "Linstor CSI\nconfig + metadata" { shape: cylinder }
  BOOKS: "NFS /nfs/jellyfin/media/books/" { shape: cylinder }
}

Clients.APP -> Traefik.INT: HTTPS intern
Clients.APP -> Traefik.EXT: HTTPS extern
Clients.WEB -> Traefik.EXT: HTTPS
Traefik.INT -> Nomad.ABS
Traefik.EXT -> Nomad.ABS
Nomad.ABS -> Storage.CFG
Nomad.ABS -> Storage.BOOKS
```

## Verwandte Seiten

- [Jellyfin](../jellyfin/index.md) -- Media Player, teilt die Bücher-Mediathek
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Mediathek
- [Traefik Referenz](../edge/traefik/referenz.md) -- Middleware Chains für Authentifizierung
