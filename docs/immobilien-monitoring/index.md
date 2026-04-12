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

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **Zweck** | Mietmarkt-Monitoring für MFH-Neubau Dottikon AG |
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
- **Automatisiert (geplant):** Scrapfly als Anti-Bot-Proxy für den bestehenden Node.js-Scraper auf Nomad.

## Architektur

```d2
direction: down

manuell: "Manueller Scan (Claude Code)" {
  style.stroke-dash: 4
  SK: "/homegate-scan Skill" { style.border-radius: 8 }
  MCP: "MCP Playwright (lokaler Chrome)" { style.border-radius: 8 }
}

auto: "Automatisiert (geplant)" {
  style.stroke-dash: 4
  NJ: "immoscraper Container (Nomad Periodic Batch)" { style.border-radius: 8 }
  SF: "Scrapfly API (Anti-Bot Proxy)" { style.border-radius: 8 }
}

portale: Immobilienportale {
  style.stroke-dash: 4
  HG: Homegate { style.border-radius: 8 }
}

pg: "PostgreSQL (Nomad)" {
  style.stroke-dash: 4
  LS: listing { shape: cylinder }
  LP: listing_photo { shape: cylinder }
  AM: "amenity + listing_amenity" { shape: cylinder }
  PH: listing_price_history { shape: cylinder }
  SR: scraper_runs { shape: cylinder }
  VW: "v_listing_active (View)" { shape: cylinder }
}

MB: "Metabase Dashboard" { style.border-radius: 8 }

manuell.SK -> manuell.MCP
manuell.MCP -> portale.HG: Browser besucht
manuell.MCP -> manuell.SK: "__INITIAL_STATE__\n__PINIA_INITIAL_STATE__"
manuell.SK -> pg.LS: SQL via Node.js pg
manuell.SK -> pg.LP: SQL via Node.js pg
manuell.SK -> pg.AM: SQL via Node.js pg

auto.NJ -> auto.SF: via Scrapfly
auto.SF -> portale.HG: DataDome Bypass
auto.NJ -> pg.LS: UPSERT

pg.LS -> pg.VW
pg.VW -> MB
pg.LP -> MB
pg.SR -> MB
```

## Anti-Bot: DataDome + Cloudflare

::: warning Zentrale Erkenntnis
DataDome + Cloudflare auf Homegate blockieren ALLES ausser echten Browsern. Es liegt nicht am Verhalten (Navigation, Delays), sondern an IP-Reputation und TLS-Fingerprinting.
:::

**Getestet und gescheitert:**
- rebrowser-playwright-core (CDP-Leak gepatcht) -- sofort erkannt
- Headed Chrome + Xvfb im Docker -- sofort erkannt
- Evomi Scraping Browser (WebSocket CDP) -- Challenge löst sich nie
- Evomi Scraper API -- 504 Gateway Timeout
- Stealth-Scripts (WebGL, AudioContext, Battery API etc.) -- hilft nicht

**Funktioniert:**
- **MCP Playwright** (lokaler Chrome auf dem Mac) -- DataDome sieht normalen Browser, Residential-IP
- **Scrapfly** (96% DataDome-Erfolgsrate, $30/Monat) -- noch nicht getestet, Zugang läuft

## Datenextraktion

| Seitentyp | Datenquelle | Methode | LLM-Kosten |
| :--- | :--- | :--- | :--- |
| **Übersicht** (Trefferliste) | `window.__INITIAL_STATE__` | Deterministisches JSON-Parsing | CHF 0 |
| **Detail** (Einzelinserat) | `window.__PINIA_INITIAL_STATE__` (Vue 3/Pinia) | Deterministisches JSON-Parsing | CHF 0 |

Kein LLM nötig -- beide Datenquellen liefern strukturiertes JSON direkt aus dem Browser-State.

### Homegate URL-Struktur

- Alle Mietinserate: `.../plz-{PLZ}/trefferliste?be=7000` (Preis bis CHF 7000)
- Nur Neubauten: `.../plz-{PLZ}/trefferliste?be=7000&an=G`
- Pagination: `&ep=1`, `&ep=2` etc. (20 Resultate pro Seite)
- Detail: `https://www.homegate.ch/mieten/{external_id}`

### Region

6 PLZ-Codes decken den 7km-Radius gut ab (Homegate zeigt auch umliegende Ergebnisse):


Dottikon (5605), Hendschiken (5604), Othmarsingen (5504), Hägglingen (5607), Villmergen (5612), Wohlen AG (5610)

Referenzpunkt für Distanzberechnung: Dottikon 47.3775 / 8.2394

## Kernkonzept: Smart Skipping

Statt jedes Listing bei jedem Run komplett zu scrapen:

1. **Übersichtsseite** liefert: `external_id`, Preis, Zimmer, Titel, Koordinaten
2. **DB-Abgleich** pro Listing:
   - `external_id` NICHT in DB -- NEU -- Detail-Scrape + Insert
   - `external_id` in DB, Preis GLEICH -- BEKANNT -- nur `last_seen_at` updaten
   - `external_id` in DB, Preis ANDERS -- GEÄNDERT -- Detail-Re-Scrape + Preishistorie
   - `external_id` in DB, `detail_scraped_at IS NULL` -- FEHLEND -- Detail-Scrape nachholen

## Claude Code Skill: /homegate-scan

Der Skill orchestriert den gesamten Scan-Prozess in 4 Phasen:

1. **Overview-Scan**: 6 PLZ x 2 Varianten (alle + Neubauten), paginiert via MCP Playwright
2. **Evaluation**: DB-Abgleich, 7km-Distanzfilter (Haversine), Scoring, User wählt Kandidaten
3. **Detail-Scan**: `__PINIA_INITIAL_STATE__` extrahieren, Batches von 8, 5-8s Rate-Limit
4. **DB-Write**: Listings upserten, Amenities in Junction-Tables, Fotos, Preishistorie

Skill-Definition: `~/.claude/skills/homegate-scan/SKILL.md`

### Amenity-Mapping

Homegate liefert Amenities als Boolean-Felder in `characteristics`. Diese werden in die Junction-Tables `amenity` + `listing_amenity` geschrieben (Metabase-kompatibel):

`hasBalcony` wird Balkon, `hasElevator` wird Lift, `hasGarage` wird Garage, `hasParking` wird Parkplatz, `hasWashingMachine` wird Waschmaschine, `isWheelchairAccessible` wird Rollstuhlgängig, `isChildFriendly` wird Kinderfreundlich, `isNewBuilding` wird Neubau, `arePetsAllowed` wird Haustiere erlaubt

## Datenbank-Schema

### listing (Haupttabelle)

Unique Constraint auf `(portal, external_id)` für UPSERT-Logik.

**Basis-Felder:** `portal`, `external_id`, `url`, `title`, `description`, `listing_type`, `address_raw`, `zip_code`, `city`, `canton`, `latitude` (NUMERIC), `longitude` (NUMERIC), `rooms` (NUMERIC, z.B. 3.5), `area_m2` (NUMERIC), `rent_net`, `rent_gross`, `costs_additional` (alle INTEGER, CHF), `available_from` (DATE), `raw_data` (JSONB), `photo_url` (TEXT, erstes Foto)

**Detail-Felder:** `floor` (INTEGER, 0=EG), `year_built`, `year_renovated` (INTEGER), `heating_type`, `energy_label` (TEXT, meist NULL -- Homegate liefert diese nicht), `pets_allowed` (BOOLEAN), `laundry` (TEXT), `amenities` (JSONB, Backup -- primär in Junction-Tables), `detail_scraped_at` (TIMESTAMPTZ)

**Meta-Felder:** `first_seen_at`, `last_seen_at` (TIMESTAMPTZ, NOT NULL), `is_active` (BOOLEAN), `deactivated_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ)

### listing_photo

Foto-URLs mit `listing_id` FK, `sort_order`, `caption`, `is_floorplan` (boolean), `storage_path` (für zukünftige lokale Kopien). UNIQUE auf `(listing_id, sort_order)`.

### amenity + listing_amenity

Normalisierte Amenity-Daten für Metabase (JSONB-Arrays sind in Metabase nicht filterbar):
- `amenity`: `id`, `name` (UNIQUE)
- `listing_amenity`: `listing_id`, `amenity_id` (PK)

### listing_price_history

Preisänderungen tracken: `listing_id`, `rent_net`, `rent_gross`, `costs_additional`, `recorded_at`. Wird bei Preisänderungen automatisch befüllt.

### listing_note

User-Bewertungen für Metabase: `listing_id` (UNIQUE FK), `rating` (1-5), `note` (TEXT), `is_favorite`, `is_rejected` (BOOLEAN).

### v_listing_active (View)

Primäre Datenquelle für Metabase. Enthält alle `listing`-Felder plus berechnete Spalten:
- `price_per_m2` -- `rent_gross / area_m2`
- `days_on_market` -- Tage seit `first_seen_at`
- `rating`, `is_favorite`, `is_rejected`, `user_note` -- aus `listing_note` (LEFT JOIN)

### scraper_runs

Statistiken pro automatisiertem Lauf: `portal`, `started_at`, `finished_at`, `listings_new`, `listings_updated`, `listings_skipped`, `details_scraped`, `errors`, `error_details` (JSONB), `duration_ms`


## Betrieb

### Manueller Scan (aktuell)

Der Claude Code Skill `/homegate-scan` orchestriert den vollständigen Scan und führt durch die 4 Phasen (Overview, Evaluation, Detail, DB-Write). Dauer: ~20-30 Minuten für einen vollständigen Scan. Skill-Definition: `~/.claude/skills/homegate-scan/SKILL.md`

### Automatisierter Betrieb (nach Scrapfly-Zugang)

Nomad Periodic Batch (07:00 + 19:00): Container startet Node.js Scraper mit Scrapfly als Anti-Bot-Proxy, führt Smart Skipping durch und schreibt via UPSERT in die DB. Nach Abschluss sendet der Job einen Webhook an n8n für Post-Processing.

### Monitoring

| Ebene | Was | Wo sichtbar |
| :--- | :--- | :--- |
| **DB: scraper_runs** | Statistiken pro automatisiertem Lauf | Metabase Dashboard |
| **Nomad Logs** | Strukturierte JSON-Logs | Nomad UI |
| **n8n Executions** | Post-Processing Workflow | n8n UI |
| **Metabase** | Listings/Tag, Preisänderungen, Neubauten | Metabase UI |

### Metabase-Dashboards

Collection "Immobilien-Monitoring" unter [metabase.ackermannprivat.ch](https://metabase.ackermannprivat.ch):

- **Active Listings** -- Pin Map (Kartenansicht aller Inserate) + Tabellenübersicht mit Foto, Titel, Zimmer, Fläche, Miete brutto, Preis/m2, Tage am Markt
- **New Today** -- Heute neu entdeckte Inserate + Übersicht der letzten 7 Tage
- **Market Analytics** -- Kennzahlen (Total, mit Details, Durchschnittsmiete, Neubauten), Durchschnittspreis/Stadt, Listings/Stadt, Zimmerverteilung, Preis/m2-Verteilung, Amenities Top 10
- **Price Drops** -- Preisänderungen mit altem/neuem Preis und Differenz (basiert auf `listing_price_history`)

Datenquelle: `v_listing_active` (primär) + Junction-Tables für Amenities. User `metabase_reader` (read-only). Semantic Types: Currency CHF, Latitude/Longitude, ImageURL für Fotos.

### Troubleshooting

**MCP Playwright: DataDome CAPTCHA:**
- CAPTCHA prüfen -- wenn sichtbar, manuell im Browser lösen
- Normalerweise tritt dies nicht auf (lokaler Chrome + Residential-IP)

**Kein `__INITIAL_STATE__` auf Übersichtsseite:**
- Homegate hat möglicherweise die Seitenstruktur geändert
- Prüfen ob die Seite korrekt lädt
- Alternative: `__PINIA_INITIAL_STATE__` prüfen (Vue-Migration möglich)

**Detail-Seite: `__PINIA_INITIAL_STATE__` ist null:**
- Fallback: `__INITIAL_STATE__` oder `__NEXT_DATA__` prüfen
- Listing überspringen und später nochmal versuchen

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/n8n` | `db_password`, `encryption_key` |
| `kv/data/immoscraper` | `openai_api_key` (nur für LLM-Fallback) |
| `kv/data/metabase` | `db_password`, `n8n_reader_password` |

### Kosten

| Posten | Kosten/Monat |
| :--- | :--- |
| Scraping (manuell via MCP) | CHF 0 |
| Scraping (Scrapfly, geplant) | ~CHF 30 |
| LLM-Kosten (Detail-Extraktion) | CHF 0 (deterministisches Parsing) |
| **Total (aktuell)** | **CHF 0** |
| **Total (mit Scrapfly)** | **~CHF 30** |

## Verwandte Seiten

- [n8n](../n8n/index.md) -- Workflow-Automation für Post-Processing
- [Metabase](../metabase/index.md) -- BI-Dashboard für Visualisierung
- [ChangeDetection](../changedetection/index.md) -- Ergänzende Website-Überwachung
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
