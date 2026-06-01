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

Headless CMS für die strukturierte Recherche von Gravel-Bike-Herstellern und -Modellen, mit Fokus auf Schutzblech-Tauglichkeit. Multi-Agenten-Recherche schreibt Daten via REST-API ein, das UI dient zum Browsen, Filtern und Bewerten.

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| URL | Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `infra/nomad-jobs/services/directus-gravel.nomad` |
| Auth | Authentik Forward-Auth (`intern-auth@file`) + Directus Admin-Login |
| Storage | PostgreSQL (DB `gravel_recherche`) und Garage S3 (Bucket `gravel-recherche`) -- Details in [Datenbanken](../_referenz/datenbanken.md) und [NAS-Speicher](../nas-storage/) |
| Secrets | Vault `kv/data/directus-gravel` -- Speicherorte in [Zugangsdaten](../_referenz/credentials.md) |

## Rolle im Stack

Klassischer Headless-CMS-Use-Case: ein API-First-Backend, das Recherche-Agenten direkt befüllen, ein Web-UI zum Sortieren/Filtern/Galerie-Ansicht und persistenter Storage für Bilder. Die Architektur entkoppelt Daten von Files -- das Wiki dokumentiert keine volatilen Recherche-Inhalte, die liegen ausschliesslich in der Directus-Instanz.

## Datenmodell

Fünf Collections plus eine Junction-Table für M2M-Tags. Das Schema lebt im Directus-UI; das Wiki nennt nur Zweck und Beziehungen:

- **manufacturers** -- Bike-Hersteller mit Region, Typ und Recherche-Status
- **bikes** -- Haupttabelle mit Geometrie, Komponenten, Schutzblech-Daten und Bewertungen
- **bike_images** -- mehrere Bilder pro Bike, klassifiziert und sortiert (S3)
- **comments** -- strukturierte Notizen pro Bike mit Quelle
- **tags** -- freie Tags via M2M

## Auth-Modell

Doppelte Auth-Schicht: Traefik lässt nur Authentik-authentifizierte interne Requests durch (`intern-auth@file`-Chain), Directus authentifiziert dann separat den Admin-Login.

::: warning Bekannte Limitation
SSO via OIDC wäre die saubere Lösung -- für den Single-User-Use-Case ist die Doppel-Auth jedoch akzeptabel.
:::

## Verwandte Seiten

- [NAS-Speicher](../nas-storage/) -- Garage S3 und Bucket-Architektur
- [Datenbanken](../_referenz/datenbanken.md) -- Postgres-Cluster und DB-Zuordnung
- [Web-Interfaces](../_referenz/web-interfaces.md) -- URL-Verzeichnis
- [Zugangsdaten](../_referenz/credentials.md) -- Vault- und 1P-Speicherorte
- [Traefik](../traefik/) -- Middleware-Chains und ForwardAuth
