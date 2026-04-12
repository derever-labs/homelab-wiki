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
direction: right

Browser: Browser { style.border-radius: 8 }

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: "10.0.2.20"
  RI: "intern-auth@file (LAN/VPN)" { style.border-radius: 8 }
  RE: "public-auth@file (extern)" { style.border-radius: 8 }
}

App: "Immo Monitor (SvelteKit)" { style.border-radius: 8 }
PG: "PostgreSQL (n8n DB)" { shape: cylinder }
Scraper: "immoscraper" { style.border-radius: 8 }

Browser -> Traefik.RI: HTTPS intern
Browser -> Traefik.RE: HTTPS extern
Traefik.RI -> App
Traefik.RE -> App
App -> PG: "Lesen (listing, listing_photo, ...)\nSchreiben (listing_note)"
Scraper -> PG: Schreibt Inseratedaten
```

## Tech Stack

- **Frontend:** SvelteKit (Svelte 5, Runes) mit adapter-node
- **UI:** shadcn-svelte + Tailwind CSS v4 (Zinc + Amber)
- **ORM:** Drizzle ORM auf PostgreSQL
- **Karten:** Leaflet + CartoDB Positron + leaflet.heat
- **Charts:** Chart.js

## Seiten

- **Home** (`/`): KPIs + neue Inserate seit letztem Besuch (localStorage)
- **Inserate** (`/inserate`): Filterbarer Card-Grid mit Favorit/Reject/Vergleich
- **Detail** (`/inserate/[id]`): Foto-Galerie, Kerndaten, Amenities, Notizfeld, Preishistorie
- **Karte** (`/karte`): CartoDB Positron, farbkodierte CircleMarker (CHF/m²), Heatmap-Toggle
- **Überblick** (`/ueberblick`): 4 Charts (Preisverteilung, CHF/m² nach Ort, Zimmer, Amenities)
- **Vergleich** (`/vergleich`): Side-by-Side Tabelle für max. 3 Inserate

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

- Detail-Scraper: Fotos in `listing_photo` speichern (aktuell 0 Einträge)
- DB-User `immo` mit eingeschränkten Rechten (SELECT + INSERT/UPDATE nur auf `listing_note`)
- Filter-State in URL-Params persistieren

## Verwandte Seiten

- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Scraper und Datenbank-Schema
- [n8n](../n8n/index.md) -- Shared PostgreSQL-Datenbank
- [Metabase](../metabase/index.md) -- Alternatives BI-Dashboard
- [Traefik Referenz](../traefik/referenz.md) -- Middleware Chains für Authentifizierung
