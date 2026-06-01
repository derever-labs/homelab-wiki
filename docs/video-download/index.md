---
title: Video-Download-Tools
description: Web-basierte Download-Tools für Videos von verschiedenen Plattformen
tags:
  - service
  - media
  - nomad
  - download
---

# Video-Download-Tools

## Übersicht

Vier Web-UIs für den manuellen Download von Videos. Jedes Tool hat einen spezifischen Zweck und Ziel-Storage. Alle sind über Traefik mit Authentik ForwardAuth (`intern-auth-strict`) erreichbar. URLs siehe [Web-Interfaces](../_referenz/web-interfaces.md), die Deployment-Pfade verweisen auf die Nomad Jobs unter `media/`.

| Attribut | Wert |
|----------|------|
| Tool youtube-dl | URL download.ackermannprivat.ch, Ziel Jellyfin Media (`/nfs/jellyfin/media/web`), für allgemeine Web-Videos und Podcasts, Job `media/youtube-dl.nomad` |
| Tool special-youtube-dl | URL s-download.ackermannprivat.ch, Ziel Stash-Datenverzeichnis (NFS), für Inhalte die in Stash statt Jellyfin verwaltet werden, Job `media/special-youtube-dl.nomad` |
| Tool special-yt-dlp | URL s2-download.ackermannprivat.ch, Ziel Stash-Datenverzeichnis (NFS), `yt-dlp`-basiert für Plattformen die yt-dlp besser unterstützt, Job `media/special-yt-dlp.nomad` |
| Tool video-grabber | URL grab.ackermannprivat.ch, kein eigener Storage (delegiert an special-yt-dlp Backend), schlankes URL-Frontend, Job `media/video-grabber.nomad` |

## Architektur

```d2
direction: right

Clients: Zugriff {
  style.stroke-dash: 4
  Browser: Browser { style.border-radius: 8 }
}

Traefik: "Traefik (10.0.2.20)" {
  style.stroke-dash: 4
  tooltip: "10.0.2.20"
  T1: "download.*" { style.border-radius: 8 }
  T2: "s-download.*" { style.border-radius: 8 }
  T3: "s2-download.*" { style.border-radius: 8 }
  T4: "grab.*" { style.border-radius: 8 }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  YDL: "youtube-dl (youtubedl-material)" { style.border-radius: 8 }
  SYDL: "special-youtube-dl (youtubedl-material)" { style.border-radius: 8 }
  SYTDLP: "special-yt-dlp (yt-dlp-webui)" { style.border-radius: 8 }
  VG: video-grabber { style.border-radius: 8 }
}

Storage: Ziel-Storage {
  style.stroke-dash: 4
  JF: "NFS /nfs/jellyfin/media/web" { shape: cylinder }
  ST: "NFS Stash-Datenverzeichnis" { shape: cylinder }
}

Clients.Browser -> Traefik.T1
Clients.Browser -> Traefik.T2
Clients.Browser -> Traefik.T3
Clients.Browser -> Traefik.T4
Traefik.T1 -> Nomad.YDL
Traefik.T2 -> Nomad.SYDL
Traefik.T3 -> Nomad.SYTDLP
Traefik.T4 -> Nomad.VG
Nomad.VG -> Nomad.SYTDLP: "API :3033"
Nomad.YDL -> Storage.JF
Nomad.SYDL -> Storage.ST
Nomad.SYTDLP -> Storage.ST
```

## Konfiguration

Ressourcen und Affinitäten: Siehe die jeweiligen Nomad Jobs unter `media/`.

Alle Tools haben eine Affinität für `vm-nomad-client-05` oder `06`, werden aber nicht hart darauf eingeschränkt.

### Statischer Port (special-yt-dlp)

`special-yt-dlp` nutzt den statischen Port 3033, damit `video-grabber` sich über Consul DNS zuverlässig verbinden kann. Andere Tools verwenden dynamische Ports.

## Verwandte Seiten

- [Stash](../stash/index.md) -- Media Organizer, empfängt Downloads von special-Instanzen
- [Jellyfin](../jellyfin/index.md) -- Media Player, empfängt Downloads von youtube-dl
- [Content Pipeline](../content-pipeline/index.md) -- Automatisierte Downloads (Batch Jobs)
