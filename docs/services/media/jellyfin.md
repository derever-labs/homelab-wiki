---
title: Jellyfin
description: Medienserver fuer Filme und Serien
tags:
  - service
  - nomad
  - media
---

# Jellyfin

## Übersicht
| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [watch.ackermannprivat.ch](https://watch.ackermannprivat.ch) |
| **Image** | `localhost:5000/linuxserver/jellyfin:latest` |
| **Deployment** | Nomad Job (`media/jellyfin.nomad`) |
| **Node** | `vm-nomad-client-05` (Pinned via Constraint) |
| **Ressourcen** | 4096 CPU, 12-16GB RAM (hoher Bedarf für Transcoding) |

## Beschreibung

Jellyfin ist ein freier Software-Medienserver zur Organisation, Verwaltung und zum Streaming von digitalen Mediendateien auf vernetzte Geräte.

Volumes, Traefik-Tags und weitere Konfiguration sind im Nomad Job (`media/jellyfin.nomad`) definiert.

## Abhängigkeiten

- **Storage:** NFS Share für Medien (Synology)
- **Identity:** [OpenLDAP](../core/ldap.md) (LDAP Bind Authentifizierung)

## Backup

- Die `/config` Daten liegen auf lokalem SSD Storage der VM und sollten regelmässig gesichert werden.
- Die Mediendaten auf dem NFS unterliegen der Backup-Strategie des NAS.

---
