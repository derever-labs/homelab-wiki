---
title: Video-Download-Tools
description: Web-basierte Download-Tools fuer Videos von verschiedenen Plattformen
tags:
  - service
  - media
  - nomad
  - download
---

# Video-Download-Tools

## Uebersicht

Vier Web-UIs fuer den manuellen Download von Videos. Jedes Tool hat einen spezifischen Zweck und Ziel-Storage. Alle sind ueber Traefik mit OAuth2-Schutz (`admin-chain-v2`) erreichbar.

| Attribut | youtube-dl | special-youtube-dl | special-yt-dlp | video-grabber |
| :--- | :--- | :--- | :--- | :--- |
| **Status** | Produktion | Produktion | Produktion | Produktion |
| **URL** | [download.*](https://download.ackermannprivat.ch) | [s-download.*](https://s-download.ackermannprivat.ch) | [s2-download.*](https://s2-download.ackermannprivat.ch) | [grab.*](https://grab.ackermannprivat.ch) |
| **Deployment** | `media/youtube-dl.nomad` | `media/special-youtube-dl.nomad` | `media/special-yt-dlp.nomad` | `media/video-grabber.nomad` |
| **Image** | `tzahi12345/youtubedl-material` | `tzahi12345/youtubedl-material` | `marcobaobao/yt-dlp-webui` | `library/video-grabber` |
| **Port** | 17442 | 17442 | 3033 (statisch) | 5000 |
| **Ziel-Storage** | Jellyfin Media | Stash Media | Stash Media | via special-yt-dlp |
| **Prioritaet** | 60 | 60 | 60 | 50 |

## Zweck der einzelnen Tools

### youtube-dl (Allgemein)

Die Standard-Instanz fuer allgemeine Video-Downloads. Downloads landen direkt im Jellyfin-Media-Verzeichnis und sind somit sofort in der Mediathek verfuegbar.

- **Output:** `/nfs/jellyfin/media/web` (Audio, Video, Subscriptions)
- **Config:** `/nfs/docker/youtube-dl/config`
- **Use Case:** YouTube-Videos, Podcasts, allgemeine Web-Videos fuer Jellyfin

### special-youtube-dl (Spezial-Inhalte)

Separate Instanz mit dem gleichen Image wie youtube-dl, aber mit anderem Ziel-Storage. Downloads landen im Stash-Datenverzeichnis.

- **Output:** Stash-Datenverzeichnis (NFS)
- **Config:** `/nfs/docker/special-youtube-dl/config`
- **Use Case:** Spezielle Inhalte die in Stash statt Jellyfin verwaltet werden

### special-yt-dlp (yt-dlp Web UI)

Alternatives Frontend basierend auf `yt-dlp` statt `youtube-dl`. Nutzt einen statischen Port (3033), da video-grabber sich ueber Consul DNS damit verbindet.

- **Output:** Stash-Datenverzeichnis (NFS)
- **Config:** `/nfs/docker/special-yt-dlp/config`
- **Use Case:** Spezielle Inhalte, Plattformen die `yt-dlp` besser unterstuetzt als `youtube-dl`

### video-grabber (Frontend fuer special-yt-dlp)

Ein schlankes URL-basiertes Frontend, das Downloads an die special-yt-dlp API weiterleitet. Hat keinen eigenen Storage -- alles wird ueber die API an `special-yt-dlp` delegiert.

- **Output:** Kein eigener Storage (nutzt special-yt-dlp Backend)
- **Backend:** `http://special-yt-dlp.service.consul:3033/api/v1` (via Consul DNS)
- **Use Case:** Schnelles Einfuegen einer URL zum Download, ohne die volle yt-dlp-UI oeffnen zu muessen

## Architektur

```mermaid
flowchart LR
    subgraph Clients["Zugriff"]
        Browser:::entry["Browser"]
    end

    subgraph Traefik["Traefik (10.0.2.20)"]
        T1:::svc["download.*"]
        T2:::svc["s-download.*"]
        T3:::svc["s2-download.*"]
        T4:::svc["grab.*"]
    end

    subgraph Nomad["Nomad Cluster"]
        YDL:::svc["youtube-dl<br>(youtubedl-material)"]
        SYDL:::svc["special-youtube-dl<br>(youtubedl-material)"]
        SYTDLP:::accent["special-yt-dlp<br>(yt-dlp-webui)"]
        VG:::svc["video-grabber"]
    end

    subgraph Storage["Ziel-Storage"]
        JF:::db["NFS<br>/nfs/jellyfin/media/web"]
        ST:::db["NFS<br>Stash-Datenverzeichnis"]
    end

    Browser --> T1 & T2 & T3 & T4
    T1 --> YDL
    T2 --> SYDL
    T3 --> SYTDLP
    T4 --> VG
    VG -->|API :3033| SYTDLP
    YDL --> JF
    SYDL --> ST
    SYTDLP --> ST

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Konfiguration

### Ressourcen

| Tool | CPU | RAM | RAM Max |
| :--- | :--- | :--- | :--- |
| youtube-dl | 128 MHz | 256 MB | 2048 MB |
| special-youtube-dl | 128 MHz | 256 MB | 4096 MB |
| special-yt-dlp | 512 MHz | 2048 MB | 4096 MB |
| video-grabber | 100 MHz | 128 MB | 512 MB |

Alle Tools haben eine Affinitaet fuer `vm-nomad-client-05` oder `06`, werden aber nicht hart darauf eingeschraenkt.

### Statischer Port (special-yt-dlp)

`special-yt-dlp` nutzt den statischen Port 3033, damit `video-grabber` sich ueber Consul DNS zuverlaessig verbinden kann. Andere Tools verwenden dynamische Ports.

## Verwandte Seiten

- [Stash](../stash/index.md) -- Media Organizer, empfaengt Downloads von special-Instanzen
- [Jellyfin](../jellyfin/index.md) -- Media Player, empfaengt Downloads von youtube-dl
- [Content Pipeline](../content-pipeline/index.md) -- Automatisierte Downloads (Batch Jobs)
