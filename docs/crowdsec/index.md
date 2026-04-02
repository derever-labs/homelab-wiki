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
| Deployment | Docker Compose auf vm-traefik-01/vm-traefik-02 |
| Dashboard | app.crowdsec.net (CrowdSec Console) |
| Datenquelle | Traefik Access Logs |

## Architektur

```mermaid
flowchart LR
    Internet:::ext --> Traefik:::svc
    Traefik --> Plugin:::accent["CrowdSec Bouncer<br/>(Traefik Plugin)"]
    Plugin --> Backend:::svc["Backend Service"]
    Plugin -.-> Engine:::accent["CrowdSec Engine<br/>(LAPI)"]
    Engine -.-> Logs:::db["Traefik Logs<br/>(/var/log/docker/traefik/)"]

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

Das Bouncer-Plugin läuft nativ in Traefik (kein separater Container). Im Stream-Modus werden Entscheidungen periodisch von der Engine abgeholt und gecacht — kein API-Call pro Request.

## Komponenten

### CrowdSec Engine

Analysiert Traefik Access Logs und erkennt Angriffspatterns anhand von Szenarien. Entscheidet über IP-Bans und stellt die lokale API (LAPI) bereit.

| Eigenschaft | Wert |
|-------------|------|
| Image | `crowdsecurity/crowdsec` |
| Log-Pfad | `/var/log/traefik/*` (read-only) |
| Config | `/nfs/docker/crowdsec/config` |
| Daten | `/nfs/docker/crowdsec/data` |

### CrowdSec Bouncer (Traefik Plugin)

Natives Traefik-Plugin, das als Middleware direkt in Traefik läuft. Kein separater Container nötig.

| Eigenschaft | Wert |
|-------------|------|
| Plugin | `maxlerebourg/crowdsec-bouncer-traefik-plugin` v1.4.7 |
| Verbindung | `crowdsec:8080` (LAPI) |
| Modus | Stream (gecachte Entscheidungen, Update alle 15s) |
| API-Key | `/run/secrets/crowdsec_bouncer_key` (Datei-Mount) |

## Collections

Die Engine verwendet folgende Collections zur Angriffserkennung:

| Collection | Beschreibung |
|------------|--------------|
| `crowdsecurity/traefik` | Traefik-spezifische Szenarien (Log-Parsing) |
| `crowdsecurity/http-cve` | Bekannte HTTP-Schwachstellen (CVEs) |
| `crowdsecurity/base-http-scenarios` | Allgemeine HTTP-Angriffe (Brute-Force, Crawling) |
| `crowdsecurity/linux-ssh` | SSH Brute-Force-Erkennung |
| `LePresidente/jellyfin` | Jellyfin-spezifische Szenarien |
| `firix/authentik` | Authentik-spezifische Szenarien |

## Integration mit Traefik Middleware Chains

CrowdSec ist als erste Middleware in allen `public-*` Chains eingebunden. Damit werden alle öffentlich erreichbaren Services geschützt, bevor die Authentik-Authentifizierung greift.

| Chain | Reihenfolge |
|-------|-------------|
| `public-auth` | crowdsec → secure-headers → authentik-forward-auth |
| `public-noauth` | crowdsec → secure-headers |

Details zu den Middleware Chains: [Traefik Middlewares](../traefik/referenz.md)

## CrowdSec Console

Das zentrale Dashboard unter app.crowdsec.net zeigt Statistiken über erkannte Angriffe, gebannte IPs und die aktiven Szenarien. Die lokale Engine synchronisiert sich mit der Console für Community-Blocklists.

## Verwandte Seiten

- [Sicherheit](../security/index.md) — Gesamte Security-Architektur
- [Traefik Middlewares](../traefik/referenz.md) — Middleware Chains mit CrowdSec

---
