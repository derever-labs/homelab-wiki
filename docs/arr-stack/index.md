---
title: Medien-Verwaltung
description: Übersicht der arr-Suite (Sonarr, Radarr, Prowlarr, Sabnzbd)
tags:
  - service
  - media
  - nomad
---

# Medien-Verwaltung

Der Media Stack automatisiert die Suche, den Download und die Organisation von Medieninhalten. Alle Services laufen als Nomad Jobs und nutzen den [PostgreSQL Shared Cluster](../_querschnitt/datenbank-architektur.md) als Datenbank.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [prowlarr.ackermannprivat.ch](https://prowlarr.ackermannprivat.ch) (Indexer), [sonarr.ackermannprivat.ch](https://sonarr.ackermannprivat.ch) (Serien), [radarr.ackermannprivat.ch](https://radarr.ackermannprivat.ch) (Filme), [sabnzbd.ackermannprivat.ch](https://sabnzbd.ackermannprivat.ch) (Usenet-Downloader) |
| Deployment | Nomad Jobs `media/prowlarr.nomad`, `media/sonarr.nomad`, `media/radarr.nomad`, `media/sabnzbd.nomad` |
| Storage | NFS auf dem [NAS](../nas-storage/index.md); SABnzbd-Config auf Linstor CSI |
| Datenbank | [PostgreSQL Shared Cluster](../_querschnitt/datenbank-architektur.md) (Sonarr, Radarr, Prowlarr) |
| Auth | Authentik via Traefik; SABnzbd nur intern |
| Secrets | DB-Passwörter via Vault Workload Identity |

## Rolle im Stack

Die arr-Suite ist die Automatisierungsschicht zwischen Usenet/Indexern und [Jellyfin](../jellyfin/index.md): Prowlarr verwaltet die Indexer, Sonarr und Radarr suchen und organisieren Serien und Filme, SABnzbd lädt sie via Usenet herunter.

## Konfiguration
### Speicher
Konfiguration und Mediathek liegen zentral auf dem [NAS](../nas-storage/index.md) (NFS); Downloads und Mediathek teilen sich denselben Pfad, damit Sonarr und Radarr Hardlinks statt Kopien nutzen können. SABnzbd ist die Ausnahme: seine Konfiguration liegt auf einem Linstor CSI Volume (`sabnzbd-config-r2`) statt NFS, weshalb der Job auf die Linstor Storage Nodes `vm-nomad-client-05/06` eingeschränkt ist.

::: warning SABnzbd Memory-Limits und NFS-Cache
SABnzbd benötigt ausreichend Memory für Unpack-Operationen. Zu niedrige Limits machen den HTTP-Server unresponsive, was dazu führt, dass Consul Health Checks fehlschlagen und SABnzbd aus dem Cluster deregistriert wird.

Die konfigurierten Ressourcen-Limits sind im Nomad-Job `media/sabnzbd.nomad` definiert.

Bei Symptomen wie "SABnzbd nicht erreichbar während Extraktion" zuerst Memory-Auslastung prüfen.

SABnzbd-Downloads können auch durch stale NFS-Directory-Caches fehlschlagen (`FileNotFoundError` auf `/jellyfin/downloads/incomplete/`). Wenn `acdirmin/acdirmax` zu hoch sind, sieht der NFS-Client veraltete Verzeichnisinhalte. Siehe [NAS Troubleshooting](../nas-storage/index.md#troubleshooting).
:::

### Datenbank (PostgreSQL)
Sonarr, Radarr und Prowlarr nutzen den [PostgreSQL Shared Cluster](../_querschnitt/datenbank-architektur.md). Die DB-Passwörter werden via Vault Workload Identity injiziert. SABnzbd hat keine eigene Datenbank.

### API-Router

SABnzbd hat einen separaten Traefik-Router für API-Zugriff mit `intern-api@file`. Dieser erlaubt authentifizierten API-Zugriff (via API-Key im Header oder Query-Parameter) ohne OAuth2-Redirect. Die Web-UI selbst nutzt `intern-auth` und ist nur aus dem lokalen Netz erreichbar.

## Interne Service-Kommunikation

| Verbindung | Adresse | Grund |
| :--- | :--- | :--- |
| Sonarr/Radarr → SABnzbd | `sabnzbd.ackermannprivat.ch:443` (Traefik) | musl/DNS-Limitation |
| Sonarr/Radarr → Prowlarr | `prowlarr.ackermannprivat.ch` (via Prowlarr App-Sync) | musl/DNS-Limitation |
| Prowlarr → Sonarr | `sonarr.ackermannprivat.ch` (Prowlarr App-Sync) | musl/DNS-Limitation |
| Prowlarr → Radarr | `radarr.ackermannprivat.ch` (Prowlarr App-Sync) | musl/DNS-Limitation |
| Alle → PostgreSQL | `postgres.service.consul` | Consul DNS (funktioniert) |
| Jellyseerr → Sonarr | `sonarr.service.consul` | Consul DNS (Node.js) |
| Jellyseerr → Radarr | `radarr.service.consul` | Consul DNS (Node.js) |
| Jellyseerr → Jellyfin | `jellyfin.service.consul` | Consul DNS (Node.js) |

Ports siehe [Ports und Dienste](../_referenz/ports-und-dienste.md).

::: warning musl libc und .consul-Domains
Die .NET-basierten arr-Services (Sonarr, Radarr, Prowlarr) laufen auf Alpine Linux mit musl libc. musl's `getaddrinfo`-Implementation kann `.consul`-Domains und non-standard TLDs nicht zuverlässig auflösen -- `nslookup` funktioniert, aber die Namensauflösung in .NET schlägt intermittierend fehl.

Deshalb nutzen diese Services **Traefik-URLs** (`*.ackermannprivat.ch`) für die Kommunikation untereinander. Jellyseerr (Node.js) hat dieses Problem nicht und nutzt Consul DNS direkt.
:::

## Verwandte Seiten

- [Jellyseerr](../jellyseerr/index.md) -- Media Request Management (leitet Anfragen an Sonarr/Radarr weiter)
- [Media-Hilfstools](../media-tools/index.md) -- Janitorr (Cleanup), Jellystat (Statistiken)
- [Jellyfin](../jellyfin/index.md) -- Media Server
- [Radarr Quality Profiles](./referenz.md) -- Detaillierte Profil-Konfiguration
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Medien und Konfiguration
