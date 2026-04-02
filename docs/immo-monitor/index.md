# Immo Monitor

Custom-Web-App fuer das Monitoring von Mietinseraten rund um Dottikon AG (7km Radius).

## Zweck

Ersetzt die Kombination aus Metabase + Leaflet + NocoDB durch eine fokussierte Single-Page-App mit:
- Farbkodierten Karten-Pins (CHF/m²)
- Foto-Galerie pro Inserat
- Favoriten/Notizen (Schreibzugriff)
- Interaktive Filter ueber alle Seiten
- Marktanalyse-Charts

## Tech Stack

- **Frontend:** SvelteKit (Svelte 5, Runes) + adapter-node
- **UI:** shadcn-svelte + Tailwind CSS v4 (Zinc + Amber)
- **DB:** Drizzle ORM → PostgreSQL (n8n-DB, gleicher User)
- **Karten:** Leaflet + CartoDB Positron + leaflet.heat
- **Charts:** Chart.js
- **Auth:** Traefik intern-api (IP-Whitelist) + public-auth (Authentik ForwardAuth extern)

## Architektur

```
Browser → Traefik → immo-monitor:3000 → PostgreSQL (n8n DB)
                                         ↑
                                  immoscraper (schreibt Daten)
```

Die App liest aus den gleichen Tabellen die der Homegate-Scraper befuellt:
`listing`, `listing_photo`, `amenity`, `listing_amenity`, `listing_price_history`

Schreibzugriff nur auf `listing_note` (Favoriten, Notizen, Ablehnungen).

## Seiten

- **Home** (`/`): KPIs + neue Inserate seit letztem Besuch (localStorage)
- **Inserate** (`/inserate`): Filterbarer Card-Grid mit Favorit/Reject/Vergleich
- **Detail** (`/inserate/[id]`): Foto-Galerie, Kerndaten, Amenities, Notizfeld, Preishistorie
- **Karte** (`/karte`): CartoDB Positron, farbkodierte CircleMarker, Heatmap-Toggle, Filter
- **Ueberblick** (`/ueberblick`): 4 Charts (Preisverteilung, CHF/m² nach Ort, Zimmer, Amenities)
- **Vergleich** (`/vergleich`): Side-by-Side Tabelle fuer max 3 Inserate

## Deployment

- **Nomad Job:** `nomad-jobs/services/immo-monitor.nomad`
- **Image:** `localhost:5000/library/immo-monitor:latest`
- **Port:** 3000
- **Health:** `/health` (HTTP, 30s Intervall)
- **Secrets:** Vault `kv/data/n8n` → `db_password` (gleicher User wie n8n/immoscraper)
- **Resources:** 300 mCPU, 256 MB RAM, max 512 MB

## URL

`https://immo-monitor.ackermannprivat.ch`

- Intern (LAN/VPN): Direkt via intern-api (IP-Whitelist)
- Extern: Via public-auth (Authentik ForwardAuth)

## Datenbank

Nutzt die bestehende n8n-PostgreSQL-Datenbank (`postgres.service.consul:5432/n8n`) mit dem `n8n`-User.

::: warning Kein eigener DB-User
Aktuell nutzt die App den `n8n`-User mit vollen Rechten. Fuer Production sollte ein dedizierter `immo_monitor`-User mit eingeschraenkten Rechten erstellt werden (SELECT auf alle Tabellen, INSERT/UPDATE nur auf `listing_note`).
:::

## Offene Punkte

- Detail-Scraper: Fotos in `listing_photo` speichern (aktuell 0 Eintraege)
- Dedizierter DB-User `immo_monitor` mit eingeschraenkten Rechten
- GitHub Actions CI/CD Pipeline
- Filter-State in URL-Params persistieren
