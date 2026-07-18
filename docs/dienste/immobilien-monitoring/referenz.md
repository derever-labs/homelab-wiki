---
title: Immobilien-Monitoring Referenz
description: Referenz-Tabellen der Datenpipeline -- URL-Struktur, Scan-Tiers, DB-Schema, Enrichment-Felder, Vault-Secrets und Credit-Management
tags:
  - service
  - scraping
  - referenz
---

# Immobilien-Monitoring Referenz

Diese Seite bündelt die Referenz-Tabellen der Datenpipeline: die Homegate-URL-Struktur, die Scan-Tiers, das PostgreSQL-Schema, die KI-Enrichment-Felder, die Vault-Secrets und das Scrapfly-Credit-Management. Architektur und Scan-Ablauf beschreibt das [Immobilien-Monitoring](./index.md), die vorgelagerte Neubau-Erkennung die [Frühsignal-Pipeline](./fruehsignal.md).

## Homegate URL-Struktur

- Trefferliste: `.../plz-{PLZ}/trefferliste?be=7000` (Preis bis CHF 7000)
- Pagination: `&ep=2`, `&ep=3` etc. (20 Resultate pro Seite)
- Detailseite: `https://www.homegate.ch/mieten/{external_id}`

## Scan-Tiers (PLZ-Strategie)

| Tier | Portal | Gebiet | Job | Intervall |
|------|--------|--------|-----|-----------|
| 1 | Homegate | PLZ 5605 (Dottikon) | `immoscraper` | Alle 3 Tage |
| 3 | Homegate | PLZ 5610 (Wohlen AG) | `immoscraper-weekly` | Wöchentlich |
| N | ImmoScout24 | 11 Orte in der Region | `immoscraper-weekly` | Wöchentlich |

Homegate zeigt bei einer PLZ-Suche auch Ergebnisse aus umliegenden Gemeinden an. PLZ 5605 deckt damit den Grossteil des 7km-Radius ab (Dottikon, Hendschiken, Othmarsingen, Hägglingen, Villmergen). PLZ 5610 ergänzt das Randgebiet Wohlen AG.

ImmoScout24 wird über 11 ortbasierte Suchen in der Region abgefragt -- nur Overview-Daten, kein Detail-Scraping (exklusive Listings sind selten und die Basisdaten reichen für die Erkennung).

Referenzpunkt für Distanzberechnung: Dottikon 47.3775 / 8.2394

## Datenbank-Schema

Die Datenbank `immo` auf dem PostgreSQL Shared Cluster. Die vollständige DDL liegt als Migrations im Repo (`services/n8n-workflows/scraper/`); hier nur Zweck und architektur-relevante Felder pro Tabelle:

- **listing** -- Haupttabelle, Unique Constraint `(portal, external_id)`. Architektur-relevant sind das Enrichment-Feld `enrichment_data` (JSONB) und die zwei manuell pflegbaren Felder `first_seen_at_override` (echter Vermarktungsstart) und `first_seen_source` (Provenance-Label fürs Frontend)
- **listing_photo** -- Foto-Metadaten. Relevant: `storage_path` (relativer NFS-Pfad) und `download_status` für die Foto-Archivierung
- **listing_external_id_history** -- Historische externe IDs pro Portal; primäre Quelle für den Vermarktungsstart bei Re-Listings, siehe Vermarktungsstart-Tracking im [Frontend-Wiki](../immo-monitor/index.md)
- **listing_price_history** -- Preisänderungen, bei Smart-Skip-Entscheidung "geändert" automatisch befüllt
- **listing_note** -- User-Bewertungen für Metabase (Rating, Favorit, Abgelehnt)

### Amenities (normalisiert)

- **amenity** -- Lookup-Tabelle mit Unique `name`
- **listing_amenity** -- Junction-Table (`listing_id`, `amenity_id`)

Homegate liefert Amenities als Boolean-Felder. Diese werden in die normalisierten Tabellen gemappt, weil Metabase JSONB-Arrays nicht filtern kann.

### Neubau-Projekt-Tabellen

- **project** -- Neubauprojekte mit Developer, Architekt, Energiestandard, Baufortschritt; `marketing_started_at` als etappenweite Datierung für `project_unit`-basierte Listings
- **project_listing** -- Junction zu Listings
- **project_unit** -- Einzelne Wohneinheiten mit generiertem `price_per_m2`
- **project_source** -- Recherche-Quellen mit Zeitstempel

### Views und Tracking

- **v_listing_active** -- Primäre Metabase-Datenquelle mit berechneten Spalten (`price_per_m2`, `days_on_market`, User-Bewertungen)
- **scraper_runs** -- Statistiken pro Lauf (Dauer, Listings, Fehler, Credits, Enrichment-Zähler)

## Enrichment-Felder

Claude Haiku reichert die Listings mit den folgenden strukturierten Feldern an, die Homegate nicht als eigene Felder liefert (Ablauf und Grenzen beschreibt [KI-Enrichment](./index.md#ki-enrichment)):

| Feld | Beispielwert |
|------|-------------|
| Stockwerk | 2 (EG = 0, UG = -1) |
| Balkon / Terrasse | ja/nein |
| Parkplatz / Garage | ja/nein |
| Lift | ja/nein |
| Minergie-Standard | Minergie, Minergie-P, Minergie-A |
| Heizungstyp | Fussbodenheizung, Fernwärme, Wärmepumpe |
| Waschküche | Eigene Waschmaschine, Gemeinschaftswaschküche |
| Baujahr / Renovation | 2024, 2019 |
| Highlights | Max 5 besondere Merkmale |

## Vault Secrets

| Pfad | Keys | Zweck |
|------|------|-------|
| `kv/data/immoscraper` | `db_password` | PostgreSQL Zugang |
| `kv/data/immoscraper` | `scrapfly_api_key` | Scrapfly REST-API |
| `kv/data/immoscraper` | `claude_api_key` | Claude Haiku Enrichment |
| `kv/data/shared/telegram` | `bot_token`, `chat_id` | Telegram Notifications |
| `kv/data/github-runner` | `access_token` | GitHub Actions Runner PAT |

## Scrapfly Credit-Management

| Scan-Typ | Credits pro Lauf | Intervall | Credits/Monat |
|----------|-----------------|-----------|--------------|
| Overview PLZ 5605 (~15 Seiten) | ~375 | Alle 3 Tage | ~3.750 |
| Detail-Scrapes (~30 neue) | ~750 | Alle 3 Tage | ~7.500 |
| Overview PLZ 5610 (~15 Seiten) | ~375 | Wöchentlich | ~1.500 |
| IS24 Nebenscan (~13 Seiten) | ~325 | Wöchentlich | ~1.300 |
| **Total geschätzt** | | | **~14.050** |

Der Discovery Plan bietet 200.000 Credits/Monat für $30 -- die geschätzte Auslastung liegt bei ~6%.

Jeder Scrapfly-Request liefert den Credit-Verbrauch in der API-Response zurück. Der Scraper summiert diese pro Lauf und schreibt den Gesamtwert in `scraper_runs`. Die Telegram-Notification zeigt den Verbrauch ebenfalls an.

## Verwandte Seiten

- [Immobilien-Monitoring](./index.md) -- Architektur, Scan-Ablauf und Betrieb der Datenpipeline
- [Frühsignal-Pipeline](./fruehsignal.md) -- vorgelagerte Neubau-Erkennung
- [Immo-Monitor Frontend](../immo-monitor/index.md) -- Web-App über den Daten
