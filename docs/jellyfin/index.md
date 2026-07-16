---
title: Jellyfin
description: Medienserver für Filme und Serien mit Intel QSV Hardware-Transcoding und LDAP-Authentifizierung
tags:
  - service
  - nomad
  - media
  - linstor
---

# Jellyfin

Jellyfin ist der zentrale Medienserver für Filme und Serien. Er nutzt Intel QSV Hardware-Transcoding für 4K HDR-Streams und authentifiziert Benutzer direkt via LDAP gegen den Authentik LDAP Outpost.

Die Referenz -- Hardware-Transcoding-Codecs, Storage-Mounts, Traefik-Routing und Wartungsbanner -- steht in der [Jellyfin Referenz](./referenz.md); die Betriebsprozeduren (LDAP-Authentifizierung, IPv6-Handling, täglicher Restart, Kurator-Playlists) in [Jellyfin Betrieb](./betrieb.md).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [watch.ackermannprivat.ch](https://watch.ackermannprivat.ch) |
| Deployment | Nomad Job `media/jellyfin.nomad` |
| Nodes | `vm-nomad-client-05/06` (Constraint, folgt dem CSI Volume) |
| Config Storage | Linstor CSI Volume `jellyfin-config` (DRBD-repliziert) |
| Media Storage | NFS `/nfs/jellyfin` ([NAS](../nas-storage/index.md)) |
| Auth | LDAP Bind via [Authentik LDAP Outpost](../edge/authentik/index.md) (kein OAuth/ForwardAuth) |
| GPU | Intel Iris Xe (i9-12900H) via Full Passthrough von [Proxmox](../proxmox/index.md) |
| Transcoding | Intel QSV (Hardware), OpenCL Tone Mapping (HDR→SDR) |

## Architektur

Jellyfin streamt Medien vom NFS-Share und nutzt Linstor CSI für die persistente Konfiguration. Jellyseerr dient als Wunschliste, über die Benutzer neue Medien anfordern können -- diese werden via Arr-Stack heruntergeladen und landen automatisch in der Jellyfin-Bibliothek.

```d2
direction: right

Clients: Zugriff {
  style.stroke-dash: 4
  USER: "Browser / Jellyfin-Apps" { style.border-radius: 8 }
}

Traefik: Traefik {
  style.stroke-dash: 4
  R: "Router watch.*\npublic-noauth (kein ForwardAuth)" { style.border-radius: 8 }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  JF: Jellyfin { style.border-radius: 8 }
}

LDAP: "Authentik LDAP Outpost" { style.border-radius: 8 }

Storage: Storage {
  style.stroke-dash: 4
  CSI: "Linstor CSI\njellyfin-config" { shape: cylinder }
  NFS: "NFS /nfs/jellyfin" { shape: cylinder }
}

Wunsch: Wunsch-Kette {
  style.stroke-dash: 4
  JS: Jellyseerr { style.border-radius: 8 }
  ARR: "Arr-Stack (Radarr, Sonarr)" { style.border-radius: 8 }
}

Clients.USER -> Traefik.R: HTTPS
Traefik.R -> Nomad.JF
Nomad.JF -> LDAP: LDAP Bind
Nomad.JF -> Storage.CSI: Config
Nomad.JF -> Storage.NFS: Medien lesen
Wunsch.JS -> Nomad.JF: "Verfügbarkeit prüfen"
Wunsch.JS -> Wunsch.ARR: Requests
Wunsch.ARR -> Storage.NFS: Downloads
```

## Beziehung zu Jellyseerr

[Jellyseerr](../jellyseerr/index.md) ist das Wunschsystem für neue Medien. Benutzer (Familie, Gäste) können über `wish.ackermannprivat.ch` Filme und Serien anfordern. Jellyseerr prüft bei Jellyfin die Verfügbarkeit und leitet fehlende Medien an den Arr-Stack weiter.

## Abhängigkeiten

- [Authentik](../edge/authentik/index.md) -- LDAP Bind Authentifizierung (via LDAP Outpost)
- [Jellyseerr](../jellyseerr/index.md) -- Media Request Management
- [Arr Stack](../arr-stack/index.md) -- Automatisierte Medien-Akquisition
- [NAS-Speicher](../nas-storage/index.md) -- Medienbibliothek unter `/nfs/jellyfin`
- [Linstor](../linstor-storage/index.md) -- CSI Storage für das Config-Volume

## Backup

- **Config:** Linstor CSI Volume `jellyfin-config` -- DRBD-repliziert über `client-05/06`. Zusätzlich durch die allgemeine [Backup-Strategie](../backup/index.md) abgedeckt.
- **Cache/Transcodes:** Flüchtig auf `/tmp`, kein Backup notwendig.
- **Mediendaten:** NFS-Share auf dem [NAS](../nas-storage/index.md), unterliegt der NAS-eigenen Backup-Strategie.

## Verwandte Seiten

- [Jellyfin Referenz](./referenz.md) -- Transcoding, Storage, Traefik-Routing, Wartungsbanner
- [Jellyfin Betrieb](./betrieb.md) -- Authentifizierung, IPv6, täglicher Restart, Kurator-Playlists
- [Jellyseerr](../jellyseerr/index.md) -- Media Request Management
- [Arr Stack](../arr-stack/index.md) -- Automatisierte Medien-Akquisition
- [Audiobookshelf](../audiobookshelf/index.md) -- Teilt die Bücher-Mediathek
- [Authentik](../edge/authentik/index.md) -- Authentifizierung (LDAP Outpost)
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Medien
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- Täglicher Restart-Job
