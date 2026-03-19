---
title: Immobilien-Monitoring
description: Erfassung und Analyse von Mietangeboten in der Region Dottikon AG (7km Radius)
tags:
  - service
  - n8n
  - metabase
  - nomad
  - scraping
---

# Immobilien-Monitoring

## Uebersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Aktiv (v4 -- MCP Playwright + Claude Code Skill) |
| **Zweck** | Mietmarkt-Monitoring fuer MFH-Neubau Dottikon AG |
| **Manueller Scan** | Claude Code Skill `/homegate-scan` (MCP Playwright, lokaler Chrome) |
| **Automatisiert** | Geplant: Scrapfly ($30/Monat, warten auf Zugang) |
| **Nomad Job** | `services/immoscraper.nomad` (Periodic Batch, pausiert bis Scrapfly) |
| **n8n** | [n8n.ackermannprivat.ch](https://n8n.ackermannprivat.ch) |
| **Metabase** | [metabase.ackermannprivat.ch](https://metabase.ackermannprivat.ch) |
| **Datenbank** | PostgreSQL `n8n` -- 7 Tabellen + 1 View |
| **Repo** | `nomad-jobs/services/n8n-workflows/scraper/` |

## Beschreibung

Monitoring von Mietinseraten im 7km-Radius um Dottikon AG. Zwei parallele Zugangswege:

- **Manuell (aktuell):** Claude Code Skill `/homegate-scan` nutzt MCP Playwright (lokalen Chrome) um Homegate zu scannen. DataDome erkennt den echten Browser nicht.
- **Automatisiert (geplant):** Scrapfly als Anti-Bot-Proxy fuer den bestehenden Node.js-Scraper auf Nomad. Zugang laeuft (5 Tage Wartezeit auf Registrierung).

## Architektur (v4)

```mermaid
flowchart TB
    subgraph manuell ["Manueller Scan (Claude Code)"]
        SK:::entry["/homegate-scan Skill"]
        MCP:::svc["MCP Playwright<br/>(lokaler Chrome)"]
    end

    subgraph auto ["Automatisiert (geplant)"]
        NJ:::entry["immoscraper Container<br/>(Nomad Periodic Batch)"]
        SF:::accent["Scrapfly API<br/>(Anti-Bot Proxy)"]
    end

    subgraph portale ["Immobilienportale"]
        HG:::ext[Homegate]
    end

    subgraph pg ["PostgreSQL (Nomad)"]
        LS:::db[(listing)]
        LP:::db[(listing_photo)]
        AM:::db[(amenity +<br/>listing_amenity)]
        PH:::db[(listing_price_history)]
        SR:::db[(scraper_runs)]
        VW:::db[v_listing_active<br/>View]
    end

    MB:::accent[Metabase Dashboard]

    SK --> MCP
    MCP -->|"Browser besucht"| HG
    MCP -->|"__INITIAL_STATE__<br/>__PINIA_INITIAL_STATE__"| SK
    SK -->|"SQL via Node.js pg"| LS
    SK -->|"SQL via Node.js pg"| LP
    SK -->|"SQL via Node.js pg"| AM

    NJ -->|"via Scrapfly"| SF
    SF -->|"DataDome Bypass"| HG
    NJ -->|"UPSERT"| LS

    LS --> VW
    VW --> MB
    LP --> MB
    SR --> MB

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Anti-Bot: DataDome + Cloudflare

::: warning Zentrale Erkenntnis
DataDome + Cloudflare auf Homegate blockieren ALLES ausser echten Browsern. Es liegt nicht am Verhalten (Navigation, Delays) sondern an IP-Reputation und TLS-Fingerprinting.
:::

**Getestet und gescheitert:**
- rebrowser-playwright-core (CDP-Leak gepatcht) -- sofort erkannt
- Headed Chrome + Xvfb im Docker -- sofort erkannt
- Evomi Scraping Browser (WebSocket CDP) -- Challenge loest sich nie
- Evomi Scraper API -- 504 Gateway Timeout
- Stealth-Scripts (WebGL, AudioContext, Battery API etc.) -- hilft nicht

**Funktioniert:**
- **MCP Playwright** (lokaler Chrome auf dem Mac) -- DataDome sieht normalen Browser, Residential-IP
- **Scrapfly** (96% DataDome-Erfolgsrate, $30/Monat) -- noch nicht getestet, Zugang laeuft

## Datenextraktion

| Seitentyp | Datenquelle | Methode | LLM-Kosten |
| :--- | :--- | :--- | :--- |
| **Uebersicht** (Trefferliste) | `window.__INITIAL_STATE__` | Deterministisches JSON-Parsing | CHF 0 |
| **Detail** (Einzelinserat) | `window.__PINIA_INITIAL_STATE__` (Vue 3/Pinia) | Deterministisches JSON-Parsing | CHF 0 |

Kein LLM noetig -- beide Datenquellen liefern strukturiertes JSON direkt aus dem Browser-State.

### Homegate URL-Struktur

- Alle Mietinserate: `.../plz-{PLZ}/trefferliste?be=7000` (Preis bis CHF 7000)
- Nur Neubauten: `.../plz-{PLZ}/trefferliste?be=7000&an=G`
- Pagination: `&ep=1`, `&ep=2` etc. (20 Resultate pro Seite)
- Detail: `https://www.homegate.ch/mieten/{external_id}`

### Region

6 PLZ-Codes decken den 7km-Radius gut ab (Homegate zeigt auch umliegende Ergebnisse):

Dottikon (5605), Hendschiken (5604), Othmarsingen (5504), Haegglingen (5607), Villmergen (5612), Wohlen AG (5610)

Referenzpunkt fuer Distanzberechnung: Dottikon 47.3775 / 8.2394

## Kernkonzept: Smart Skipping

Statt jedes Listing bei jedem Run komplett zu scrapen:

1. **Uebersichtsseite** liefert: `external_id`, Preis, Zimmer, Titel, Koordinaten
2. **DB-Abgleich** pro Listing:
   - `external_id` NICHT in DB -- NEU -- Detail-Scrape + Insert
   - `external_id` in DB, Preis GLEICH -- BEKANNT -- nur `last_seen_at` updaten
   - `external_id` in DB, Preis ANDERS -- GEAENDERT -- Detail-Re-Scrape + Preishistorie
   - `external_id` in DB, `detail_scraped_at IS NULL` -- FEHLEND -- Detail-Scrape nachholen

## Claude Code Skill: /homegate-scan

Der Skill orchestriert den gesamten Scan-Prozess in 4 Phasen:

1. **Overview-Scan**: 6 PLZ x 2 Varianten (alle + Neubauten), paginiert via MCP Playwright
2. **Evaluation**: DB-Abgleich, 7km-Distanzfilter (Haversine), Scoring, User waehlt Kandidaten
3. **Detail-Scan**: `__PINIA_INITIAL_STATE__` extrahieren, Batches von 8, 5-8s Rate-Limit
4. **DB-Write**: Listings upserten, Amenities in Junction-Tables, Fotos, Preishistorie

Skill-Definition: `~/.claude/skills/homegate-scan/SKILL.md`

### Amenity-Mapping

Homegate liefert Amenities als Boolean-Felder in `characteristics`. Diese werden in die Junction-Tables `amenity` + `listing_amenity` geschrieben (Metabase-kompatibel):

`hasBalcony` wird Balkon, `hasElevator` wird Lift, `hasGarage` wird Garage, `hasParking` wird Parkplatz, `hasWashingMachine` wird Waschmaschine, `isWheelchairAccessible` wird Rollstuhlgaengig, `isChildFriendly` wird Kinderfreundlich, `isNewBuilding` wird Neubau, `arePetsAllowed` wird Haustiere erlaubt

## Datenbank-Schema

### listing (Haupttabelle)

Unique Constraint auf `(portal, external_id)` fuer UPSERT-Logik.

**Basis-Felder:** `portal`, `external_id`, `url`, `title`, `description`, `listing_type`, `address_raw`, `zip_code`, `city`, `canton`, `latitude` (NUMERIC), `longitude` (NUMERIC), `rooms` (NUMERIC, z.B. 3.5), `area_m2` (NUMERIC), `rent_net`, `rent_gross`, `costs_additional` (alle INTEGER, CHF), `available_from` (DATE), `raw_data` (JSONB), `photo_url` (TEXT, erstes Foto)

**Detail-Felder:** `floor` (INTEGER, 0=EG), `year_built`, `year_renovated` (INTEGER), `heating_type`, `energy_label` (TEXT, meist NULL -- Homegate liefert diese nicht), `pets_allowed` (BOOLEAN), `laundry` (TEXT), `amenities` (JSONB, Backup -- primaer in Junction-Tables), `detail_scraped_at` (TIMESTAMPTZ)

**Meta-Felder:** `first_seen_at`, `last_seen_at` (TIMESTAMPTZ, NOT NULL), `is_active` (BOOLEAN), `deactivated_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ)

### listing_photo

Foto-URLs mit `listing_id` FK, `sort_order`, `caption`, `is_floorplan` (boolean), `storage_path` (fuer zukuenftige lokale Kopien). UNIQUE auf `(listing_id, sort_order)`.

### amenity + listing_amenity

Normalisierte Amenity-Daten fuer Metabase (JSONB-Arrays sind in Metabase nicht filterbar):
- `amenity`: `id`, `name` (UNIQUE)
- `listing_amenity`: `listing_id`, `amenity_id` (PK)

### listing_price_history

Preisaenderungen tracken: `listing_id`, `rent_net`, `rent_gross`, `costs_additional`, `recorded_at`. Wird bei Preis-Aenderungen automatisch befuellt.

### listing_note

User-Bewertungen fuer Metabase: `listing_id` (UNIQUE FK), `rating` (1-5), `note` (TEXT), `is_favorite`, `is_rejected` (BOOLEAN).

### v_listing_active (View)

Primaere Datenquelle fuer Metabase. Enthaelt alle `listing`-Felder plus berechnete Spalten:
- `price_per_m2` -- `rent_gross / area_m2`
- `days_on_market` -- Tage seit `first_seen_at`
- `rating`, `is_favorite`, `is_rejected`, `user_note` -- aus `listing_note` (LEFT JOIN)

### scraper_runs

Statistiken pro automatisiertem Lauf: `portal`, `started_at`, `finished_at`, `listings_new`, `listings_updated`, `listings_skipped`, `details_scraped`, `errors`, `error_details` (JSONB), `duration_ms`

## Betrieb

### Manueller Scan (aktuell)

1. Claude Code oeffnen im Scraper-Verzeichnis
2. `/homegate-scan` eingeben
3. Skill fuehrt durch die 4 Phasen (Overview, Evaluation, Detail, DB-Write)
4. Dauer: ~20-30 Minuten fuer einen vollstaendigen Scan

### Automatisierter Betrieb (nach Scrapfly-Zugang)

Nomad Periodic Batch (07:00 + 19:00):

1. Container startet: Chrome + Xvfb, dann Node.js Scraper
2. Browser-Warmup (zufaellige Sites), dann Homegate via Scrapfly
3. Overview-Extraktion: `__INITIAL_STATE__` parsen (deterministisch)
4. Smart Skipping: nur neue/geaenderte Listings detail-scrapen
5. DB-Write: UPSERT + Stale-Deaktivierung
6. Webhook an n8n fuer Post-Processing

### Monitoring

| Ebene | Was | Wo sichtbar |
| :--- | :--- | :--- |
| **DB: scraper_runs** | Statistiken pro automatisiertem Lauf | Metabase Dashboard |
| **Nomad Logs** | Strukturierte JSON-Logs | `nomad alloc logs <alloc-id>` |
| **n8n Executions** | Post-Processing Workflow | n8n UI |
| **Metabase** | Listings/Tag, Preisaenderungen, Neubauten | Metabase UI |

### Metabase-Dashboards

Collection "Immobilien-Monitoring" unter [metabase.ackermannprivat.ch](https://metabase.ackermannprivat.ch):

- **Active Listings** -- Pin Map (Kartenansicht aller Inserate) + Tabellenübersicht mit Foto, Titel, Zimmer, Fläche, Miete brutto, Preis/m2, Tage am Markt
- **New Today** -- Heute neu entdeckte Inserate + Übersicht der letzten 7 Tage
- **Market Analytics** -- Kennzahlen (Total, mit Details, Durchschnittsmiete, Neubauten), Durchschnittspreis/Stadt, Listings/Stadt, Zimmerverteilung, Preis/m2-Verteilung, Amenities Top 10
- **Price Drops** -- Preisänderungen mit altem/neuem Preis und Differenz (basiert auf `listing_price_history`)

Datenquelle: `v_listing_active` (primär) + Junction-Tables für Amenities. User `metabase_reader` (read-only). Semantic Types: Currency CHF, Latitude/Longitude, ImageURL für Fotos.

### Troubleshooting

**MCP Playwright: DataDome CAPTCHA:**
- `browser_snapshot` zeigen lassen -- wenn CAPTCHA sichtbar, manuell im Browser loesen
- Normalerweise tritt dies nicht auf (lokaler Chrome + Residential-IP)

**Kein `__INITIAL_STATE__` auf Uebersichtsseite:**
- Homegate hat moeglicherweise die Seitenstruktur geaendert
- Pruefe ob die Seite korrekt laedt (`browser_snapshot`)
- Alternative: `__PINIA_INITIAL_STATE__` pruefen (Vue-Migration moeglich)

**Detail-Seite: `__PINIA_INITIAL_STATE__` ist null:**
- Fallback: `__INITIAL_STATE__` oder `__NEXT_DATA__` pruefen
- Listing ueberspringen und spaeter nochmal versuchen

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/n8n` | `db_password`, `encryption_key` |
| `kv/data/immoscraper` | `openai_api_key` (nur fuer LLM-Fallback) |
| `kv/data/metabase` | `db_password`, `n8n_reader_password` |

### Kosten

| Posten | Kosten/Monat |
| :--- | :--- |
| Scraping (manuell via MCP) | CHF 0 |
| Scraping (Scrapfly, geplant) | ~CHF 30 |
| LLM-Kosten (Detail-Extraktion) | CHF 0 (deterministisches Parsing) |
| **Total (aktuell)** | **CHF 0** |
| **Total (mit Scrapfly)** | **~CHF 30** |

## Versionshistorie

| Version | Zeitraum | Aenderung |
| :--- | :--- | :--- |
| v1 | 2025 | n8n Workflows mit Cookie-Relay |
| v2 | 2025 | n8n + Playwright Cookie-Refresh |
| v3 | 2026-02 | Stagehand + gpt-4o-mini im Docker Container |
| v4 | 2026-03 | MCP Playwright + Claude Code Skill, deterministisches Parsing statt LLM |

## Verwandte Seiten

- [n8n](../n8n/index.md) -- Workflow-Automation fuer Post-Processing
- [Metabase](../metabase/index.md) -- BI-Dashboard fuer Visualisierung
- [ChangeDetection](../changedetection/index.md) -- Ergaenzende Website-Ueberwachung
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
