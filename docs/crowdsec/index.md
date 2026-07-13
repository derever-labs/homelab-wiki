---
title: CrowdSec
description: Intrusion Detection und IP-Blocking für Traefik
tags:
  - platform
  - security
  - crowdsec
---

# CrowdSec

CrowdSec ist ein kollaboratives Intrusion-Detection-System, das Traefik Access Logs analysiert und bösartige IPs via Bouncer-Plugin in Traefik blockiert.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Docker Compose auf vm-traefik-01/vm-traefik-02 (zusammen mit Traefik) |
| Datenquelle | Traefik Access Logs |

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}
direction: right

classes: {
  node: { style.border-radius: 8 }
}

Internet: Internet { class: node }
Traefik: Traefik { class: node }
Plugin: CrowdSec Bouncer (Traefik Plugin) { class: node }
Backend: Backend Service { class: node }
Engine: CrowdSec Engine (LAPI) { class: node }
Logs: Traefik Container-Logs { class: node; tooltip: "Docker-Socket Source (stdout des Traefik-Containers)" }

Internet -> Traefik
Traefik -> Plugin
Plugin -> Backend
Plugin -> Engine: { style.stroke-dash: 5 }
Engine -> Logs: { style.stroke-dash: 5 }
```

Das Bouncer-Plugin läuft nativ in Traefik (kein separater Container). Im Stream-Modus werden Entscheidungen periodisch von der Engine abgeholt und gecacht -- kein API-Call pro Request. Die Engine synchronisiert sich mit der CrowdSec Console ([app.crowdsec.net](https://app.crowdsec.net)) für Community-Blocklists.

## Komponenten

### CrowdSec Engine

Analysiert Traefik Access Logs und erkennt Angriffspatterns anhand von Szenarien. Entscheidet über IP-Bans und stellt die lokale API (LAPI) bereit.

### CrowdSec Bouncer (Traefik Plugin)

Natives Traefik-Plugin, das als Middleware direkt in Traefik läuft.

Engine- und Bouncer-Parameter, verwendete Collections und lokale Whitelists: [CrowdSec Referenz](./referenz.md).

## Integration mit Traefik Middleware Chains

CrowdSec ist als erste Middleware in allen `public-*` Chains eingebunden. Damit werden alle öffentlich erreichbaren Services geschützt, bevor die Authentik-Authentifizierung greift. Die genaue Reihenfolge der Chains ist in [Traefik Middlewares](../traefik/referenz.md) dokumentiert.

## Verwandte Seiten

- [CrowdSec Referenz](./referenz.md) -- Engine-/Bouncer-Parameter, Collections, Whitelists
- [Sicherheit](../security/index.md) -- Gesamte Security-Architektur
- [Traefik Middlewares](../traefik/referenz.md) -- Middleware Chains mit CrowdSec
- [Authentik](../authentik/index.md) -- Ergänzende Schutzschicht (Reputation Policy)
