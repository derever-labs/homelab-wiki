---
title: Immobilien-Monitoring
description: Automatisiertes Mietmarkt-Monitoring via Scrapfly, mit KI-Enrichment und Telegram-Alerts
tags:
  - service
  - scraping
  - nomad
  - metabase
  - ci-cd
---

# Immobilien-Monitoring

Vollautomatisches Monitoring von Mietinseraten im 7km-Radius um Dottikon AG. Scrapfly umgeht Anti-Bot-Schutzmassnahmen serverseitig, ein Nomad Batch-Job orchestriert den gesamten Scan-Prozess, Claude Haiku reichert Listings mit strukturierten Daten an, und Telegram liefert Zusammenfassungen nach jedem Lauf.

## Uebersicht

| Attribut | Wert |
|----------|------|
| Portal | Homegate (weitere geplant: newhome.ch, erstbezug.ch) |
| Scan-Intervall | Alle 3 Tage (PLZ 5605), woechentlich (PLZ 5610) |
| Anti-Bot | Scrapfly REST-API (ASP, Discovery Plan) |
| KI-Enrichment | Claude Haiku 4.5 (Stockwerk, Balkon, Parking, Minergie etc.) |
| Notifications | Telegram Bot (gleicher Bot wie andere Batch-Jobs) |
| CI/CD | GitHub Actions auf Self-Hosted Runner, Docker Push nach ZOT |
| Deployment | Nomad Periodic Batch (`immoscraper`, `immoscraper-weekly`) |
| Dashboard | [metabase.ackermannprivat.ch](https://metabase.ackermannprivat.ch) |
| Datenbank | PostgreSQL `immo` auf dem Shared Cluster |
| Repo | `nomad-jobs/services/n8n-workflows/scraper/` |
| Secrets | Vault `kv/data/immoscraper` + `kv/data/shared/telegram` |

## Gesamtarchitektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: down

ci: CI/CD Pipeline {
  class: container

  GH: GitHub Repo {
    class: node
    tooltip: "derever-labs/homelab-nomad-jobs | Push auf main triggert Build"
  }
  Runner: GitHub Actions Runner {
    class: node
    tooltip: "Self-Hosted auf Nomad Client | Docker Build + Push"
  }
  ZOT: ZOT Registry {
    class: node
    tooltip: "localhost:5000 | OCI Image Cache + Custom Images"
  }
}

scraper: Immoscraper (Nomad Batch) {
  class: container

  Job: Scraper Container {
    class: node
    tooltip: "node:22-alpine | MODE=scan oder MODE=weekly"
  }
  SF: Scrapfly API {
    class: node
    tooltip: "ASP Anti-Bot Bypass | country=ch | Discovery Plan 30 USD/Mo"
  }
  AI: Claude Haiku 4.5 {
    class: node
    tooltip: "KI-Enrichment | Stockwerk, Balkon, Parking, Minergie"
  }
}

portale: Immobilienportale {
  class: container

  HG: Homegate {
    class: node
    tooltip: "SMG | 70-75% Marktanteil | DataDome + Cloudflare"
  }
}

daten: Datenhaltung {
  class: container

  PG: PostgreSQL immo {
    shape: cylinder
    tooltip: "listing, listing_photo, amenity, scraper_runs, project"
  }
  Vault: Vault Secrets {
    class: node
    tooltip: "kv/data/immoscraper | DB Password, Scrapfly Key, Claude Key"
  }
}

output: Ausgabe {
  class: container

  MB: Metabase Dashboards {
    class: node
    tooltip: "Active Listings, New Today, Market Analytics, Price Drops"
  }
  TG: Telegram Bot {
    class: node
    tooltip: "Scan-Zusammenfassung nach jedem Lauf"
  }
}

ci.GH -> ci.Runner: Push triggert Workflow {
  style.stroke: "#2563eb"
}
ci.Runner -> ci.ZOT: Docker Image Push {
  style.stroke: "#2563eb"
}
ci.ZOT -> scraper.Job: Image Pull (force_pull) {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}

daten.Vault -> scraper.Job: Secrets via Nomad Template {
  style.stroke: "#7c3aed"
}

scraper.Job -> scraper.SF: HTTP GET mit ASP {
  style.stroke: "#2563eb"
}
scraper.SF -> portale.HG: DataDome Bypass {
  style.stroke: "#2563eb"
}
scraper.Job -> scraper.AI: Listing-Texte {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
}
scraper.Job -> daten.PG: UPSERT Listings + Fotos {
  style.stroke: "#854d0e"
}

daten.PG -> output.MB: v_listing_active View {
  style.stroke: "#854d0e"
}
scraper.Job -> output.TG: Scan-Zusammenfassung {
  style.stroke: "#16a34a"
}
```

## Scan-Ablauf (5 Phasen)

Jeder Scan-Lauf durchlaueft fuenf Phasen sequentiell. Der gesamte Prozess ist deterministisch -- kein LLM wird fuer die Datenextraktion benoetigt.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  decision: { style: { border-radius: 8 }; shape: diamond }
}

direction: right

p1: Phase 1 -- Overview {
  class: container

  Fetch: Scrapfly Fetch {
    class: node
    tooltip: "Alle Seiten paginiert (20/Seite) | 2s Delay zwischen Seiten"
  }
  Parse: __INITIAL_STATE__ parsen {
    class: node
    tooltip: "Deterministisch | Titel, Preis, Zimmer, Koordinaten, Fotos"
  }
  Count: Ergebnis-Zaehler {
    class: node
    tooltip: "Abbruch wenn < 20 Listings oder alle Seiten durch"
  }
}

p2: Phase 2 -- Smart Skip {
  class: container

  DB: DB-Abgleich {
    class: node
    tooltip: "getExistingListings() | Map<external_id, {rent_gross, detail_scraped_at}>"
  }
  Decide: Entscheidung {
    class: node
    tooltip: "neu | geaendert | fehlend | skip"
  }
}

p3: Phase 3 -- UPSERT {
  class: container

  Write: Listing UPSERT {
    class: node
    tooltip: "ON CONFLICT (portal, external_id) DO UPDATE"
  }
  Photo: Foto UPSERT {
    class: node
    tooltip: "Nur bei neuen Listings aus Overview-Daten"
  }
}

p4: Phase 4 -- Detail-Scrape {
  class: container

  Fetch2: Scrapfly Fetch {
    class: node
    tooltip: "Einzelinserat | 5s Delay | Circuit Breaker nach 5 Fehlern"
  }
  Pinia: __PINIA_INITIAL_STATE__ {
    class: node
    tooltip: "Beschreibung, Amenities, Fotos, Grundrisse, Verwalter"
  }
  Update: Detail-Update + Amenities {
    class: node
    tooltip: "updateListingDetail() | upsertPhotos() | Amenity-Junction"
  }
}

p5: Phase 5 -- Abschluss {
  class: container

  Stale: Stale-Deaktivierung {
    class: node
    tooltip: "is_active=false wenn > 5 Tage nicht gesehen"
  }
  Enrich: KI-Enrichment {
    class: node
    tooltip: "Claude Haiku | max 20 Listings pro Lauf"
  }
  Notify: Telegram {
    class: node
    tooltip: "Zusammenfassung: neu, aktualisiert, Fehler, Credits"
  }
}

p1.Fetch -> p1.Parse -> p1.Count
p1.Count -> p2.DB: "Alle Listings"
p2.DB -> p2.Decide
p2.Decide -> p3.Write: "Alle Listings"
p3.Write -> p3.Photo
p2.Decide -> p4.Fetch2: "Nur neu/geaendert/fehlend" {
  style.stroke: "#2563eb"
}
p4.Fetch2 -> p4.Pinia -> p4.Update
p4.Update -> p5.Stale
p3.Photo -> p5.Stale: "Skipped IDs: last_seen_at" {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}
p5.Stale -> p5.Enrich -> p5.Notify
```

## Anti-Bot: Scrapfly statt Browser

::: warning Zentrale Erkenntnis
DataDome + Cloudflare auf Homegate blockieren Container-Traffic unabhaengig vom Browserverhalten. Es liegt an IP-Reputation und TLS-Fingerprinting, nicht an Navigation oder Delays.
:::

Scrapfly loest dieses Problem serverseitig: Die API leitet Requests ueber ein Netzwerk von Residential-IPs mit korrekten TLS-Fingerprints. Der Scraper sendet einen einfachen HTTP GET mit den Parametern `asp=true` (Anti-Scraping Protection) und `country=ch`. Kein Browser, kein JavaScript-Rendering, kein Playwright.

Getestet und gescheitert (vor Scrapfly):
- rebrowser-playwright-core, Headed Chrome + Xvfb, Stealth-Scripts
- Evomi Scraping Browser, Evomi Scraper API
- Firecrawl (33% Erfolgsrate auf geschuetzten Seiten)

Scrapfly erreicht 96-98% Erfolgsrate bei 25 Credits pro ASP-Request.

## Smart Skipping

Statt jedes Listing bei jedem Lauf komplett zu scrapen, entscheidet die DB-Abgleich-Logik pro Listing:

- **NEU** -- `external_id` nicht in DB -- Overview-Insert + Detail-Scrape
- **GEAENDERT** -- `external_id` in DB, Preis anders -- Detail-Re-Scrape + Preishistorie
- **FEHLEND** -- `external_id` in DB, `detail_scraped_at IS NULL` -- Detail-Scrape nachholen
- **BEKANNT** -- `external_id` in DB, Preis gleich -- nur `last_seen_at` updaten, kein Scrape

::: tip Schutz gegen Massen-Deaktivierung
Wenn der Overview-Scan 0 Listings findet (vermutlich Anti-Bot-Block oder HTML-Strukturaenderung), wird `deactivateStale` uebersprungen. Damit werden bei einem fehlgeschlagenen Scan nicht alle bestehenden Listings faelschlich deaktiviert.
:::

## Datenextraktion

Beide Datenquellen liefern strukturiertes JSON direkt aus dem Server-Side-Rendering. Kein LLM noetig fuer die Grundextraktion.

- **Uebersichtsseiten** -- `window.__INITIAL_STATE__` enthaelt die Suchergebnisse als JSON (Titel, Preis, Zimmer, Koordinaten, Fotos)
- **Detailseiten** -- `window.__PINIA_INITIAL_STATE__` (Vue 3/Pinia Store) enthaelt Beschreibung, Amenities, alle Fotos, Grundrisse, Verwalter-Kontakt

### Homegate URL-Struktur

- Trefferliste: `.../plz-{PLZ}/trefferliste?be=7000` (Preis bis CHF 7000)
- Pagination: `&ep=2`, `&ep=3` etc. (20 Resultate pro Seite)
- Detailseite: `https://www.homegate.ch/mieten/{external_id}`

### Scan-Tiers (PLZ-Strategie)

| Tier | PLZ | Ort | Job | Intervall |
|------|-----|-----|-----|-----------|
| 1 | 5605 | Dottikon | `immoscraper` | Alle 3 Tage |
| 3 | 5610 | Wohlen AG | `immoscraper-weekly` | Woechentlich (Sonntag) |

Homegate zeigt bei einer PLZ-Suche auch Ergebnisse aus umliegenden Gemeinden an. PLZ 5605 deckt damit den Grossteil des 7km-Radius ab (Dottikon, Hendschiken, Othmarsingen, Haegglingen, Villmergen). PLZ 5610 ergaenzt das Randgebiet Wohlen AG.

Referenzpunkt fuer Distanzberechnung: Dottikon 47.3775 / 8.2394

## KI-Enrichment

Nach dem Scraping analysiert Claude Haiku 4.5 die Listing-Beschreibungen und extrahiert strukturierte Daten, die Homegate nicht als eigene Felder liefert:

| Feld | Beispielwert |
|------|-------------|
| Stockwerk | 2 (EG = 0, UG = -1) |
| Balkon / Terrasse | ja/nein |
| Parkplatz / Garage | ja/nein |
| Lift | ja/nein |
| Minergie-Standard | Minergie, Minergie-P, Minergie-A |
| Heizungstyp | Fussbodenheizung, Fernwaerme, Waermepumpe |
| Waschkueche | Eigene Waschmaschine, Gemeinschaftswaschkueche |
| Baujahr / Renovation | 2024, 2019 |
| Highlights | Max 5 besondere Merkmale |

Das Enrichment laeuft nach der Scraping-Phase mit maximal 20 Listings pro Lauf. Ein Circuit Breaker stoppt nach 3 aufeinanderfolgenden Fehlern. Listings ohne Beschreibung werden uebersprungen.

Die Ergebnisse werden in `enrichment_data` (JSONB) gespeichert und stehen in Metabase als filterbare Felder zur Verfuegung.

## Notifications (Telegram)

Der Scraper sendet nach jedem Lauf eine Zusammenfassung an den gleichen Telegram Bot der auch von den Media-Batch-Jobs verwendet wird (Vault `kv/data/shared/telegram`).

Die Nachricht enthaelt pro Portal: Anzahl neue Listings, Detail-Scrapes, Deaktivierungen, Dauer -- sowie den Scrapfly-Credit-Verbrauch und die Anzahl angereicherter Listings. Bei Fehlern erhaelt die Nachricht eine erhoehte Prioritaet.

## CI/CD Pipeline

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
}

direction: right

Push: git push main {
  class: node
}
GHA: GitHub Actions {
  class: node
  tooltip: "build-immoscraper.yml | Trigger bei Aenderungen in scraper/"
}
Runner: Self-Hosted Runner {
  class: node
  tooltip: "Nomad Job github-runner | Docker Socket + ZOT Zugang"
}
Build: Docker Multi-Stage Build {
  class: node
  tooltip: "node:22-alpine | TypeScript Compile + Production Deps"
}
ZOT: ZOT Registry {
  class: node
  tooltip: "localhost:5000/library/immoscraper:latest"
}
Nomad: Nomad Periodic Job {
  class: node
  tooltip: "force_pull=true | Naechster Cron-Trigger holt neues Image"
}

Push -> GHA: "Aenderungen in scraper/" {
  style.stroke: "#2563eb"
}
GHA -> Runner: "runs-on: self-hosted" {
  style.stroke: "#2563eb"
}
Runner -> Build -> ZOT: "docker build + push" {
  style.stroke: "#2563eb"
}
ZOT -> Nomad: "Naechster Scan-Lauf" {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}
```

Der GitHub Actions Runner laeuft als Nomad Service-Job mit Docker-Socket-Mount und Host-Netzwerk (ZOT auf `localhost:5000` direkt erreichbar). Das Dockerfile nutzt einen Multi-Stage Build: TypeScript wird in der Build-Stage kompiliert, das Production-Image enthaelt nur Runtime-Dependencies.

Der Workflow triggert bei Aenderungen in `services/n8n-workflows/scraper/` oder bei manuellem Dispatch.

## Scrapfly Credit-Management

| Scan-Typ | Credits pro Lauf | Intervall | Credits/Monat |
|----------|-----------------|-----------|--------------|
| Overview PLZ 5605 (~15 Seiten) | ~375 | Alle 3 Tage | ~3.750 |
| Detail-Scrapes (~30 neue) | ~750 | Alle 3 Tage | ~7.500 |
| Overview PLZ 5610 (~15 Seiten) | ~375 | Woechentlich | ~1.500 |
| **Total geschaetzt** | | | **~12.750** |

Der Discovery Plan bietet 200.000 Credits/Monat fuer $30 -- die geschaetzte Auslastung liegt bei ~6%.

::: info Credit-Tracking
Jeder Scrapfly-Request liefert den Credit-Verbrauch in der API-Response zurueck. Der Scraper summiert diese pro Lauf und schreibt den Gesamtwert in `scraper_runs`. Die Telegram-Notification zeigt den Verbrauch ebenfalls an.
:::

## Datenbank-Schema

Die Datenbank `immo` auf dem PostgreSQL Shared Cluster enthaelt folgende Tabellen:

### Kerntabellen

- **listing** -- Haupttabelle mit Unique Constraint `(portal, external_id)`. Basis-Felder (Titel, Preis, Zimmer, Flaeche, Koordinaten), Detail-Felder (Stockwerk, Heizung, Haustiere, Beschreibung), Enrichment-Felder (`enrichment_status`, `enrichment_data`, `enriched_at`), Meta-Felder (`first_seen_at`, `last_seen_at`, `is_active`)
- **listing_photo** -- Foto-URLs mit `sort_order`, `caption` und `is_floorplan`. Unique auf `(listing_id, sort_order)`
- **listing_price_history** -- Preisaenderungen mit Zeitstempel. Wird bei Smart-Skip-Entscheidung "geaendert" automatisch befuellt
- **listing_note** -- User-Bewertungen fuer Metabase (Rating, Favorit, Abgelehnt)

### Amenities (normalisiert)

- **amenity** -- Lookup-Tabelle mit Unique `name`
- **listing_amenity** -- Junction-Table (`listing_id`, `amenity_id`)

Homegate liefert Amenities als Boolean-Felder: `hasBalcony`, `hasElevator`, `hasGarage`, `hasParking`, `hasWashingMachine`, `isWheelchairAccessible`, `isChildFriendly`, `isNewBuilding`, `arePetsAllowed`. Diese werden in die normalisierten Tabellen gemappt (Metabase kann JSONB-Arrays nicht filtern).

### Neubau-Projekt-Tabellen (vorbereitet)

- **project** -- Neubauprojekte mit Developer, Architekt, Energiestandard, Heizung, Baufortschritt
- **project_listing** -- Junction zu Listings
- **project_unit** -- Einzelne Wohneinheiten mit generiertem `price_per_m2`
- **project_source** -- Recherche-Quellen mit Zeitstempel

### Views und Tracking

- **v_listing_active** -- Primaere Metabase-Datenquelle mit berechneten Spalten (`price_per_m2`, `days_on_market`, User-Bewertungen)
- **scraper_runs** -- Statistiken pro Lauf (Dauer, Listings, Fehler, Credits, Enrichment-Zaehler)

## Vault Secrets

| Pfad | Keys | Zweck |
|------|------|-------|
| `kv/data/immoscraper` | `db_password` | PostgreSQL Zugang |
| `kv/data/immoscraper` | `scrapfly_api_key` | Scrapfly REST-API |
| `kv/data/immoscraper` | `claude_api_key` | Claude Haiku Enrichment |
| `kv/data/shared/telegram` | `bot_token`, `chat_id` | Telegram Notifications |
| `kv/data/github-runner` | `access_token` | GitHub Actions Runner PAT |

## Kosten

| Posten | Kosten/Monat |
|--------|-------------|
| Scrapfly Discovery Plan | CHF 30 |
| Claude Haiku Enrichment | ~CHF 2 |
| **Total** | **~CHF 32** |

## Geplante Erweiterungen

- **newhome.ch** -- Zweite Datenquelle mit eigenstaendigem Bestand (Kantonalbanken, regionale Verwaltungen)
- **erstbezug.ch** -- Neubauprojekte exklusiv, Migration aus n8n-Workflow
- **SMG-Vergleichsscan** -- Einmaliger Scan von ImmoScout24, Flatfox, anibis, tutti gegen Homegate-DB um Datenbank-Ueberschneidung zu messen
- **Neubau-Research Pipeline** -- Claude Sonnet analysiert Developer-Websites, Baudatenbank AG, Amtsblatt
- **Pipeline-Discovery** -- Automatische Entdeckung neuer Neubauprojekte via Developer-Websites

## Verwandte Seiten

- [Immo-Monitor Frontend](../immo-monitor/) -- SvelteKit Kartenansicht
- [Metabase](../metabase/) -- BI-Dashboard fuer Visualisierung
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Batch-Jobs](../_querschnitt/batch-jobs.md) -- Uebersicht aller Nomad Periodic Jobs
- [GitHub Runner](../github-runner/) -- Self-Hosted CI/CD Runner
- [Telegram Bots](../monitoring/telegram-bots.md) -- Benachrichtigungssystem
- [Docker Registry (ZOT)](../docker-registry/) -- OCI Image Registry
- [Vault](../vault/) -- Secret Management
