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
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  ext: { style: { border-radius: 8; stroke-dash: 4 } }
}

internet: Internet { class: node }
traefik: Traefik { class: node }
plugin: "CrowdSec-Bouncer\n(Traefik-Plugin)" { class: node }
backend: Backend-Service { class: node }
engine: "CrowdSec Engine\n(LAPI)" { class: node }
logs: Traefik Container-Logs {
  class: node
  tooltip: "Docker-Socket Source (stdout des Traefik-Containers)"
}
console: "CrowdSec Console\n(app.crowdsec.net)" { class: ext }

internet -> traefik
traefik -> plugin
plugin -> backend
plugin -> engine: "holt Decisions\n(Stream-Modus)" { style.stroke-dash: 5 }
logs -> engine: "Access-Logs\n(Docker-Socket)" { style.stroke-dash: 5 }
engine <-> console: "Signale /\nCommunity-Blocklists" { style.stroke-dash: 5 }
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
