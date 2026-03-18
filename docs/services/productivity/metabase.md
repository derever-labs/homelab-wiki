---
title: Metabase
description: Business-Intelligence-Plattform fuer Datenvisualisierung und Dashboards
tags:
  - service
  - analytics
  - nomad
---

# Metabase

## Uebersicht

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

## Beschreibung

Metabase stellt Daten aus der `n8n`-Datenbank als Dashboards dar. Primaerer Use Case: [Immobilien-Monitoring](./immobilien-monitoring.md) mit Karten, Preisvergleichen und Inseratuebersichten.

## Ersteinrichtung

1. `/setup` aufrufen und Admin-Account erstellen
2. Datenquelle hinzufuegen: PostgreSQL, Host `postgres.service.consul`, DB `n8n`, User `metabase_reader`
3. Dashboards fuer Immobilien-Monitoring aufbauen

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/metabase` | `db_password`, `n8n_reader_password` |
