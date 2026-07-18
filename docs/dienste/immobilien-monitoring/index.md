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

Vollautomatisches Monitoring von Mietinseraten im 7km-Radius um Dottikon AG. Scrapfly umgeht Anti-Bot-Schutzmassnahmen serverseitig, ein Nomad Batch-Job orchestriert den gesamten Scan-Prozess, Claude Haiku reichert Listings mit strukturierten Daten an, und Telegram liefert Zusammenfassungen nach jedem Lauf. Diese Seite beschreibt die **Datenpipeline und ihren Betrieb**; die Web-App darüber -- Bedienung, Karte, Marktanalyse -- ist [Immo Monitor](../immo-monitor/index.md).

Die Referenz-Tabellen (Homegate-URL-Struktur, Scan-Tiers, DB-Schema, Enrichment-Felder, Vault-Secrets, Credit-Management) stehen in der [Immobilien-Monitoring Referenz](./referenz.md); die vorgelagerte Neubau-Erkennung beschreibt die [Frühsignal-Pipeline](./fruehsignal.md).

## Übersicht

| Attribut | Wert |
|----------|------|
| Portale | Homegate (primär), ImmoScout24 (wöchentlicher Nebenscan) |
| Scan-Intervall | Alle 3 Tage (PLZ 5605), wöchentlich (PLZ 5610) |
| Anti-Bot | Scrapfly REST-API (ASP, Discovery Plan) |
| KI-Enrichment | Claude Haiku (Stockwerk, Balkon, Parking, Minergie etc.) |
| Notifications | Telegram Bot (gleicher Bot wie andere Batch-Jobs) |
| CI/CD | GitHub Actions auf Self-Hosted Runner, Docker Push nach ZOT |
| Deployment | Nomad Periodic Batch `services/immoscraper.nomad`, `services/immoscraper-weekly.nomad` |
| Dashboard | [metabase.ackermannprivat.ch](https://metabase.ackermannprivat.ch) |
| Datenbank | PostgreSQL `immo` auf dem Shared Cluster |
| Repo | `nomad-jobs/services/n8n-workflows/scraper/` |
| Secrets | Vault `kv/data/immoscraper` + `kv/data/shared/telegram` |

## Rolle im Stack

Der Scraper ist ein reiner Backend-Batch-Job ohne eigenes UI. Er sammelt Mietinserate, reichert sie an und schreibt sie in die PostgreSQL-Datenbank `immo` auf dem Shared Cluster. Von dort konsumieren das [Immo-Monitor-Frontend](../immo-monitor/) (SvelteKit-Kartenansicht) und [Metabase](../metabase/) (BI-Dashboards) die Daten. Telegram liefert nach jedem Lauf eine Zusammenfassung.

## Gesamtarchitektur

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: down

ci: CI/CD-Pipeline {
  class: container

  GH: GitHub-Repo {
    class: node
    tooltip: "derever-labs/homelab-nomad-jobs. Push auf main triggert den Build"
  }
  Runner: GitHub-Actions-Runner {
    class: node
    tooltip: "Self-Hosted auf Nomad-Client. Docker Build + Push"
  }
  ZOT: ZOT-Registry {
    class: node
    tooltip: "zot.service.consul:5000. OCI-Image-Cache und eigene Images"
  }
}

scraper: Immoscraper (Nomad Batch) {
  class: container

  Job: Scraper-Container {
    class: node
    tooltip: "MODE=scan oder MODE=weekly"
  }
  SF: Scrapfly API {
    class: node
    tooltip: "ASP Anti-Bot-Bypass, country=de"
  }
  AI: Claude Haiku {
    class: node
    tooltip: "KI-Enrichment: Stockwerk, Balkon, Parking, Minergie"
  }
}

portale: Immobilienportale {
  class: container

  HG: Homegate {
    class: node
    tooltip: "SMG-Hauptportal. DataDome + Cloudflare"
  }
  IS24: ImmoScout24 {
    class: node
    tooltip: "SMG. Wöchentlicher Nebenscan"
  }
}

daten: Datenhaltung {
  class: container

  PG: PostgreSQL immo {
    shape: cylinder
    tooltip: "listing, listing_photo, amenity, scraper_runs, project"
  }
  NFS: "NFS Foto-Archiv (NAS)" {
    shape: cylinder
    tooltip: "Lokale Foto-Kopien, unabhängig von ablaufenden CDN-URLs"
  }
  Vault: Vault Secrets {
    class: node
    tooltip: "kv/data/immoscraper: DB-Passwort, Scrapfly-Key, Claude-Key"
  }
}

output: Ausgabe {
  class: container

  IM: "Immo Monitor\n(SvelteKit)" {
    class: node
    tooltip: "Bedienoberfläche: Inserate, Karte, Marktanalyse"
  }
  MB: Metabase-Dashboards {
    class: node
    tooltip: "BI-Dashboards auf denselben Daten"
  }
  TG: Telegram-Bot {
    class: node
    tooltip: "Scan-Zusammenfassung nach jedem Lauf"
  }
}

ci.GH -> ci.Runner: Push triggert Workflow {
  style.stroke: "#2563eb"
}
ci.Runner -> ci.ZOT: Docker-Image-Push {
  style.stroke: "#2563eb"
}
ci.ZOT -> scraper.Job: Image-Pull (force_pull) {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}

daten.Vault -> scraper.Job: Secrets via Nomad-Template {
  style.stroke: "#7c3aed"
}

scraper.Job -> scraper.SF: HTTP GET mit ASP {
  style.stroke: "#2563eb"
}
scraper.SF -> portale.HG: DataDome-Bypass {
  style.stroke: "#2563eb"
}
scraper.SF -> portale.IS24: DataDome-Bypass (weekly) {
  style.stroke: "#2563eb"
  style.stroke-dash: 3
}
scraper.Job -> scraper.AI: Listing-Texte {
  style.stroke: "#16a34a"
  style.stroke-dash: 3
}
scraper.Job -> daten.PG: UPSERT Listings + Fotos {
  style.stroke: "#854d0e"
}
scraper.Job -> daten.NFS: Foto-Download {
  style.stroke: "#854d0e"
}

daten.PG -> output.IM: Lifecycle-Ableitung {
  style.stroke: "#854d0e"
}
daten.NFS -> output.IM: Fotos read-only {
  style.stroke: "#854d0e"
  style.stroke-dash: 3
}
daten.PG -> output.MB: v_listing_active View {
  style.stroke: "#854d0e"
}
scraper.Job -> output.TG: Scan-Zusammenfassung {
  style.stroke: "#16a34a"
}
```

## Scan-Ablauf (5 Phasen)

Jeder Scan-Lauf durchläuft fünf Phasen sequentiell. Der gesamte Prozess ist deterministisch -- kein LLM wird für die Datenextraktion benötigt.

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: right

p1: Phase 1 -- Overview {
  class: container

  Fetch: Scrapfly Fetch {
    class: node
    tooltip: "Alle Seiten paginiert (20/Seite), 2s Delay zwischen Seiten"
  }
  Parse: __INITIAL_STATE__ parsen {
    class: node
    tooltip: "Deterministisch: Titel, Preis, Zimmer, Koordinaten, Fotos"
  }
  Count: Ergebnis-Zähler {
    class: node
    tooltip: "Abbruch wenn unter 20 Listings oder alle Seiten durch"
  }
}

p2: Phase 2 -- Smart Skip {
  class: container

  DB: DB-Abgleich {
    class: node
    tooltip: "getExistingListings() mappt external_id auf rent_gross und detail_scraped_at"
  }
  Decide: Entscheidung {
    class: node
    tooltip: "neu, geändert, fehlend oder skip"
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
    tooltip: "Einzelinserat, 5s Delay, Circuit Breaker nach 5 Fehlern"
  }
  Pinia: __PINIA_INITIAL_STATE__ {
    class: node
    tooltip: "Beschreibung, Amenities, Fotos, Grundrisse, Verwalter"
  }
  Update: Detail-Update + Amenities {
    class: node
    tooltip: "updateListingDetail(), upsertPhotos(), Amenity-Junction"
  }
}

p5: Phase 5 -- Abschluss {
  class: container

  Stale: Stale-Deaktivierung {
    class: node
    tooltip: "is_active=false nach 5 Tagen ohne Sichtung"
  }
  Enrich: KI-Enrichment {
    class: node
    tooltip: "Claude Haiku, max 20 Listings pro Lauf"
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
p2.Decide -> p4.Fetch2: "Nur neu/geändert/fehlend" {
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
DataDome + Cloudflare auf Homegate blockieren Container-Traffic unabhängig vom Browserverhalten. Es liegt an IP-Reputation und TLS-Fingerprinting, nicht an Navigation oder Delays.
:::

Scrapfly löst dieses Problem serverseitig: Die API leitet Requests über ein Netzwerk von Residential-IPs mit korrekten TLS-Fingerprints. Der Scraper sendet einen einfachen HTTP GET mit den Parametern `asp=true` (Anti-Scraping Protection) und `country=de`. Kein Browser, kein JavaScript-Rendering, kein Playwright.

Der Länderparameter stand ursprünglich auf `ch`. Er musste auf `de` wechseln, weil Scrapflys Schweizer Residential-IPs von den Portalen gesperrt wurden. Deutsche IPs werden von Homegate und ImmoScout24 unverändert akzeptiert.

Getestet und gescheitert (vor Scrapfly):
- rebrowser-playwright-core, Headed Chrome + Xvfb, Stealth-Scripts
- Evomi Scraping Browser, Evomi Scraper API
- Firecrawl (33% Erfolgsrate auf geschützten Seiten)

Scrapfly erreicht 96-98% Erfolgsrate bei 25 Credits pro ASP-Request.

## Plattform-Strategie (SMG-Vergleichsscan)

Ein einmaliger Vergleichsscan (2026-04-12) hat die Überlappung zwischen den Schweizer Immobilienportalen gemessen:

| Plattform | Verhältnis zu Homegate | Entscheidung |
|-----------|------------------------|-------------|
| ImmoScout24 | **96% Überlappung**, 4% exklusiv (6 von 136 Listings) | Wöchentlicher Nebenscan |
| Flatfox | SMG-Tochter seit 2023, zunehmend integriert | Nicht separat scrapen |
| anibis.ch | Via `anibisfill` auf Homegate syndiziert, gleiche IDs | Nicht separat scrapen |
| tutti.ch | Via `tuttifill` auf Homegate syndiziert, gleiche IDs | Nicht separat scrapen |

::: info SMG-Pool
Alle fünf Plattformen (Homegate, ImmoScout24, Flatfox, anibis, tutti) gehören zur Swiss Marketplace Group und teilen denselben Listing-Pool mit plattformübergreifend identischen IDs (z.B. `4003046935`). Homegate allein deckt den Pool nahezu vollständig ab.
:::

## Smart Skipping

Statt jedes Listing bei jedem Lauf komplett zu scrapen, entscheidet die DB-Abgleich-Logik pro Listing:

- **NEU** -- `external_id` nicht in DB -- Overview-Insert + Detail-Scrape
- **GEÄNDERT** -- `external_id` in DB, Preis anders -- Detail-Re-Scrape + Preishistorie
- **FEHLEND** -- `external_id` in DB, `detail_scraped_at IS NULL` -- Detail-Scrape nachholen
- **BEKANNT** -- `external_id` in DB, Preis gleich -- nur `last_seen_at` updaten, kein Scrape

::: tip Schutz gegen Massen-Deaktivierung
Wenn der Overview-Scan 0 Listings findet (vermutlich Anti-Bot-Block oder HTML-Strukturänderung), wird `deactivateStale` übersprungen. Damit werden bei einem fehlgeschlagenen Scan nicht alle bestehenden Listings fälschlich deaktiviert.
:::

## Datenextraktion

Beide Datenquellen liefern strukturiertes JSON direkt aus dem Server-Side-Rendering. Kein LLM nötig für die Grundextraktion.

- **Übersichtsseiten** -- `window.__INITIAL_STATE__` enthält die Suchergebnisse als JSON (Titel, Preis, Zimmer, Koordinaten, Fotos)
- **Detailseiten** -- `window.__PINIA_INITIAL_STATE__` (Vue 3/Pinia Store) enthält Beschreibung, Amenities, alle Fotos, Grundrisse, Verwalter-Kontakt

Die Homegate-URL-Struktur und die Scan-Tiers (PLZ-Strategie) stehen in der [Referenz](./referenz.md#homegate-url-struktur).

## KI-Enrichment

Nach dem Scraping analysiert Claude Haiku die Listing-Beschreibungen und extrahiert strukturierte Daten, die Homegate nicht als eigene Felder liefert (die vollständige Feldliste steht in den [Enrichment-Feldern](./referenz.md#enrichment-felder)).

Das Enrichment läuft nach der Scraping-Phase mit maximal 20 Listings pro Lauf. Ein Circuit Breaker stoppt nach 3 aufeinanderfolgenden Fehlern. Listings ohne Beschreibung werden übersprungen.

Die Ergebnisse werden in `enrichment_data` (JSONB) gespeichert und stehen in Metabase als filterbare Felder zur Verfügung.

## Photo-Archivierung auf NFS

Der Scraper lädt die Inserat-Fotos nach dem Detail-Scrape auf die Synology-NFS-Share herunter. Damit sind sie unabhängig von Homegates signierten CDN-URLs, die nach wenigen Tagen ablaufen und historische Inserate sonst "blind" machen würden.

Die Dateien liegen unter `/nfs/docker/immoscraper/photos/` in drei Konventionen:

- **`{listing_id}/{sort_order:03d}.jpg`** -- pro Inserat ein Verzeichnis mit den Original-Fotos in Sortierung
- **`{listing_id}/{sort_order:03d}_floorplan.jpg`** -- Grundrisse mit Suffix (verwendet `is_floorplan=true` im Photo-Row)
- **`projects/<slug>/NNN.jpg`** -- generische Projektbilder (Visualisierungen, Drohnenaufnahmen, Baufortschritt), die als Fallback für deaktivierte Listings oder für `project_unit`-basierte Research-Listings dienen

Die Felder `listing_photo.storage_path` (relativer Pfad) und `listing_photo.download_status` (`pending`, `downloaded`, `failed`, `expired`) tracken den Zustand. Der Scraper lädt die Bilder parallelisiert (Semaphore mit Concurrency-Limit) und setzt bei 403/404 den Status auf `failed`, ohne Retry. Bei Re-Scrapes bleibt der `storage_path` erhalten, solange die CDN-URL unverändert ist -- ändert Homegate die Signatur, wird der Pfad zurückgesetzt und neu heruntergeladen, sodass archivierte Fotos bei Routine-Scans nicht verloren gehen.

### Grundriss-PDFs

Homegate liefert Grundrisse als PDF-URLs statt als Bilder. Der Downloader erkennt PDFs am `%PDF`-Header und konvertiert sie via `pdftoppm` (aus `poppler-utils`, im Scraper-Image installiert) zur ersten Seite als JPG unter dem bestehenden `_floorplan.jpg`-Pfad, sodass das Frontend sie wie normale Fotos rendert.


### Frontend-Nutzung

Der Immo-Monitor-Container mountet den NFS-Pfad read-only und liefert die Bilder über eine dedizierte Traefik-Route `/api/photos/*` (ohne Authentik-Middleware, mit Path-Traversal-Schutz im SvelteKit-Endpoint). Details im [Frontend-Wiki](../immo-monitor/index.md).

## Notifications (Telegram)

Der Scraper sendet nach jedem Lauf eine Zusammenfassung an den gleichen Telegram Bot der auch von den Media-Batch-Jobs verwendet wird (Vault `kv/data/shared/telegram`).

Die Nachricht enthält pro Portal: Anzahl neue Listings, Detail-Scrapes, Deaktivierungen, Dauer -- sowie den Scrapfly-Credit-Verbrauch und die Anzahl angereicherter Listings. Bei Fehlern erhält die Nachricht eine erhöhte Priorität.

## CI/CD Pipeline

Der GitHub Actions Runner läuft als Nomad Service-Job mit Docker-Socket-Mount und Host-Netzwerk (ZOT über `zot.service.consul:5000` via Consul-DNS erreichbar). Das Dockerfile nutzt einen Multi-Stage Build: TypeScript wird in der Build-Stage kompiliert, das Production-Image enthält nur Runtime-Dependencies.

Der Workflow triggert bei Änderungen in `services/n8n-workflows/scraper/` oder bei manuellem Dispatch.

## Kosten

| Posten | Kosten/Monat |
|--------|-------------|
| Scrapfly Discovery Plan | CHF 30 |
| Claude Haiku Enrichment | ~CHF 2 |
| **Total** | **~CHF 32** |

## Zurückgestellte Plattformen

### newhome.ch (zurückgestellt)

newhome.ch gehört den Kantonalbanken/AXA und hat einen eigenständigen Datenbestand (nicht SMG). Ein Test-Scrape (2026-04-12) zeigte jedoch ein ungünstiges Kosten-Nutzen-Verhältnis:

- Nur **3 Listings für Dottikon** (vs. 289 auf Homegate)
- **Angular SPA** ohne strukturierte JSON-Daten -- braucht fragiles DOM-Parsing
- **Cloudflare Managed Challenge** -- erzwingt `render_js=true` (30 Credits/Request statt 25)
- Kein `__INITIAL_STATE__` oder öffentliche API -- Wartungsaufwand bei Redesign hoch

::: warning newhome.ch nicht integriert
Zurückgestellt wegen minimalem Mehrwert (3 Listings) bei überproportionalem Implementierungs- und Wartungsaufwand.
:::

## Verwandte Seiten

- [Immobilien-Monitoring Referenz](./referenz.md) -- DB-Schema, Vault-Secrets, Credit-Management, URL-Struktur, Scan-Tiers, Enrichment-Felder
- [Frühsignal-Pipeline](./fruehsignal.md) -- Neubau-Erkennung vor dem Inserat
- [Immo-Monitor Frontend](../immo-monitor/) -- SvelteKit Kartenansicht
- [Metabase](../metabase/) -- BI-Dashboard für Visualisierung
- [Datenbank-Architektur](../../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Batch-Jobs](../../_querschnitt/batch-jobs.md) -- Übersicht aller Nomad Periodic Jobs
- [GitHub Runner](../github-runner/) -- Self-Hosted CI/CD Runner
- [Telegram Bots](../../monitoring/keep/telegram-bots.md) -- Benachrichtigungssystem
- [Docker Registry (ZOT)](../../plattform/docker-registry/) -- OCI Image Registry
- [Vault](../../plattform/vault/) -- Secret Management
