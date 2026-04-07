---
title: Paperless-ngx
description: Selbstgehostetes Dokumenten-Management-System mit OCR, automatischer Klassifizierung und PostgreSQL-Backend
tags:
  - service
  - productivity
  - nomad
  - dms
---

# Paperless-ngx

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [paperless.ackermannprivat.ch](https://paperless.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/paperless-simple.nomad`) |
| **Storage** | NFS `/nfs/docker/paperless/{media,consume,data,export}` |
| **Datenbank** | PostgreSQL (Shared Cluster via `postgres.service.consul`) |
| **Auth** | `intern-auth@file` |

## Rolle im Stack

Paperless-ngx ist das zentrale Dokumenten-Management-System (DMS) im Homelab. Es digitalisiert physische Dokumente via OCR, macht sie volltextdurchsuchbar und organisiert sie automatisch mit Tags, Korrespondenten und Dokumenttypen. Rechnungen, Verträge und Behördenpost werden gescannt, in das Consume-Verzeichnis gelegt und von Paperless automatisch verarbeitet.

## Architektur

Paperless-ngx besteht aus mehreren Komponenten: dem Webserver (Django), einem Consumer-Prozess der neue Dokumente im Consume-Verzeichnis erkennt und verarbeitet, und einem Scheduler für periodische Aufgaben. In der vereinfachten Deployment-Variante (`paperless-simple`) laufen alle Komponenten in einem Container.

```d2
direction: right

Input: Dokumenteneingang {
  style.stroke-dash: 4
  SCAN: "Scanner / E-Mail"
}

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: 10.0.2.20
  R1: "Router: paperless.*\nintern-auth"
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  PL: "Paperless-ngx\n(Web + Consumer + Scheduler)"
  PG: "PostgreSQL 16\n(postgres.service.consul)" { shape: cylinder }
}

Storage: {
  style.stroke-dash: 4
  NFS: "NFS\n/nfs/docker/paperless" { shape: cylinder }
}

Input.SCAN -> Storage.NFS: Datei in /consume
Traefik.R1 -> Nomad.PL
Nomad.PL -> Storage.NFS: Consumer liest
Nomad.PL -> Nomad.PG
Nomad.PL -> Storage.NFS
```

## Konfiguration

### Storage

| Verzeichnis | Zweck |
| :--- | :--- |
| `/nfs/docker/paperless/media` | Verarbeitete Dokumente (Originale und OCR-Versionen) |
| `/nfs/docker/paperless/consume` | Eingangsverzeichnis -- neue Dokumente werden automatisch importiert |
| `/nfs/docker/paperless/data` | Suchindex und Thumbnails |
| `/nfs/docker/paperless/export` | Backup-Exporte |

### Datenbank

PostgreSQL auf dem Shared Cluster. Paperless speichert Dokument-Metadaten, Tags, Korrespondenten und Dokumenttypen in der Datenbank. Die eigentlichen Dateien liegen auf NFS.

### Dokumentenverarbeitung

Der Consumer-Prozess überwacht das Consume-Verzeichnis und verarbeitet neue Dateien automatisch:

1. OCR-Erkennung (Tesseract)
2. Automatische Klassifizierung (Tags, Korrespondent, Dokumenttyp)
3. Archivierung als PDF/A mit eingebettetem Text
4. Volltextindizierung für die Suche

## Backup

- **Dokumente:** NFS-Verzeichnis `/nfs/docker/paperless/media` wird durch die allgemeine [Backup-Strategie](../backup/index.md) abgedeckt
- **Datenbank:** PostgreSQL Shared Cluster, siehe [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md)
- **Export:** Paperless bietet einen eingebauten Export-Mechanismus nach `/nfs/docker/paperless/export`

## Verwandte Seiten

- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Dokumente
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
