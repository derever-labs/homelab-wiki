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

::: warning SABnzbd Memory-Limits
SABnzbd benötigt ausreichend Memory für Unpack-Operationen. Zu niedrige Limits machen den HTTP-Server unresponsive, was dazu führt, dass Consul Health Checks fehlschlagen und SABnzbd aus dem Cluster deregistriert wird.

Aktuell konfiguriert (seit 01.04.2026):
- `memory`: 1024 MiB (erhöht von 256 MiB)
- `memory_max`: 8192 MiB

Bei Symptomen wie "SABnzbd nicht erreichbar während Extraktion" zuerst Memory-Auslastung prüfen.
:::

### Datenbank (PostgreSQL)
Sonarr, Radarr und Prowlarr nutzen den [PostgreSQL Shared Cluster](../_querschnitt/datenbank-architektur.md). Die DB-Passwörter werden via Vault Workload Identity injiziert. SABnzbd hat keine eigene Datenbank.

### API-Router

SABnzbd hat einen separaten Traefik-Router für API-Zugriff mit `intern-api-chain@file`. Dieser erlaubt authentifizierten API-Zugriff (via API-Key im Header oder Query-Parameter) ohne OAuth2-Redirect.

## Interne Service-Kommunikation

| Verbindung | Adresse | Grund |
| :--- | :--- | :--- |
| Sonarr/Radarr → SABnzbd | `sabnzbd.ackermannprivat.ch:443` (Traefik) | musl/DNS-Limitation |
| Sonarr/Radarr → Prowlarr | `prowlarr.ackermannprivat.ch` (via Prowlarr App-Sync) | musl/DNS-Limitation |
| Prowlarr → Sonarr | `sonarr.ackermannprivat.ch` (Prowlarr App-Sync) | musl/DNS-Limitation |
| Prowlarr → Radarr | `radarr.ackermannprivat.ch` (Prowlarr App-Sync) | musl/DNS-Limitation |
| Alle → PostgreSQL | `postgres.service.consul:5432` | Consul DNS (funktioniert) |
| Jellyseerr → Sonarr | `sonarr.service.consul:8989` | Consul DNS (Node.js) |
| Jellyseerr → Radarr | `radarr.service.consul:7878` | Consul DNS (Node.js) |
| Jellyseerr → Jellyfin | `jellyfin.service.consul:8096` | Consul DNS (Node.js) |

::: warning musl libc und .consul-Domains
Die .NET-basierten arr-Services (Sonarr, Radarr, Prowlarr) laufen auf Alpine Linux mit musl libc. musl's `getaddrinfo`-Implementation kann `.consul`-Domains und non-standard TLDs nicht zuverlässig auflösen -- `nslookup` funktioniert, aber die Namensauflösung in .NET schlägt intermittierend fehl.

Deshalb nutzen diese Services **Traefik-URLs** (`*.ackermannprivat.ch`) für die Kommunikation untereinander. Jellyseerr (Node.js) hat dieses Problem nicht und nutzt Consul DNS direkt.
:::

::: info SABnzbd nur intern erreichbar
SABnzbd nutzt `admin-chain-v2` -- die Web-UI ist nur aus dem lokalen Netz erreichbar.
:::

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
