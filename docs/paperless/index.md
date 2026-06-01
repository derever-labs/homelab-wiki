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

Paperless-ngx ist das zentrale Dokumenten-Management-System mit OCR, automatischer Klassifizierung und Volltextsuche.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [paperless.ackermannprivat.ch](https://paperless.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/paperless-simple.nomad` |
| Storage | Linstor CSI `paperless-data-r2` (Symlinks nach `/paperless-storage/`); NFS nur für AI-Sidecars |
| Auth | `intern-auth@file` |
| Secrets | Vault `kv/data/paperless-simple` |

## Rolle im Stack

Paperless-ngx ist das zentrale Dokumenten-Management-System (DMS) im Homelab. Es digitalisiert physische Dokumente via OCR, macht sie volltextdurchsuchbar und organisiert sie automatisch mit Tags, Korrespondenten und Dokumenttypen. Rechnungen, Verträge und Behördenpost werden gescannt, in das Consume-Verzeichnis gelegt und von Paperless automatisch verarbeitet.

## Architektur

Paperless-ngx besteht aus mehreren Komponenten: dem Webserver (Django), einem Consumer-Prozess der neue Dokumente im Consume-Verzeichnis erkennt und verarbeitet, und einem Scheduler für periodische Aufgaben. In der vereinfachten Deployment-Variante (`paperless-simple`) laufen alle Komponenten in einem Container.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: right

Input: Dokumenteneingang {
  style.stroke-dash: 4
  SCAN: "Scanner / E-Mail" { style.border-radius: 8 }
}

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: 10.0.2.20
  R1: "Router: paperless.*\nintern-auth" { style.border-radius: 8 }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  PL: "Paperless-ngx\n(Web + Consumer + Scheduler)" { style.border-radius: 8 }
  PG: "PostgreSQL\n(postgres.service.consul)" { shape: cylinder }
}

Storage: {
  style.stroke-dash: 4
  CSI: "Linstor CSI\npaperless-data-r2" { shape: cylinder }
}

Input.SCAN -> Storage.CSI: Datei in /consume
Traefik.R1 -> Nomad.PL
Nomad.PL -> Storage.CSI: Consumer liest
Nomad.PL -> Nomad.PG
Nomad.PL -> Storage.CSI
```

## Konfiguration

### Storage

Die Verzeichnisstruktur (`media`, `consume`, `data`, `export`) wird im Linstor-CSI-Volume `paperless-data-r2` angelegt und per Symlink unter `/paperless-storage/` in den Container gespiegelt; die genaue Definition steht in `services/paperless-simple.nomad`.

### Dokumentenverarbeitung

Der Consumer-Prozess überwacht das Consume-Verzeichnis und verarbeitet neue Dateien automatisch: OCR-Erkennung (Tesseract), Klassifizierung (Tags, Korrespondent, Dokumenttyp), Archivierung als PDF/A mit eingebettetem Text und Volltextindizierung.

## Backup

- **Dokumente:** Linstor-CSI-Volume `paperless-data-r2`, abgedeckt durch die allgemeine [Backup-Strategie](../backup/index.md)
- **Datenbank:** PostgreSQL Shared Cluster, siehe [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md)
- **Export:** Paperless bietet einen eingebauten Export-Mechanismus (Ziel `/paperless-storage/export` im CSI-Volume)

## Verwandte Seiten

- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Dokumente
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
