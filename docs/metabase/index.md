---
title: Metabase
description: Business-Intelligence-Plattform fuer Datenvisualisierung und Dashboards
tags:
  - service
  - analytics
  - nomad
---

# Metabase

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Aufbau (Setup-Wizard offen) |
| **URL** | [metabase.ackermannprivat.ch](https://metabase.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/metabase.nomad`) |
| **Datenbank** | PostgreSQL `metabase` (eigene DB fuer Metabase-Metadaten) |
| **Datenquelle** | PostgreSQL `n8n` (User: `metabase_reader`, read-only) |
| **Storage** | NFS `/nfs/docker/metabase/plugins` |
| **Netzwerk** | Intern: IP-Whitelist, Extern: OAuth2 Family |
| **Site Name** | Immobilien-Monitor |

## Rolle im Stack

Metabase stellt Daten aus der `n8n`-Datenbank als Dashboards dar. Primärer Use Case: [Immobilien-Monitoring](../immobilien-monitoring/index.md) mit Karten, Preisvergleichen und Inseratübersichten.

## Ersteinrichtung

1. `/setup` aufrufen und Admin-Account erstellen
2. Datenquelle hinzufügen: PostgreSQL, Host `postgres.service.consul`, DB `n8n`, User `metabase_reader`
3. Dashboards für Immobilien-Monitoring aufbauen

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/metabase` | `db_password`, `n8n_reader_password` |

## Verwandte Seiten

- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Primärer Use Case für Metabase-Dashboards
- [n8n](../n8n/index.md) -- Datenquelle (PostgreSQL `n8n` Datenbank)
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
