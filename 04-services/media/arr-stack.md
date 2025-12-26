---
title: Media Management Stack
description: Übersicht der arr-Suite (Sonarr, Radarr, Prowlarr, Sabnzbd)
published: true
date: 2025-12-26T19:20:00+00:00
tags: service, media, nomad
editor: markdown
---

# Media Management Stack

## Übersicht
Der Media Stack automatisiert die Suche, den Download und die Organisation von Medieninhalten. Alle Services laufen als Nomad Jobs und nutzen Litestream für die Datenbank-Replikation.

| Service | Zweck | URL |
| :--- | :--- | :--- |
| **Prowlarr** | Indexer Management | [prowlarr.ackermannprivat.ch](https://prowlarr.ackermannprivat.ch) |
| **Sonarr** | Serien Management | [sonarr.ackermannprivat.ch](https://sonarr.ackermannprivat.ch) |
| **Radarr** | Film Management | [radarr.ackermannprivat.ch](https://radarr.ackermannprivat.ch) |
| **Sabnzbd** | Usenet Downloader | [sabnzbd.ackermannprivat.ch](https://sabnzbd.ackermannprivat.ch) |

## Konfiguration
### Speicherpfade (NFS)
Alle Services greifen auf zentrale Pfade auf dem NAS (10.0.0.200) zu:
- **Datenbanken:** `/local-docker/<service>/config/` (Repliziert via Litestream)
- **Downloads:** `/nfs/downloads/`
- **Mediathek:** `/nfs/jellyfin/` (für Sonarr/Radarr)

### Datenbank-Sicherung (Litestream)
Die SQLite-Datenbanken werden alle 5 Sekunden auf einen Peer-Node und alle 60 Sekunden auf das NAS repliziert. Dies ermöglicht einen schnellen Restore bei einem Node-Ausfall.

## Wartung
### Job Updates
Updates erfolgen durch Anpassung der Image-Version im jeweiligen Nomad-Job unter `infra/nomad-jobs/media/`.
```bash
nomad job run infra/nomad-jobs/media/<service>.nomad
```

---
*Letztes Update: 26.12.2025*
