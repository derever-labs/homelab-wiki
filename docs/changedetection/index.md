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

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [change.ackermannprivat.ch](https://change.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/changedetection.nomad`) |
| **Storage** | NFS `/nfs/docker/changedetection/datastore` |
| **Datenbank** | Keine (Dateibasiert) |
| **Auth** | `intern-auth@file` |

## Rolle im Stack

ChangeDetection.io überwacht Webseiten auf inhaltliche Änderungen und benachrichtigt bei Veränderungen. Ein Playwright-Chrome-Sidecar übernimmt das JavaScript-Rendering, damit auch dynamisch geladene Inhalte korrekt erfasst werden. Wird unter anderem für das [Immobilien-Monitoring](../immobilien-monitoring/index.md) eingesetzt.

## Architektur

```d2
direction: right

USER: Browser

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: 10.0.2.20
  R1: "Router: change.*\nintern-auth"
}

Nomad: Nomad Job {
  style.stroke-dash: 4
  CD: "ChangeDetection\n(Port 5000)"
  PW: "Playwright Chrome\n(Sidecar, Port 3000)"
}

External: Externe Websites {
  style.stroke-dash: 4
  WEB: "Überwachte\nWebseiten"
}

USER -> Traefik.R1: HTTPS
Traefik.R1 -> Nomad.CD
Nomad.CD -> Nomad.PW: WebSocket
Nomad.PW -> External.WEB: HTTP/JS
```

## Konfiguration

### Storage

Alle Watches, Snapshots und Einstellungen liegen dateibasiert auf NFS unter `/nfs/docker/changedetection/datastore`.

### Playwright Sidecar

Ein Browserless-Chrome-Container läuft als Nomad Sidecar-Task und stellt über WebSocket (Port 3000) einen headless Browser bereit. Konfigurierte Optimierungen:

- Stealth Mode und Ad-Blocking aktiviert
- Max 10 gleichzeitige Sessions
- Vorgestartete Chrome-Instanz (`PREBOOT_CHROME=true`)
- Auflösung 1920x1080

Ressourcen: Siehe Nomad-Job `services/changedetection.nomad`.

## Abhängigkeiten

- **Traefik** -- HTTPS-Routing und Authentik ForwardAuth Middleware
- **Authentik** -- ForwardAuth-Provider (über `intern-auth`)
- **NFS** -- Datenpersistenz

## Verwandte Seiten

- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Nutzt ChangeDetection für Webseiten-Überwachung
- [n8n](../n8n/index.md) -- Workflow-Automation für Benachrichtigungen
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Watches und Snapshots
