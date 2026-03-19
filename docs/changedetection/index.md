---
title: ChangeDetection.io
description: Website-Aenderungsueberwachung mit Playwright-Sidecar fuer JavaScript-Rendering
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
| **Auth** | `admin-chain-v2@file` |

## Rolle im Stack

ChangeDetection.io überwacht Webseiten auf inhaltliche Änderungen und benachrichtigt bei Veränderungen. Ein Playwright-Chrome-Sidecar übernimmt das JavaScript-Rendering, damit auch dynamisch geladene Inhalte korrekt erfasst werden. Wird unter anderem für das [Immobilien-Monitoring](../immobilien-monitoring/index.md) eingesetzt.

## Architektur

```mermaid
flowchart LR
    USER:::entry["Browser"]

    subgraph Traefik["Traefik (10.0.2.1)"]
        R1:::svc["Router: change.*<br>admin-chain-v2"]
    end

    subgraph Nomad["Nomad Job"]
        CD:::accent["ChangeDetection<br>(Port 5000)"]
        PW:::svc["Playwright Chrome<br>(Sidecar, Port 3000)"]
    end

    subgraph External["Externe Websites"]
        WEB:::ext["Überwachte<br>Webseiten"]
    end

    USER -->|HTTPS| R1
    R1 --> CD
    CD -->|WebSocket| PW
    PW -->|HTTP/JS| WEB

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Konfiguration

### Storage

Alle Watches, Snapshots und Einstellungen liegen dateibasiert auf NFS unter `/nfs/docker/changedetection/datastore`.

### Playwright Sidecar

Ein Browserless-Chrome-Container (`browserless/chrome:1.53-chrome-stable`) läuft als Nomad Sidecar-Task und stellt über WebSocket (Port 3000) einen headless Browser bereit. Konfigurierte Optimierungen:

- Stealth Mode und Ad-Blocking aktiviert
- Max 10 gleichzeitige Sessions
- Vorgestartete Chrome-Instanz (`PREBOOT_CHROME=true`)
- Auflösung 1920x1080

Der Sidecar benötigt erhebliche Ressourcen (3 GiB Memory, max 6 GiB).

## Abhängigkeiten

- **Traefik** -- HTTPS-Routing und OAuth2 Middleware
- **Keycloak** -- OAuth2-Provider (über `admin-chain-v2`)
- **NFS** -- Datenpersistenz

## Verwandte Seiten

- [Immobilien-Monitoring](../immobilien-monitoring/index.md) -- Nutzt ChangeDetection für Webseiten-Überwachung
- [n8n](../n8n/index.md) -- Workflow-Automation für Benachrichtigungen
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Watches und Snapshots
