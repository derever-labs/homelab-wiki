---
title: n8n
description: Workflow-Automation-Plattform fuer Datenverarbeitung und Integrationen
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
| **Storage** | NFS `/nfs/docker/n8n` |
| **Auth** | n8n Built-in (kein OAuth, wegen Webhook-Kompatibilitaet) |
| **Netzwerk** | Intern (`intern-chain@file`) |

## Beschreibung

n8n ist eine Workflow-Automation-Plattform für Datenverarbeitung, API-Integrationen und Scraping-Workflows.

Aktive Workflows:
- [Immobilien-Monitoring](./immobilien-monitoring.md)
- [Zeiterfassung](./zeiterfassung.md) (Geofence-Automation fuer solidtime)

## Konfiguration

- **Timezone:** Europe/Zurich
- **Telemetrie:** Deaktiviert

## Netzwerk und Webhooks

Die n8n-UI ist nur intern erreichbar (`intern-chain@file`). Webhooks sind **einzeln freigeschaltet** via separatem Traefik-Router:

| Webhook | Extern | Zweck |
| :--- | :--- | :--- |
| `/webhook/arbeit-start` | Ja | [Zeiterfassung](./zeiterfassung.md): Timer starten |
| `/webhook/arbeit-stop` | Ja | [Zeiterfassung](./zeiterfassung.md): Timer stoppen |
| Alle anderen `/webhook/*` | Nein | Hinter IP-Whitelist |

Neue Webhooks muessen explizit in der Traefik-Rule im Nomad Job freigeschaltet werden (siehe `services/n8n.nomad`).

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/n8n` | `db_password`, `encryption_key` |
