---
title: Immo Monitor
description: Custom Web-App für das Monitoring von Mietinseraten rund um Dottikon AG
tags:
  - service
  - immobilien
  - nomad
  - sveltekit
---

# Immo Monitor

Immo Monitor ist eine SvelteKit-App, die Mietinserate aus dem Homegate-Scraper visualisiert. Sie bietet Karten-, Listen- und Chart-Ansichten sowie Schreibzugriff auf Favoriten und Notizen.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [immo.ackermannprivat.ch](https://immo.ackermannprivat.ch) |
| Deployment | Nomad Job `services/immo-monitor.nomad` |
| Datenbank | PostgreSQL `immo` (User `immo`) |
| Auth | `intern-auth@file` (intern, Authentik + IP-Allowlist) + `public-auth@file` (extern, Authentik + CrowdSec) |
| Zugriff | Gruppen `admin` und `family` |

## Rolle im Stack

Immo Monitor ersetzt die bisherige Kombination aus Metabase + Leaflet + NocoDB durch eine fokussierte Single-Page-App. Die App liest aus denselben Tabellen, die der Homegate-Scraper befüllt, und bietet Schreibzugriff ausschliesslich auf `listing_note` (Favoriten, Notizen, Ablehnungen).

## Architektur

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

direction: right

Browser: Browser { class: node }

Traefik: Traefik {
  class: container
  tooltip: "10.0.2.20"
  RI: "intern-auth@file (LAN/VPN)" { class: node }
  RE: "public-auth@file (extern)" { class: node }
  RP: "Photo Route (ohne Auth, Priority 1000000)" { class: node }
}

App: "Immo Monitor (SvelteKit)" {
  class: node
  tooltip: "Drizzle ORM, Leaflet, shadcn-svelte"
}
PG: "PostgreSQL immo" {
  shape: cylinder
  tooltip: "Read-only ausser listing_note"
}
NFS: "NFS Photo-Archiv" {
  shape: cylinder
  tooltip: "/nfs/docker/immoscraper/photos/ | Read-only Mount"
}
Scraper: "immoscraper Batch-Job" { class: node }

Browser -> Traefik.RI: HTTPS intern
Browser -> Traefik.RE: HTTPS extern
Browser -> Traefik.RP: "Bilder /api/photos/*"
Traefik.RI -> App
Traefik.RE -> App
Traefik.RP -> App: "Path-Traversal-Schutz im Endpoint"
App -> PG: "Lesen (listing, listing_photo, ...)\nSchreiben (listing_note)"
App -> NFS: "Bilder lesen"
Scraper -> PG: Schreibt Inseratedaten
Scraper -> NFS: Schreibt Fotos
```

## Tech Stack

- **Frontend:** SvelteKit (Svelte 5, Runes) mit adapter-node
- **UI:** shadcn-svelte + Tailwind CSS v4 (Zinc + Amber)
- **ORM:** Drizzle ORM auf PostgreSQL
- **Karten:** Leaflet + CartoDB Positron + leaflet.heat
- **Charts:** Chart.js

## Seiten

- **Home** (`/`): KPIs + neue Inserate seit letztem Besuch (localStorage)
- **Inserate** (`/inserate`): Filterbarer Card-Grid mit Favorit/Reject/Vergleich, CHF/m²-Filter, "vermietet"-Badge für deaktivierte Listings
- **Favoriten** (`/favoriten`): Gleicher Card-Grid wie Inserate, vorgefiltert auf `isFavorite`
- **Detail** (`/inserate/[id]`): Foto-Galerie, Kerndaten, Amenities, Notizfeld, Preishistorie
- **Karte** (`/karte`): CartoDB Positron, farbkodierte CircleMarker (CHF/m²), Bauzonen-WMS (Aargau), Heatmap-Toggle
- **Überblick** (`/ueberblick`): Charts inkl. Median CHF/m² pro Gemeinde (volle Breite)
- **Vergleich** (`/vergleich`): Side-by-Side Tabelle für max. 3 Inserate
- **About** (`/about`): Methoden-Transparenz -- Datenquellen, Farbskala, "vermietet"-Heuristik, Bauzonen-Layer

## Photo-Archivierung

Die Fotos werden nicht mehr direkt vom Homegate-CDN geladen, sondern als lokale Kopie auf der Synology NFS-Share ausgeliefert. Der Immo-Monitor-Container mountet `/nfs/docker/immoscraper/photos/` read-only und liefert die Bilder über eine dedizierte API-Route `/api/photos/*` aus.

::: info Warum lokal archivieren
Homegate-CDN-URLs enthalten signierte Query-Parameter, die nach einigen Tagen ablaufen. Deaktivierte Inserate (vermietet, zurückgezogen) verlieren damit rückwirkend ihre Fotos. Die NFS-Kopie garantiert, dass historische Inserate und Preisverläufe auch nach Monaten noch mit Bildern angezeigt werden können.
:::

Die Fotos werden pro Listing unter `{listing_id}/{sort_order:03d}.jpg` abgelegt. Zusätzlich gibt es das Verzeichnis `projects/<slug>/NNN.jpg` für generische Projektbilder (Visualisierungen, Drohnenaufnahmen, Baufortschritt), die als Fallback für deaktivierte Listings mit abgelaufenen CDN-URLs genutzt werden.

### Traefik-Route ohne Authentik

Die Route `/api/photos/*` läuft **ohne** Authentik-Middleware, weil Authentik bei jedem Bild-Request einen OIDC-Flow anstossen würde (langsam, bricht bei externem Embedding). Stattdessen kommt der Zugriffsschutz aus zwei Quellen:

1. **Path-Traversal-Schutz im Endpoint**: Die SvelteKit-Route lehnt alle Pfade mit `..` ab und verhindert damit das Ausbrechen aus dem NFS-Mount.
2. **Keine Directory-Listing**: Der Endpoint liefert nur existierende Dateien, kein Index.

::: warning Traefik Router Priority
Die Photo-Route muss eine höhere `priority` haben als die Host-basierten Default-Router (Path-Prefix-Router sonst überstimmt). Im Nomad Job ist `priority=1000000` gesetzt -- sonst greift die Authentik-Kette und Bilder werden mit 302 Redirects auf den Login geleitet.
:::

## Vermarktungsstart-Tracking

Homegate setzt bei Re-Listings (gleiche Wohnung, neue externe ID) einen neuen `createdAt`-Zeitstempel. Der Scraper-`first_seen_at` entspricht damit nicht dem tatsächlichen Vermarktungsstart -- ein Inserat, das seit 1.5 Jahren auf dem Markt ist, wirkt im Monitor wie eine brandneue Listung.

Die Lösung ist eine Prioritätskette mit drei Quellen für das "erstmals gesehen"-Datum:

1. **`listing_external_id_history`** -- manuell recherchierter echter Vermarktungsstart (Projekt-Websites, Wayback Machine, Aargauer Zeitung). Ohne `min.`-Prefix, exakter Wert.
2. **`listing.first_seen_at_override`** -- schneller manueller Override pro Inserat ohne Recherche-Eintrag.
3. **`listing.first_seen_at`** -- Homegate `createdAt` als Fallback. Im Frontend mit `min.`-Prefix markiert, weil der echte Wert älter sein kann.

Die Kette wird im Server-Load über eine SQL-Subquery aufgelöst und als `firstSeenSource` (`history` / `override` / `scraper`) an die Frontend-Komponenten weitergereicht. Diese zeigen den `min.`-Prefix nur dann, wenn die Quelle `scraper` ist.

Für Projekt-Units aus der `project_unit`-Tabelle greift zusätzlich `project.marketing_started_at`, sofern das Feld im Projekt-Datensatz gesetzt ist. Damit lassen sich ganze Etappen (z.B. Mattenpark Etappe 1: 2022-10-27, Etappe 2: 2025-07-01) auf einmal datieren.

## Datenbank

Die App nutzt eine eigene PostgreSQL-Datenbank (`postgres.service.consul:5432/immo`, User `immo`).

::: warning Eingeschränkte Rechte ausstehend
Der DB-User `immo` hat aktuell volle Rechte auf die Datenbank. Idealerweise sollten die Rechte eingeschränkt werden (SELECT auf alle Tabellen, INSERT/UPDATE nur auf `listing_note`).
:::

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/immo-monitor` | `db_password` |

## Offene Punkte

- DB-User `immo` mit eingeschränkten Rechten (SELECT + INSERT/UPDATE nur auf `listing_note`)
- Filter-State in URL-Params persistieren
- Photo-Fallback auch für noch aktive Listings auf NFS kopieren (aktuell nur deaktivierte im Archiv)

## Verwandte Seiten

- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Scraper und Datenbank-Schema
- [NAS Storage](../nas-storage/index.md) -- NFS-Share fuer Photo-Archiv
- [n8n](../n8n/index.md) -- Shared PostgreSQL-Datenbank
- [Metabase](../metabase/index.md) -- Alternatives BI-Dashboard
- [Traefik Referenz](../traefik/referenz.md) -- Middleware Chains für Authentifizierung
