---
title: Jellyfin
description: Medienserver für Filme und Serien
published: true
date: 2025-12-26T18:30:00+00:00
tags: service, nomad, media
editor: markdown
---

# Jellyfin

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [watch.ackermannprivat.ch](https://watch.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`media/jellyfin.nomad`) |
| **Node** | `vm-nomad-client-05` (Pinned via Constraint) |
| **Ports** | 8096 (Internal/Static) |

## Beschreibung
Jellyfin ist ein freier Software-Medienserver zur Organisation, Verwaltung und zum Streaming von digitalen Mediendateien auf vernetzte Geräte.

## Konfiguration
### Nomad
* **Image:** `harbor.ackermannprivat.ch/lscr-cache/linuxserver/jellyfin:10.10.5`
* **Ressourcen:** 4096 CPU, 12-16GB RAM (Hoher Bedarf für Transcoding)
* **Volumes:**
  * `/nfs/jellyfin/` -> `/jellyfin` (Mediathek)
  * `/local-docker/jellyfin/config` -> `/config` (Konfiguration)
  * `/tmp/jellyfin` -> `/config/cache` (Cache)
  * `/nfs/docker/jellyfin/temp-transcodes` -> `/config/data/transcodes/` (Transcoding)

### Traefik Tags
```hcl
traefik.http.routers.jellyfin.rule=Host(`watch.ackermannprivat.ch`)
traefik.http.routers.jellyfin.entrypoints=https
traefik.http.routers.jellyfin.tls=true
```

## Abhängigkeiten
- **Storage:** NFS Share für Medien (Synology)
- **Identity:** Lokale Userverwaltung (aktuell kein LDAP/SSO aktiv)

## Maintenance & Runbook
### Update
Das Image wird im Nomad-Job File aktualisiert. Danach:
```bash
nomad job run infra/nomad-jobs/media/jellyfin.nomad
```

### Backup
- Die `/config` Daten liegen auf lokalem SSD Storage der VM und sollten regelmässig gesichert werden.
- Die Mediendaten auf dem NFS unterliegen der Backup-Strategie des NAS.

---
*Dokumentation erstellt am: 26.12.2025*