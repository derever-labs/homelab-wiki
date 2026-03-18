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

n8n ist eine Workflow-Automation-Plattform für Datenverarbeitung, API-Integrationen und Scraping-Workflows. Aktuell genutzt für das [Immobilien-Monitoring](./immobilien-monitoring.md).

## Konfiguration

- **Webhooks:** Extern erreichbar via `https://n8n.ackermannprivat.ch/webhook/...`
- **Timezone:** Europe/Zurich
- **Telemetrie:** Deaktiviert

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/n8n` | `db_password`, `encryption_key` |
