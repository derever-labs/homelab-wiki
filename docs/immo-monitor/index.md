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

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [immo-monitor.ackermannprivat.ch](https://immo-monitor.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/immo-monitor.nomad`) |
| **Datenbank** | PostgreSQL `n8n` (Shared mit n8n und immoscraper) |
| **Auth** | `intern-api@file` (intern/VPN) + `public-auth@file` (extern via Authentik) |

## Rolle im Stack

Immo Monitor ersetzt die bisherige Kombination aus Metabase + Leaflet + NocoDB durch eine fokussierte Single-Page-App. Die App liest aus denselben Tabellen, die der Homegate-Scraper befüllt, und bietet Schreibzugriff ausschliesslich auf `listing_note` (Favoriten, Notizen, Ablehnungen).

## Architektur

```d2
direction: right

Browser: Browser { style.border-radius: 8 }

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: "10.0.2.20"
  RI: "intern-api@file (LAN/VPN)" { style.border-radius: 8 }
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

Die App nutzt die bestehende n8n-PostgreSQL-Datenbank (`postgres.service.consul:5432/n8n`).

::: warning Kein eigener DB-User
Aktuell nutzt die App den `n8n`-User mit vollen Rechten. Für Produktion sollte ein dedizierter `immo_monitor`-User mit eingeschränkten Rechten erstellt werden (SELECT auf alle Tabellen, INSERT/UPDATE nur auf `listing_note`).
:::

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/n8n` | `db_password` (gleicher User wie n8n und immoscraper) |

## Offene Punkte

- Detail-Scraper: Fotos in `listing_photo` speichern (aktuell 0 Einträge)
- Dedizierter DB-User `immo_monitor` mit eingeschränkten Rechten
- GitHub Actions CI/CD Pipeline
- Filter-State in URL-Params persistieren

## Verwandte Seiten

- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Scraper und Datenbank-Schema
- [n8n](../n8n/index.md) -- Shared PostgreSQL-Datenbank
- [Metabase](../metabase/index.md) -- Alternatives BI-Dashboard
- [Traefik Referenz](../traefik/referenz.md) -- Middleware Chains für Authentifizierung
