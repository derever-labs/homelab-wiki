---
title: Jellyfin
description: Medienserver fuer Filme und Serien mit Hardware-Transcoding und LDAP-Authentifizierung
tags:
  - service
  - nomad
  - media
  - linstor
---

# Jellyfin

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [watch.ackermannprivat.ch](https://watch.ackermannprivat.ch) |
| **Image** | `linuxserver/jellyfin:latest` (via lokale Registry) |
| **Deployment** | Nomad Job (`media/jellyfin.nomad`) |
| **Nodes** | `vm-nomad-client-05/06` (Constraint, folgt dem CSI Volume) |
| **Config Storage** | Linstor CSI Volume `jellyfin-config` (DRBD-repliziert) |
| **Media Storage** | NFS `/nfs/jellyfin` ([NAS](../nas-storage/index.md)) |
| **Auth** | Kein OAuth -- LDAP Bind via [Authentik LDAP Outpost](../identity/index.md) direkt in Jellyfin |
| **Ressourcen** | 4096 MHz CPU, 12 GB RAM (max 16 GB) |
| **Priority** | 95 (kritischer Service) |

## Architektur

Jellyfin streamt Medien vom NFS-Share und nutzt Linstor CSI für die persistente Konfiguration. Jellyseerr dient als Wunschliste, über die Benutzer neue Medien anfordern können -- diese werden via Arr-Stack heruntergeladen und landen automatisch in der Jellyfin-Bibliothek.

```mermaid
flowchart LR
    User:::entry["User<br>(watch.ackermannprivat.ch)"]
    User -->|HTTPS| Traefik:::svc["Traefik"]
    Traefik --> JF:::accent["Jellyfin"]
    JF -->|LDAP Bind| LDAP:::svc["Authentik<br>LDAP Outpost"]
    JF -->|Medien lesen| NFS:::db["NFS<br>/nfs/jellyfin"]
    JF -->|Config| CSI:::db["Linstor CSI<br>jellyfin-config"]
    JS:::svc["Jellyseerr"] -->|Verfügbarkeit prüfen| JF
    JS -->|Requests| ARR:::svc["Arr Stack<br>(Radarr, Sonarr)"]
    ARR -->|Downloads| NFS

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Transcoding

Jellyfin benötigt hohe Ressourcen (4096 MHz CPU, bis 16 GB RAM) wegen Software-Transcoding. Es ist kein Hardware-Transcoding (GPU/iGPU Passthrough) konfiguriert -- alle Transcode-Operationen laufen auf der CPU.

Transcode-Dateien und Caches werden auf dem lokalen `/tmp/jellyfin/`-Verzeichnis der VM abgelegt (nicht auf NFS), um die Schreiblast vom NAS fernzuhalten. Ein Prestart-Task im Nomad Job räumt bei jedem Start alte Caches auf.

## Storage

| Mount | Pfad im Container | Pfad auf Host | Typ |
| :--- | :--- | :--- | :--- |
| Config | `/config` | CSI Volume `jellyfin-config` | Linstor (DRBD-repliziert) |
| Cache | `/config/cache` | `/tmp/jellyfin/cache` | Lokal (flüchtig) |
| Transcodes | `/config/data/transcodes` | `/tmp/jellyfin/transcodes` | Lokal (flüchtig) |
| Medienbibliothek | `/jellyfin` | `/nfs/jellyfin` | NFS ([NAS](../nas-storage/index.md)) |

::: info Lokaler Cache
Die Cache- und Transcode-Verzeichnisse liegen bewusst auf der lokalen SSD statt auf NFS. Das reduziert die Netzwerklast und verbessert die Transcoding-Performance erheblich.
:::

## Authentifizierung

Jellyfin nutzt direkte LDAP-Bind-Authentifizierung gegen den [Authentik LDAP Outpost](../identity/index.md) -- kein OAuth2 oder Traefik-Middleware. Das LDAP-Plugin in Jellyfin verbindet sich über Consul DNS (`authentik-ldap.service.consul:3389`) und prüft Benutzer-Credentials gegen Authentik. Benutzer werden über ihre E-Mail-Adresse (`mail`-Attribut) mit bestehenden Jellyfin-Accounts verknüpft.

::: tip Kein OAuth auf Traefik-Ebene
Anders als die meisten Services hat Jellyfin keine Traefik-Middleware-Chain für OAuth. Die Authentifizierung erfolgt vollständig in der Applikation selbst über LDAP. Dadurch können auch Mediaplayer-Clients (TV, Apps) ohne Browser-OAuth zugreifen.
:::

## Täglicher Restart

Ein periodischer Batch Job (`batch-jobs/daily_restart_jellyfin.nomad`) startet Jellyfin täglich um 04:00 Uhr neu. Das behebt Memory-Leaks und räumt temporäre Daten auf. Siehe [Batch Jobs](../_querschnitt/batch-jobs.md).

## Beziehung zu Jellyseerr

[Jellyseerr](../jellyseerr/index.md) ist das Wunschsystem für neue Medien. Benutzer (Familie, Gäste) können über `wish.ackermannprivat.ch` Filme und Serien anfordern. Jellyseerr prüft bei Jellyfin die Verfügbarkeit und leitet fehlende Medien an den Arr-Stack weiter.

## Abhängigkeiten

- [Authentik](../identity/index.md) -- LDAP Bind Authentifizierung (via LDAP Outpost)
- [Jellyseerr](../jellyseerr/index.md) -- Media Request Management
- [Arr Stack](../arr-stack/index.md) -- Automatisierte Medien-Akquisition
- [NAS-Speicher](../nas-storage/index.md) -- Medienbibliothek unter `/nfs/jellyfin`
- [Linstor](../linstor-storage/index.md) -- CSI Storage für das Config-Volume

## Backup

- **Config:** Linstor CSI Volume `jellyfin-config` -- DRBD-repliziert über `client-05/06`. Zusätzlich durch die allgemeine [Backup-Strategie](../backup/index.md) abgedeckt.
- **Cache/Transcodes:** Flüchtig auf `/tmp`, kein Backup notwendig.
- **Mediendaten:** NFS-Share auf dem [NAS](../nas-storage/index.md), unterliegt der NAS-eigenen Backup-Strategie.

## Verwandte Seiten

- [Jellyseerr](../jellyseerr/index.md) -- Media Request Management
- [Arr Stack](../arr-stack/index.md) -- Automatisierte Medien-Akquisition
- [Audiobookshelf](../audiobookshelf/index.md) -- Teilt die Bücher-Mediathek
- [Authentik](../identity/index.md) -- Authentifizierung (LDAP Outpost)
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Medien
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- Täglicher Restart-Job
