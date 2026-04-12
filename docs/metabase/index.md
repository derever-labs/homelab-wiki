---
title: Metabase
description: Business-Intelligence-Plattform für Datenvisualisierung und Dashboards
tags:
  - service
  - analytics
  - nomad
---

# Metabase

## Übersicht

Metabase ist die Business-Intelligence-Plattform für Datenvisualisierung. Primärer Einsatz: Dashboards für das Immobilien-Monitoring.

| Attribut | Wert |
|----------|------|
| URL | [metabase.ackermannprivat.ch](https://metabase.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/metabase.nomad` |
| Datenbank | PostgreSQL `metabase` (eigene DB für Metabase-Metadaten) |
| Datenquelle | PostgreSQL `n8n` (User: `metabase_reader`, read-only) |
| Storage | NFS `/nfs/docker/metabase/plugins` |
| Netzwerk | Intern: IP-Whitelist, Extern: OAuth2 Family |

## Rolle im Stack

Metabase stellt Daten aus der `n8n`-Datenbank als Dashboards dar. Primärer Use Case: [Immobilien-Monitoring](../immobilien-monitoring/index.md) mit Karten, Preisvergleichen und Inseratübersichten.

## Datenquelle

PostgreSQL `n8n` ist als "Immobilien (n8n DB)" konfiguriert. Der User `metabase_reader` hat read-only Zugriff auf alle relevanten Tabellen:

- `listing`, `listing_photo`, `listing_price_history`
- `amenity`, `listing_amenity`, `listing_note`
- `scraper_runs`
- `v_listing_active` (View mit berechneten Feldern)

Semantic Types sind konfiguriert: Latitude/Longitude, Currency CHF für Preisfelder, ImageURL für `photo_url`, `raw_data` und `amenities` JSONB sind versteckt.

## Dashboards

Alle Dashboards liegen in der Collection "Immobilien-Monitoring":

- **Active Listings** -- Kartenansicht (Pin Map) + Tabellenübersicht aller aktiven Inserate
- **New Today** -- Heute neu entdeckte Inserate + letzte 7 Tage
- **Market Analytics** -- Kennzahlen, Durchschnittspreis/Stadt, Zimmerverteilung (Pie), Preis/m2, Amenities Top 10
- **Price Drops** -- Listings mit Preisänderungen (basiert auf `listing_price_history`)

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/metabase` | `db_password`, `n8n_reader_password` |

## Verwandte Seiten

- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Primärer Use Case für Metabase-Dashboards
- [n8n](../n8n/index.md) -- Datenquelle (PostgreSQL `n8n` Datenbank)
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
