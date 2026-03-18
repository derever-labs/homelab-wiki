---
title: CrowdSec
description: Intrusion Detection und IP-Blocking fuer Traefik
tags:
  - platform
  - security
  - crowdsec
---

# CrowdSec

## Übersicht

| Eigenschaft | Wert |
|-------------|------|
| Status | Aktiv |
| Deployment | Docker Compose auf vm-proxy-dns-01 |
| Dashboard | app.crowdsec.net (CrowdSec Console) |
| Datenquelle | Traefik Access Logs |

## Architektur

```mermaid
flowchart LR
    Internet:::ext --> Traefik:::svc
    Traefik --> Bouncer:::accent["CrowdSec Bouncer<br/>(ForwardAuth)"]
    Bouncer --> Backend:::svc["Backend Service"]
    Bouncer -.-> Engine:::accent["CrowdSec Engine<br/>(LAPI)"]
    Engine -.-> Logs:::db["Traefik Logs<br/>(/var/log/docker/traefik/)"]

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

Der Bouncer prüft eingehende Requests gegen die Engine. Wird eine IP als böswillig erkannt, blockiert der Bouncer den Zugriff bevor der Request das Backend erreicht.

## Komponenten

### CrowdSec Engine

Analysiert Traefik Access Logs und erkennt Angriffspatterns anhand von Szenarien. Entscheidet über IP-Bans und stellt die lokale API (LAPI) bereit.

| Eigenschaft | Wert |
|-------------|------|
| Image | `crowdsecurity/crowdsec` |
| Log-Pfad | `/var/log/traefik/*` (read-only) |
| Config | `/nfs/docker/crowdsec/config` |
| Daten | `/nfs/docker/crowdsec/data` |

### CrowdSec Bouncer

ForwardAuth-Middleware in Traefik. Prüft bei jedem Request, ob die Quell-IP von der Engine gebannt wurde.

| Eigenschaft | Wert |
|-------------|------|
| Image | `fbonalair/traefik-crowdsec-bouncer` |
| Verbindung | `crowdsec:8080` (LAPI) |
| Modus | ForwardAuth |

## Collections

Die Engine verwendet folgende Collections zur Angriffserkennung:

| Collection | Beschreibung |
|------------|--------------|
| `crowdsecurity/traefik` | Traefik-spezifische Szenarien (Log-Parsing) |
| `crowdsecurity/http-cve` | Bekannte HTTP-Schwachstellen (CVEs) |
| `crowdsecurity/base-http-scenarios` | Allgemeine HTTP-Angriffe (Brute-Force, Crawling) |

## Integration mit Traefik Middleware Chains

CrowdSec ist als erste Middleware in allen `public-*-chain-v2` Chains eingebunden. Damit werden alle öffentlich erreichbaren Services geschützt, bevor die OAuth2-Authentifizierung greift.

| Chain | Reihenfolge |
|-------|-------------|
| `public-guest-chain-v2` | crowdsec → oauth2-errors → require-guest |
| `public-admin-chain-v2` | crowdsec → oauth2-errors → require-admin |
| `public-family-chain-v2` | crowdsec → oauth2-errors → require-family |

Details zu den Middleware Chains: [Traefik Middlewares](traefik-middlewares.md)

## CrowdSec Console

Das zentrale Dashboard unter app.crowdsec.net zeigt Statistiken über erkannte Angriffe, gebannte IPs und die aktiven Szenarien. Die lokale Engine synchronisiert sich mit der Console für Community-Blocklists.

## Verwandte Seiten

- [Sicherheit](security.md) — Gesamte Security-Architektur
- [Traefik Middlewares](traefik-middlewares.md) — Middleware Chains mit CrowdSec

---
