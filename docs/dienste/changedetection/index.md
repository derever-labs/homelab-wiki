---
title: ChangeDetection.io
description: Website-Änderungsüberwachung mit geteiltem Browser-Dienst für JavaScript-Rendering
tags:
  - service
  - productivity
  - nomad
  - monitoring
---

# ChangeDetection.io

ChangeDetection.io überwacht Webseiten auf inhaltliche Änderungen und benachrichtigt bei Veränderungen. Das JavaScript-Rendering übernimmt der geteilte Browser-Dienst [Browserless](../browserless/), damit auch dynamisch geladene Inhalte korrekt erfasst werden.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [change.ackermannprivat.ch](https://change.ackermannprivat.ch) |
| Deployment | Nomad Job `services/changedetection.nomad` |
| Storage | Linstor CSI `changedetection-data` (rg-replicated, `/datastore`) |
| Auth | `intern-auth@file` |
| Browser-Backend | Geteilter Dienst [Browserless](../browserless/) |

## Rolle im Stack

Wird unter anderem für das [Immobilien-Monitoring](../immobilien-monitoring/index.md) eingesetzt.

## Architektur

```d2
direction: right

USER: Browser { style.border-radius: 8 }

Traefik: Traefik {
  style.stroke-dash: 4
  R1: "Router change.*\nintern-auth" { style.border-radius: 8 }
}

Nomad: "Nomad-Job changedetection" {
  style.stroke-dash: 4
  CD: ChangeDetection { style.border-radius: 8 }
}

BL: "browserless\n(geteilter Job)" { style.border-radius: 8 }

WEB: "Überwachte Webseiten" { style.border-radius: 8 }

USER -> Traefik.R1: HTTPS
Traefik.R1 -> Nomad.CD
Nomad.CD -> BL: "WebSocket via Consul-Name"
BL -> WEB: "HTTP + JS-Rendering"
```

## Konfiguration

### Browser-Backend

Das JavaScript-Rendering läuft über den eigenständigen Job [Browserless](../browserless/), den ChangeDetection per WebSocket über seinen Consul-Namen anspricht (`PLAYWRIGHT_DRIVER_URL` und `WEBDRIVER_URL` im Nomad-Job `services/changedetection.nomad`). Bis zum 28.07.2026 lief derselbe Container als Sidecar im ChangeDetection-Job -- er wurde herausgelöst, damit auch andere Dienste denselben Browser nutzen können. Die Betriebs-Parameter des Browsers stehen seither im Browserless-Job, nicht mehr hier.

## Verwandte Seiten

- [Browserless](../browserless/) -- geteilter Headless-Browser für das JavaScript-Rendering
- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Nutzt ChangeDetection für Webseiten-Überwachung
- [n8n](../n8n/index.md) -- Workflow-Automation für Benachrichtigungen
- [Traefik Middlewares](../../edge/traefik/referenz.md) -- Auth-Chain-Konfiguration
