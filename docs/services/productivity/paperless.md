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
| **Auth** | `admin-chain-v2@file` |

## Rolle im Stack

Paperless-ngx ist das zentrale Dokumenten-Management-System (DMS) im Homelab. Es digitalisiert physische Dokumente via OCR, macht sie volltextdurchsuchbar und organisiert sie automatisch mit Tags, Korrespondenten und Dokumenttypen. Rechnungen, Verträge und Behördenpost werden gescannt, in das Consume-Verzeichnis gelegt und von Paperless automatisch verarbeitet.

## Architektur

Paperless-ngx besteht aus mehreren Komponenten: dem Webserver (Django), einem Consumer-Prozess der neue Dokumente im Consume-Verzeichnis erkennt und verarbeitet, und einem Scheduler für periodische Aufgaben. In der vereinfachten Deployment-Variante (`paperless-simple`) laufen alle Komponenten in einem Container.

```mermaid
flowchart LR
    subgraph Input["Dokumenteneingang"]
        SCAN:::entry["Scanner / E-Mail"]
    end

    subgraph Traefik["Traefik (10.0.2.1)"]
        R1:::svc["Router: paperless.*<br>admin-chain-v2"]
    end

    subgraph Nomad["Nomad Cluster"]
        PL:::accent["Paperless-ngx<br>(Web + Consumer + Scheduler)"]
        PG:::db["PostgreSQL 16<br>(postgres.service.consul)"]
    end

    subgraph Storage
        NFS:::db["NFS<br>/nfs/docker/paperless"]
    end

    SCAN -->|Datei in /consume| NFS
    PL -->|Consumer liest| NFS
    R1 --> PL
    PL --> PG
    PL --> NFS

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
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

- **Dokumente:** NFS-Verzeichnis `/nfs/docker/paperless/media` wird durch die allgemeine [Backup-Strategie](../core/backup-strategy.md) abgedeckt
- **Datenbank:** PostgreSQL Shared Cluster, siehe [Datenbank-Architektur](../../architecture/database-architecture.md)
- **Export:** Paperless bietet einen eingebauten Export-Mechanismus nach `/nfs/docker/paperless/export`

## Verwandte Seiten

- [Datenbank-Architektur](../../architecture/database-architecture.md) -- PostgreSQL Shared Cluster
- [Backup-Strategie](../core/backup-strategy.md) -- Übergeordnetes Backup-Konzept
- [NAS-Speicher](../../infrastructure/storage-nas.md) -- NFS-Storage für Dokumente
- [Traefik Middlewares](../../platforms/traefik-middlewares.md) -- Auth-Chain-Konfiguration
