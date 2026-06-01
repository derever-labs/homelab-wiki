---
title: ChangeDetection.io
description: Website-Änderungsüberwachung mit Playwright-Sidecar für JavaScript-Rendering
tags:
  - service
  - productivity
  - nomad
  - monitoring
---

# ChangeDetection.io

ChangeDetection.io überwacht Webseiten auf inhaltliche Änderungen und benachrichtigt bei Veränderungen. Ein Playwright-Chrome-Sidecar übernimmt das JavaScript-Rendering, damit auch dynamisch geladene Inhalte korrekt erfasst werden.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [change.ackermannprivat.ch](https://change.ackermannprivat.ch) |
| Deployment | Nomad Job `services/changedetection.nomad` |
| Storage | NFS `/nfs/docker/changedetection/datastore` |
| Auth | `intern-auth@file` |

## Rolle im Stack

Wird unter anderem für das [Immobilien-Monitoring](../immobilien-monitoring/index.md) eingesetzt.

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: right

USER: Browser {
  style.border-radius: 8
}

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: 10.0.2.20
  R1: "Router: change.*\nintern-auth" {
    style.border-radius: 8
  }
}

Nomad: Nomad Job {
  style.stroke-dash: 4
  CD: "ChangeDetection\n(Port 5000)" {
    style.border-radius: 8
  }
  PW: "Playwright Chrome\n(Sidecar, Port 3000)" {
    style.border-radius: 8
  }
}

External: Externe Websites {
  style.stroke-dash: 4
  WEB: "Überwachte\nWebseiten" {
    style.border-radius: 8
  }
}

USER -> Traefik.R1: HTTPS
Traefik.R1 -> Nomad.CD
Nomad.CD -> Nomad.PW: WebSocket
Nomad.PW -> External.WEB: HTTP/JS
```

## Konfiguration

### Playwright Sidecar

Ein Browserless-Chrome-Container läuft als Nomad Sidecar-Task und stellt über WebSocket (Port 3000) einen headless Browser bereit. Die env-Var-Konfiguration (Stealth, Ad-Blocking, Session-Limit, Fenstergrösse) und Ressourcen liegen im Nomad-Job `services/changedetection.nomad`.

## Verwandte Seiten

- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Nutzt ChangeDetection für Webseiten-Überwachung
- [n8n](../n8n/index.md) -- Workflow-Automation für Benachrichtigungen
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Watches und Snapshots
