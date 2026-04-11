---
title: Jellyfin
description: Medienserver fuer Filme und Serien mit Intel QSV Hardware-Transcoding und LDAP-Authentifizierung
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
| **Auth** | Kein OAuth -- LDAP Bind via [Authentik LDAP Outpost](../authentik/index.md) direkt in Jellyfin |
| **GPU** | Intel Iris Xe (i9-12900H) via Full Passthrough von [Proxmox](../proxmox/index.md) |
| **Transcoding** | Intel QSV (Hardware), OpenCL Tone Mapping (HDR→SDR) |
| **Ressourcen** | 2048 MHz CPU, 2 GB RAM (max 16 GB) |
| **Priority** | 95 (kritischer Service) |

## Architektur

Jellyfin streamt Medien vom NFS-Share und nutzt Linstor CSI für die persistente Konfiguration. Jellyseerr dient als Wunschliste, über die Benutzer neue Medien anfordern können -- diese werden via Arr-Stack heruntergeladen und landen automatisch in der Jellyfin-Bibliothek.

```d2
direction: right

User: "User (watch.ackermannprivat.ch)" { style.border-radius: 8 }
Traefik: Traefik { style.border-radius: 8 }
JF: Jellyfin { style.border-radius: 8 }
LDAP: "Authentik LDAP Outpost" { style.border-radius: 8 }
NFS: "NFS /nfs/jellyfin" { shape: cylinder }
CSI: "Linstor CSI jellyfin-config" { shape: cylinder }
JS: Jellyseerr { style.border-radius: 8 }
ARR: "Arr Stack (Radarr, Sonarr)" { style.border-radius: 8 }

User -> Traefik: HTTPS
Traefik -> JF
JF -> LDAP: LDAP Bind
JF -> NFS: Medien lesen
JF -> CSI: Config
JS -> JF: Verfügbarkeit prüfen
JS -> ARR: Requests
ARR -> NFS: Downloads
```

## Hardware-Transcoding

Jellyfin nutzt **Intel QuickSync (QSV)** über die Intel Iris Xe iGPU der MS-01 Hosts. Die iGPU wird per Full Passthrough von Proxmox an die Nomad-Client VMs durchgereicht (`/dev/dri/renderD128`). Beide Nodes (client-05/06) haben GPU-Zugriff, sodass Jellyfin auf jedem der beiden Nodes HW-Transcoding nutzen kann.

### Konfiguration

| Einstellung | Wert | Begründung |
| :--- | :--- | :--- |
| Hardware-Beschleunigung | Intel QuickSync (QSV) | Iris Xe, 96 EU, zwei MFX-Engines |
| Decode | H.264, HEVC (8/10/12-bit), VP9, AV1 | Alle relevanten Quell-Codecs |
| Encode | H.264 (h264_qsv) | HEVC-Encoding deaktiviert -- H.264 ist ~2x schneller und browser-kompatibler |
| Tone Mapping | OpenCL (hable) | HDR10/HLG/DoVi → SDR. VPP deaktiviert wegen Regression-Bug in 10.11.x (Issue #15576) |
| Low-Power Encoder | Aus (in UI) | Auf Alder Lake im Kernel automatisch aktiv |
| Preset | fast | Guter Kompromiss aus Qualität und Speed |
| Segment-Löschung | An | Verhindert unbegrenztes Cache-Wachstum |

### Warum H.264 statt HEVC als Output

HEVC-Encoding ist nur in Safari nativ abspielbar. H.264 funktioniert in allen Browsern, ist ~2x schneller beim Encoding, und bei 20 Mbps 1080p Zielbitrate ist der Qualitätsunterschied vernachlässigbar. Infuse/Apple TV nutzen Direct Play und sind nicht betroffen.

### Performance

Die Iris Xe schafft 10+ gleichzeitige 4K-Transcodes bei nahe null CPU-Last. Ein typischer 4K HDR HEVC → 1080p H.264 SDR Transcode läuft mit ~4-6x Echtzeit.

### Bekannte Einschränkungen

- **OpenCL Tone Mapping Bug (#15576):** In 10.11.x kann HDR-Content pixelig aussehen. Falls Artifacts auftreten: VPP testen oder auf 10.12.x warten.
- **Seeking bei 4K:** Nach einem Sprung startet ein neuer Transcode -- das kann 2-3 Sekunden dauern bis der Buffer gefüllt ist.

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

Jellyfin nutzt LDAP-Bind-Authentifizierung gegen den [Authentik LDAP Outpost](../authentik/index.md) -- kein OAuth2 oder Traefik-Middleware. Das LDAP-Plugin in Jellyfin verbindet sich über Consul DNS (`authentik-ldap.service.consul:3389`) und prüft Benutzer-Credentials gegen Authentik. Benutzer werden über ihre E-Mail-Adresse (`mail`-Attribut) mit bestehenden Jellyfin-Accounts verknüpft.

Der LDAP Provider nutzt **Cached Bind + Cached Search Mode**: Der erste Login pro User nach einem Outpost-Neustart durchläuft den vollen Authentik-Flow (~2s), alle weiteren Logins kommen aus dem Outpost-Memory (<5ms). Der LDAP-Provider verwendet einen eigenen minimalen Flow (`ldap-authentication-flow`) ohne MFA und GeoIP.

::: tip Kein OAuth auf Traefik-Ebene
Anders als die meisten Services hat Jellyfin keine Traefik-Middleware-Chain für OAuth. Die Authentifizierung erfolgt vollständig in der Applikation selbst über LDAP. Dadurch können auch Mediaplayer-Clients (TV, Apps) ohne Browser-OAuth zugreifen.
:::

## Metadata-Provider (TMDb)

Jellyfin bezieht Filmmetadaten und Poster von [TheMovieDb](https://themoviedb.org). Die Library-Konfiguration nutzt die ImageFetcher-Reihenfolge `TheMovieDb → Embedded Image Extractor → Screen Grabber` -- die beiden Fallbacks extrahieren Standbilder aus der Video-Datei, wenn TMDb kein Poster liefert (Querformat statt Hochformat).

### IPv6-Disable für TMDb-Requests

`api.themoviedb.org` antwortet dual-stack mit AAAA- und A-Records. Die Homelab-VMs haben aber keine IPv6-Route nach aussen, weshalb der .NET-HttpClient von Jellyfin sporadisch in IPv6-Timeouts lief (Happy-Eyeballs) -- sichtbar im Log als `System.Net.Http.HttpRequestException: Resource temporarily unavailable (api.themoviedb.org:443)`. Im Schnitt traten so ~10 Netzwerkfehler pro Tag auf. Wenn der Fehler beim initialen Scan eines neuen Films fiel, blieb dieser ohne Poster in der Datenbank und wurde nie automatisch retried -- der Fallback-Provider extrahierte stattdessen ein Standbild aus dem Video.

Die Environment-Variable `DOTNET_SYSTEM_NET_DISABLEIPV6=1` im Job zwingt die .NET-Runtime, ausschliesslich IPv4 zu verwenden. Das eliminiert die Timeouts dauerhaft, bleibt update-sicher (keine Datei-Patches im Container) und respektiert die Eigenheit, dass der Embedded Image Extractor **immer** als letzter Fallback greift.

::: tip Locked Movies
Jellyfins `LockData=true` verhindert, dass ein Refresh (auch mit `replaceAllImages=true`) Metadata oder Images überschreibt. Wer einzelne Felder (z.B. `OfficialRating`) vor Überschreibung schützen möchte, sollte stattdessen granulare `LockedFields` setzen, sonst bleiben auch falsche Poster dauerhaft stehen.
:::

## Täglicher Restart

Ein periodischer Batch Job (`batch-jobs/daily_restart_jellyfin.nomad`) startet Jellyfin täglich um 04:00 Uhr neu. Das behebt Memory-Leaks und räumt temporäre Daten auf. Siehe [Batch Jobs](../_querschnitt/batch-jobs.md).

## Beziehung zu Jellyseerr

[Jellyseerr](../jellyseerr/index.md) ist das Wunschsystem für neue Medien. Benutzer (Familie, Gäste) können über `wish.ackermannprivat.ch` Filme und Serien anfordern. Jellyseerr prüft bei Jellyfin die Verfügbarkeit und leitet fehlende Medien an den Arr-Stack weiter.

## Abhängigkeiten

- [Authentik](../authentik/index.md) -- LDAP Bind Authentifizierung (via LDAP Outpost)
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
- [Authentik](../authentik/index.md) -- Authentifizierung (LDAP Outpost)
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Medien
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- Täglicher Restart-Job
