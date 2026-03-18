---
title: Medien-Verwaltung
description: Übersicht der arr-Suite (Sonarr, Radarr, Prowlarr, Sabnzbd)
tags:
  - service
  - media
  - nomad
---

# Media Management Stack

## Übersicht
Der Media Stack automatisiert die Suche, den Download und die Organisation von Medieninhalten. Alle Services laufen als Nomad Jobs und nutzen PostgreSQL (`postgres.service.consul:5432`) als Datenbank.

| Service | Zweck | URL |
| :--- | :--- | :--- |
| **Prowlarr** | Indexer Management | [prowlarr.ackermannprivat.ch](https://prowlarr.ackermannprivat.ch) |
| **Sonarr** | Serien Management | [sonarr.ackermannprivat.ch](https://sonarr.ackermannprivat.ch) |
| **Radarr** | Film Management | [radarr.ackermannprivat.ch](https://radarr.ackermannprivat.ch) |
| **Sabnzbd** | Usenet Downloader | [sabnzbd.ackermannprivat.ch](https://sabnzbd.ackermannprivat.ch) |

## Konfiguration
### Speicherpfade (NFS)
Alle Services greifen auf zentrale Pfade auf dem NAS (10.0.0.200) zu:
- **Konfiguration:** `/nfs/docker/<service>/config/`
- **Downloads:** `/nfs/downloads/`
- **Mediathek:** `/nfs/jellyfin/` (für Sonarr/Radarr)

### Datenbank (PostgreSQL)
Sonarr, Radarr und Prowlarr nutzen die shared PostgreSQL-Instanz (`postgres.service.consul:5432`). Die DB-Passwörter werden via Vault Workload Identity injiziert:

- `kv/data/sonarr` (Feld: `postgres_password`)
- `kv/data/radarr` (Feld: `postgres_password`)
- `kv/data/prowlarr` (Feld: `postgres_password`)

## Wartung
### Job Updates
Updates erfolgen durch Anpassung der Image-Version im jeweiligen Nomad-Job unter `infra/nomad-jobs/media/`.
