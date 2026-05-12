---
title: Directus Gravel
description: Headless CMS fuer die persoenliche Gravel-Bike-Recherche
tags:
  - service
  - directus
  - recherche
  - cms
---

# Directus Gravel

Headless CMS fuer die strukturierte Recherche von Gravel-Bike-Herstellern und -Modellen, mit Fokus auf Schutzblech-Tauglichkeit. Multi-Agenten-Recherche schreibt Daten via REST-API ein, das UI dient zum Browsen, Filtern und Bewerten.

## Architektur

| Attribut | Wert |
| :--- | :--- |
| URL | Siehe [Web-Interfaces](../_referenz/web-interfaces.md#produktivität) |
| Auth | Authentik Forward-Auth via `intern-auth@file` + Directus eigene Admin-Login |
| Database | PostgreSQL (Shared Cluster, DB `gravel_recherche`) -- Details in [Datenbanken](../_referenz/datenbanken.md) |
| File Storage | MinIO S3, Bucket `gravel-recherche` (Service-Account mit dedizierter Bucket-Policy) -- Details in [NAS-Speicher](../nas-storage/) |
| Secrets | Vault `kv/data/directus-gravel`, 1Password Item "Directus Gravel" |
| Nomad Job | `infra/nomad-jobs/services/directus-gravel.nomad` |

## Rolle im Stack

Klassischer Headless-CMS-Use-Case: ein API-First-Backend, das Recherche-Agenten direkt befuellen, ein Web-UI zum Sortieren/Filtern/Galerie-Ansicht und persistenter Storage fuer Bilder. Die Architektur entkoppelt Daten (Postgres) von Files (S3) -- das Wiki dokumentiert keine volatilen Recherche-Inhalte, die liegen ausschliesslich in der Directus-Instanz.

## Datenmodell

Fuenf Collections plus eine Junction-Table fuer M2M-Tags:

- **manufacturers** -- Bike-Hersteller mit Region, Typ (mainstream/boutique/custom-builder/direct), Status-Tracking fuer den Recherche-Fortschritt, Logo (S3)
- **bikes** -- Modelle mit ~70 Feldern: Basis (Name, Jahr, Material, Preis, Bild), Komponenten (Groupset, Drivetrain, Reifenfreiheit), Schutzblech-Spezifika (Mount-Status + -Quality, offizielles Kit, max. Reifen mit Schutzblech), Mounts (Bottle/TopTube/Fork/Rack/Dynamo), Geometrie pro gewaehlter Groesse, Verfuegbarkeit CH, vier Bewertungsachsen (1-10), Notizen + Pros/Cons/Questions, Review-Links als JSON-Liste
- **bike_images** -- Mehrere Bilder pro Bike mit Kind-Klassifikation (hero/side/detail/geometry/groupset/fender_mount), Quelle, Sortierung
- **comments** -- Strukturierte Notizen pro Bike (pro/con/question/note/review_quote) mit Quelle
- **tags** -- Freie Tags (z.B. "carbon-fork", "dynamo-ready") via M2M

## Recherche-Phasen

Phase 1 inventarisiert Hersteller weltweit (CH/EU/UK/US/Asia). Phase 2 mappt pro Hersteller alle aktuellen Gravel-Modelle ohne Schutzblech-Filter. Phase 3 ergaenzt Schutzblech-Daten pro Bike und filtert auf Shortlist. Phase 4 macht Detail-Recherche fuer die Top-Kandidaten (Geometrie, Komponenten, Bewertungen, mehrere Bilder).

Status der Recherche und offene Punkte: [ClickUp 86c9jj6ec](https://app.clickup.com/t/86c9jj6ec).

## Auth-Modell

Doppelte Auth-Schicht: Traefik laesst nur Authentik-authentifizierte interne Requests durch (`intern-auth@file`-Chain), Directus authentifiziert dann separat den Admin-Login. SSO via OIDC waere die saubere Loesung -- fuer einen Single-User-Use-Case ist die Doppel-Auth jedoch akzeptabel.

## Verwandte Seiten

- [NAS-Speicher](../nas-storage/) -- MinIO S3 Bucket-Architektur
- [Datenbanken](../_referenz/datenbanken.md) -- Postgres-Cluster und DB-Zuordnung
- [Web-Interfaces](../_referenz/web-interfaces.md) -- URL-Verzeichnis
- [Zugangsdaten](../_referenz/credentials.md) -- Vault- und 1P-Speicherorte
- [Traefik](../traefik/) -- Middleware-Chains und ForwardAuth
