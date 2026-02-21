---
title: Jellyfin
description: Medienserver fuer Filme und Serien
published: true
date: 2025-12-26T18:30:00+00:00
tags: service, nomad, media
editor: markdown
---

# Jellyfin

## Uebersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [watch.ackermannprivat.ch](https://watch.ackermannprivat.ch) |
| **Image** | `localhost:5000/linuxserver/jellyfin:latest` |
| **Deployment** | Nomad Job (`media/jellyfin.nomad`) |
| **Node** | `vm-nomad-client-05` (Pinned via Constraint) |
| **Ressourcen** | 4096 CPU, 12-16GB RAM (hoher Bedarf fuer Transcoding) |

## Beschreibung

Jellyfin ist ein freier Software-Medienserver zur Organisation, Verwaltung und zum Streaming von digitalen Mediendateien auf vernetzte Geraete.

Volumes, Traefik-Tags und weitere Konfiguration sind im Nomad Job (`media/jellyfin.nomad`) definiert.

## Abhaengigkeiten

- **Storage:** NFS Share fuer Medien (Synology)
- **Identity:** Lokale Userverwaltung (aktuell kein LDAP/SSO aktiv)

## Backup

- Die `/config` Daten liegen auf lokalem SSD Storage der VM und sollten regelmaessig gesichert werden.
- Die Mediendaten auf dem NFS unterliegen der Backup-Strategie des NAS.

---
*Dokumentation erstellt am: 26.12.2025*
