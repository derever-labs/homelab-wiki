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
Der Media Stack automatisiert die Suche, den Download und die Organisation von Medieninhalten. Alle Services laufen als Nomad Jobs und nutzen den [PostgreSQL Shared Cluster](../_querschnitt/datenbank-architektur.md) als Datenbank.

| Service | Zweck | URL |
| :--- | :--- | :--- |
| **Prowlarr** | Indexer Management | [prowlarr.ackermannprivat.ch](https://prowlarr.ackermannprivat.ch) |
| **Sonarr** | Serien Management | [sonarr.ackermannprivat.ch](https://sonarr.ackermannprivat.ch) |
| **Radarr** | Film Management | [radarr.ackermannprivat.ch](https://radarr.ackermannprivat.ch) |
| **Sabnzbd** | Usenet Downloader | [sabnzbd.ackermannprivat.ch](https://sabnzbd.ackermannprivat.ch) |

## Konfiguration
### Speicherpfade (NFS)
Alle Services greifen auf zentrale Pfade auf dem [NAS](../nas-storage/index.md) zu:
- **Konfiguration:** `/nfs/docker/<service>/config/`
- **Downloads:** `/nfs/downloads/`
- **Mediathek:** `/nfs/jellyfin/` (für Sonarr/Radarr)

::: info SABnzbd Storage
SABnzbd nutzt im Gegensatz zu den anderen Arr-Services ein Linstor CSI Volume (`sabnzbd-config`) für die Konfiguration statt NFS. Die Downloads landen auf `/nfs/jellyfin/`. Der Job ist deshalb auf `vm-nomad-client-05/06` eingeschränkt (Linstor Storage Nodes).
:::

### Datenbank (PostgreSQL)
Sonarr, Radarr und Prowlarr nutzen den [PostgreSQL Shared Cluster](../_querschnitt/datenbank-architektur.md). Die DB-Passwörter werden via Vault Workload Identity injiziert. SABnzbd hat keine eigene Datenbank.

### API-Router

SABnzbd hat einen separaten Traefik-Router für API-Zugriff mit `intern-api-chain@file`. Dieser erlaubt authentifizierten API-Zugriff (via API-Key im Header oder Query-Parameter) ohne OAuth2-Redirect.

## Wartung
### Job Updates
Updates erfolgen durch Anpassung der Image-Version im jeweiligen Nomad-Job unter `infra/nomad-jobs/media/`.

## Verwandte Seiten

- [Jellyseerr](../jellyseerr/index.md) -- Media Request Management (leitet Anfragen an Sonarr/Radarr weiter)
- [Media-Hilfstools](../media-tools/index.md) -- Janitorr (Cleanup), Jellystat (Statistiken)
- [Jellyfin](../jellyfin/index.md) -- Media Server
- [Radarr Quality Profiles](./referenz.md) -- Detaillierte Profil-Konfiguration
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Medien und Konfiguration
