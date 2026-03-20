---
title: Gatus
description: Öffentliche Status-Seite und Health-Check-Monitoring für alle Services
tags:
  - service
  - monitoring
  - nomad
  - status-page
---

# Gatus

## Übersicht

| Attribut | Wert |
|:---------|:-----|
| **Status** | Produktion |
| **URL** | [status.ackermannprivat.ch](https://status.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`monitoring/gatus.nomad`) |
| **Storage** | In-Memory (stateless) |
| **Konfiguration** | Nomad Template (eingebettet im Job) |
| **Auth** | Öffentlich via `public-guest-chain-v2` (CrowdSec + OAuth2 Guest) |
| **Port** | 8080 (static) |
| **Priorität** | 100 (kritische Infrastruktur) |

## Architektur

```mermaid
flowchart LR
    subgraph Internet
        User:::entry["Besucher"]
    end

    subgraph Traefik["Traefik (10.0.2.1)"]
        Router:::svc["Router: status.*<br>public-guest-chain-v2"]
    end

    subgraph Nomad["Nomad Cluster"]
        Gatus:::accent["Gatus<br>(Port 8080)"]
        Config:::db["config.yaml<br>(Nomad Template)"]
    end

    subgraph Services["Überwachte Services"]
        S1:::svc["Service A"]
        S2:::svc["Service B"]
        S3:::svc["Service N"]
    end

    User -->|HTTPS| Router
    Router --> Gatus
    Config -.->|template| Gatus
    Gatus -->|HTTP/TCP Checks| S1
    Gatus -->|HTTP/TCP Checks| S2
    Gatus -->|HTTP/TCP Checks| S3

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Zweck

Gatus ist die öffentliche Status-Seite des Homelabs. Es prüft periodisch die Erreichbarkeit und Gesundheit aller konfigurierten Services via HTTP- und TCP-Checks und stellt die Ergebnisse als Dashboard dar.

**Abgrenzung zu anderen Monitoring-Tools:**

- **Gatus** -- Öffentliche Status-Seite, zeigt Verfügbarkeit aus Endnutzer-Sicht
- **Uptime Kuma** -- Internes Monitoring mit Push-Monitoren für Batch Jobs (siehe [Backup-Strategie](../backup/index.md))
- **CheckMK** -- Host-Level Monitoring (CPU, RAM, Disk)
- **Grafana/Loki** -- Metriken und Logs

## Konfiguration

Die gesamte Konfiguration ist als Nomad Template direkt im Job eingebettet (siehe `monitoring/gatus.nomad`). Gatus hat keine NFS-Abhängigkeit und ist vollständig stateless.

::: tip Stateless
Gatus speichert keine Daten persistent. Nach einem Neustart beginnt die Uptime-Historie von vorne. Dies ist bewusst so gewählt, da die Status-Seite den aktuellen Zustand zeigt, nicht die langfristige Historie.
:::

## Entscheidungslog

- **Gatus statt Uptime Kuma als Status-Seite gewählt**, weil Gatus als leichtgewichtige, config-basierte Lösung besser zur Infrastructure-as-Code-Philosophie passt. Uptime Kuma bleibt intern für Push-basiertes Monitoring (Batch Jobs).

## Verwandte Seiten

- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, Uptime Kuma und Alloy
- [CheckMK Monitoring](../checkmk/index.md) -- Host-Level Monitoring
- [Traefik Reverse Proxy](../traefik/index.md) -- Ingress mit public-guest-chain-v2
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking für die öffentliche Status-Seite
