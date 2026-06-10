---
title: Media-Hilfstools
description: Jellystat, Janitorr, Handbrake und LazyLibrarian als Ergänzung zum Media Stack
tags:
  - service
  - media
  - nomad
---

# Media-Hilfstools

Ergänzende Tools rund um den Media Stack. Keines davon ist für den Kernbetrieb zwingend nötig, sie erweitern aber Monitoring, Wartung und Medienverarbeitung.

## Übersicht

| Tool | Zweck | Deployment |
|------|-------|------------|
| Jellystat | Jellyfin-Statistik-Dashboard | `media/jellystat.nomad` |
| Janitorr | Automatische Mediathek-Bereinigung | `media/janitorr.nomad` |
| Handbrake | Video-Transcoding (deprecated) | `media/handbrake.nomad.deprecated` |
| LazyLibrarian | E-Book-/Hörbuch-Verwaltung | `media/lazylibrarian.nomad` |
| Profilarr | Quality-Profile-/Custom-Format-Sync für Sonarr/Radarr | `services/profilarr.nomad` -- [Eigene Seite](../arr-stack/profilarr.md) |

## Jellystat

| Attribut | Wert |
|----------|------|
| URL | [jellystat.ackermannprivat.ch](https://jellystat.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `media/jellystat.nomad` |
| Datenbank | PostgreSQL (Shared Cluster) |
| Storage | Kein lokaler Storage (Backup via zentrales `pg_dump`) |
| Auth | `intern-auth@file` |
| Secrets | Vault `kv/data/jellystat` (`postgres_user`, `postgres_password`, `postgres_db`, `jwt_secret`) |

### Rolle

Statistik- und Analyse-Dashboard für Jellyfin. Zeigt Wiedergabe-Historie, beliebteste Medien und Nutzer-Aktivitäten. Vergleichbar mit Tautulli für Plex.

### Besonderheiten

- Prestart-Task wartet auf PostgreSQL-Verfügbarkeit
- Constraint auf `vm-nomad-client-05/06`, Affinität für `client-05`
- Vault-Integration für Datenbank-Credentials und JWT Secret

---

## Janitorr

| Attribut | Wert |
|----------|------|
| URL | Keine Web-UI (nur Health-Endpoint auf Port 8081) |
| Deployment | Nomad Job `media/janitorr.nomad` |
| Storage | NFS `/nfs/jellyfin` (liest die Mediathek), Config via Nomad Template; kein Traefik (`traefik.enable=false`) |

### Rolle

Automatische Bereinigung der Mediathek. Janitorr entfernt nicht angesehene oder veraltete Medien aus Jellyfin, Radarr und Sonarr basierend auf konfigurierbaren Regeln. Die Konfiguration (`application.yml`) ist als Nomad Template direkt im Job eingebettet.

### Besonderheiten

- Kein Traefik-Routing, läuft rein intern
- Greift auf die gesamte Jellyfin-Mediathek zu (`/nfs/jellyfin`)
- Kommuniziert mit Radarr, Sonarr und Jellyfin über deren APIs

---

## Handbrake

::: warning Deprecated
Der Nomad-Job liegt nur noch als `media/handbrake.nomad.deprecated` vor und wird nicht mehr deployed. Transcoding läuft bei Bedarf direkt über Jellyfin.
:::

| Attribut | Wert |
|----------|------|
| URL | [handbrake.ackermannprivat.ch](https://handbrake.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `media/handbrake.nomad` |
| Storage | NFS `/nfs/docker/handbrake/config/` |
| Auth | `intern-auth@file` |

### Rolle

Web-basierte Oberfläche für Video-Transcoding. Ermöglicht das Konvertieren von Videodateien in verschiedene Formate und Qualitätsstufen direkt über den Browser.

### Storage-Pfade

| Mount | Pfad im Container | NFS-Pfad |
| :--- | :--- | :--- |
| Config | `/config` | `/nfs/docker/handbrake/config` |
| Input | `/storage` | `/nfs/logs/meta_logs/meta/logs/logs/data/` |
| Output | `/output` | `/nfs/logs/meta_logs/meta/logs/logs/handbreak/output/` |

### Besonderheiten

- Hoher Ressourcenbedarf -- Affinität für `vm-nomad-client-05/06` (Details: `media/handbrake.nomad`)

---

## LazyLibrarian

| Attribut | Wert |
|----------|------|
| URL | [lazylibrarian.ackermannprivat.ch](https://lazylibrarian.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `media/lazylibrarian.nomad` |
| Storage | NFS `/nfs/docker/lazylibrarian/config/` |
| Mediathek | NFS `/nfs/jellyfin/` |
| Auth | `intern-auth@file` |

### Rolle

Automatisierte Suche und Verwaltung von E-Books und Hörbüchern. Vergleichbar mit Sonarr/Radarr, aber spezialisiert auf Bücher. LazyLibrarian sucht nach neuen Releases, lädt sie herunter und organisiert sie in der Bibliothek.

### Besonderheiten

- Separater API-Router mit `intern-api@file` für Zugriff durch andere Services
- Greift auf die gesamte Jellyfin-Mediathek zu (`/nfs/jellyfin`)
- Ergänzt [Audiobookshelf](../audiobookshelf/index.md) als Beschaffungs-Tool

---

## Profilarr

Profilarr ist seit 2026-06-05 der Nachfolger von notifiarr für die Quality-Profile-Synchronisation. Dokumentiert auf der [Profilarr-Seite](../arr-stack/profilarr.md).

## Verwandte Seiten

- [Arr Stack](../arr-stack/index.md) -- Sonarr, Radarr, Prowlarr
- [Jellyfin](../jellyfin/index.md) -- Media Player, dessen Mediathek Janitorr und Handbrake nutzen
- [Audiobookshelf](../audiobookshelf/index.md) -- Hörbuch-Server, ergänzt durch LazyLibrarian
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für alle Media-Tools
