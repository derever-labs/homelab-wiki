---
title: n8n
description: Workflow-Automation-Plattform für Datenverarbeitung und Integrationen
tags:
  - service
  - automation
  - nomad
---

# n8n

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [n8n.ackermannprivat.ch](https://n8n.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/n8n.nomad`) |
| **Datenbank** | PostgreSQL `n8n` (User: `n8n`) |
| **Storage** | Ephemeral (Binary Data in PostgreSQL) |
| **Auth** | n8n Built-in (kein OAuth, wegen Webhook-Kompatibilität) |
| **Netzwerk** | Intern (`intern-noauth@file`) |

## Rolle im Stack

n8n ist die zentrale Workflow-Automation-Plattform für Datenverarbeitung, API-Integrationen und Scraping-Workflows.

Aktive Workflows:
- [Immobilien-Monitoring](../immobilien-monitoring/index.md)
- [Zeiterfassung](../zeiterfassung/index.md) (Geofence-Automation für solidtime)

## Konfiguration

- **Timezone:** Europe/Zurich
- **Telemetrie:** Deaktiviert
- **Binary Data Mode:** `database` (`N8N_DEFAULT_BINARY_DATA_MODE=database`) -- alle Binärdaten werden in PostgreSQL gespeichert, kein persistentes Volume nötig
- **Encryption Key:** Aus Vault (`kv/data/n8n`)

## Netzwerk und Webhooks

Die n8n-UI ist nur intern erreichbar (`intern-noauth@file`). Webhooks sind **einzeln freigeschaltet** via separatem Traefik-Router:

| Webhook | Extern | Zweck |
| :--- | :--- | :--- |
| `/webhook/arbeit-start` | Ja | [Zeiterfassung](../zeiterfassung/index.md): Timer starten |
| `/webhook/arbeit-stop` | Ja | [Zeiterfassung](../zeiterfassung/index.md): Timer stoppen |
| `/webhook/git-commit` | Ja | [Zeiterfassung](../zeiterfassung/index.md): Git-Commit Tracking |
| Alle anderen `/webhook/*` | Nein | Hinter IP-Whitelist |

Neue Webhooks müssen explizit in der Traefik-Rule im Nomad Job freigeschaltet werden (siehe `services/n8n.nomad`).

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/n8n` | `db_password`, `encryption_key` |

## Verwandte Seiten

- [Zeiterfassung](../zeiterfassung/index.md) -- Geofence-Automation und Git-Commit Tracking via n8n Workflows
- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Scraper Post-Processing und KI-Enrichment
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Webhook-Routing und IP-Whitelist
