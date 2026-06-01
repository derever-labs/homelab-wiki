---
title: Metabase
description: Business-Intelligence-Plattform für Datenvisualisierung und Dashboards
tags:
  - service
  - analytics
  - nomad
---

# Metabase

Metabase ist die Business-Intelligence-Plattform für Datenvisualisierung. Primärer Einsatz: Dashboards für das Immobilien-Monitoring.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [metabase.ackermannprivat.ch](https://metabase.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/metabase.nomad` |
| Storage | NFS `/nfs/docker/metabase/plugins` |
| Auth | `intern-auth@file` (Authentik ForwardAuth + IP-Allowlist), siehe [Traefik Middlewares](../traefik/referenz.md) |

## Rolle im Stack

Metabase stellt Daten aus der `n8n`-Datenbank als Dashboards dar. Primärer Use Case: [Immobilien-Monitoring](../immobilien-monitoring/index.md) mit Karten, Preisvergleichen und Inseratübersichten.

## Datenquelle

Metabase hält seine eigenen Metadaten in der PostgreSQL-Datenbank `metabase` (User `metabase`). Die dargestellten Daten kommen aus der PostgreSQL-Datenbank `n8n`, die als Datenquelle eingebunden ist; der User `metabase_reader` hat darauf ausschliesslich Lesezugriff. Die Dashboards liegen in der Collection "Immobilien-Monitoring".

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/metabase` | `db_password` |

## Verwandte Seiten

- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Primärer Use Case für Metabase-Dashboards
- [n8n](../n8n/index.md) -- Datenquelle (PostgreSQL `n8n` Datenbank)
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
