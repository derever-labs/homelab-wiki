---
title: n8n
description: Workflow-Automation-Plattform für Datenverarbeitung und Integrationen
tags:
  - service
  - automation
  - nomad
---

# n8n

n8n ist die zentrale Workflow-Automation-Plattform für Datenverarbeitung, API-Integrationen und Scraping-Workflows.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [n8n.ackermannprivat.ch](https://n8n.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/n8n.nomad` |
| Datenbank | PostgreSQL `n8n` (User: `n8n`) |
| Storage | Ephemeral (Binary Data in PostgreSQL) |
| Auth | n8n Built-in (kein OAuth, wegen Webhook-Kompatibilität); UI hinter Middleware `intern-auth@file` (IP-Allowlist plus Authentik ForwardAuth) |

## Rolle im Stack

Aktive Workflows:
- [Immobilien-Monitoring](../immobilien-monitoring/index.md)
- [Zeiterfassung](../zeiterfassung/index.md) (Geofence-Automation für solidtime)

## Konfiguration

- **Timezone:** Europe/Zurich
- **Telemetrie:** Deaktiviert
- **Binary Data Mode:** `database` (`N8N_DEFAULT_BINARY_DATA_MODE=database`) -- alle Binärdaten werden in PostgreSQL gespeichert, kein persistentes Volume nötig
- **Encryption Key:** Aus Vault (`kv/data/n8n`)

## Netzwerk und Webhooks

Die n8n-UI ist nur intern erreichbar (`intern-auth@file`). Webhooks sind **einzeln freigeschaltet** via separatem Traefik-Router:

| Webhook | Extern | Zweck |
| :--- | :--- | :--- |
| `/webhook/arbeit-start` | Ja | [Zeiterfassung](../zeiterfassung/index.md): Timer starten |
| `/webhook/arbeit-stop` | Ja | [Zeiterfassung](../zeiterfassung/index.md): Timer stoppen |
| `/webhook/git-commit` | Ja | [Zeiterfassung](../zeiterfassung/index.md): Git-Commit Tracking |
| `/webhook/tieffurt-30min` | Ja | [Immobilien-Monitoring](../immobilien-monitoring/index.md): Tieffurt-Scan alle 30 Minuten |
| Alle anderen `/webhook/*` | Nein | Hinter IP-Whitelist |

Zu jedem freigeschalteten Pfad ist der parallele `/webhook-test/*`-Testpfad ebenfalls extern erreichbar. Neue Webhooks müssen explizit in der Traefik-Rule im Nomad Job freigeschaltet werden (siehe `services/n8n.nomad`).

## Verwandte Seiten

- [Zeiterfassung](../zeiterfassung/index.md) -- Geofence-Automation und Git-Commit Tracking via n8n Workflows
- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Scraper Post-Processing und KI-Enrichment
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Webhook-Routing und IP-Whitelist
