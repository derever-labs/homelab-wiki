---
title: Keep Mobile
description: Mobile Incident-PWA fuer Keep -- React-SPA + Hono-BFF hinter Authentik
tags:
  - service
  - monitoring
  - keep
  - nomad
  - react
---

# Keep Mobile

Keep Mobile (`keep-mobile`) ist eine schlanke, mobile-first Progressive Web App fuer die Incident-Ansicht aus [Keep](keep.md). Sie zeigt offene Incidents, erlaubt das Quittieren (Acknowledge) und Aufloesen (Resolve) unterwegs und blendet pro Uptime-Kuma-Alert den Live-Status ein. Sie ist der erste produktive Pilot des [Homelab-App-Standards](../app-standard/).

## Uebersicht

| Attribut | Wert |
|----------|------|
| URL | [m.keep.ackermannprivat.ch](https://m.keep.ackermannprivat.ch) |
| App-Repository | `derever-labs/keep-mobile` (React-SPA + Hono-BFF) |
| Deploy-Repository | `derever-labs/homelab-nomad-jobs`, Job `monitoring/keep-mobile.nomad` |
| Architektur | React-SPA (Vite + Tailwind) + Hono-BFF in einem Container |
| Erreichbarkeit | Oeffentlich -- ohne VPN/Tailscale, hinter Authentik + CrowdSec |
| Auth | Extern: `public-auth@file` (Authentik + CrowdSec). Intern (ClientIP): `intern-auth@file`. `/api/health`: `keep-mobile-health` (`intern-noauth`, nur intern). Authentik-Zugang auf Gruppe `admin` gebunden |
| Secrets | `kv/data/keep-mobile` (Keep-API-Key, Kuma-API-Key) |
| Monitoring | Uptime-Kuma HTTP-Monitor 86 auf `/api/health` -- siehe [Coverage](coverage.md) |

## Rolle im Stack

Keep ist der zentrale Incident-Hub; seine eigene Web-UI (`keep.ackermannprivat.ch`) ist auf den Desktop ausgelegt. Keep Mobile ergaenzt sie um eine fokussierte mobile Sicht: nur die wenigen Handgriffe, die unterwegs zaehlen (Incident lesen, Acknowledge, Resolve). Es ist eine **sekundaere** UI -- der eigentliche Alert-Pfad (Keep, Telegram) funktioniert unabhaengig von ihr weiter.

Der Hono-BFF haelt den Keep-API-Key serverseitig und proxyt die Keep-REST-API intern ueber Consul. Der Browser sieht den Key nie und spricht ausschliesslich mit dem BFF auf demselben Origin.

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: right

browser: Mobile-Browser { class: node }
traefik: "Traefik\n(Authentik ForwardAuth)" { class: node }

cluster: Nomad-Cluster {
  class: container
  bff: "keep-mobile\nHono-BFF + React-SPA" { class: node }
  keep: "keep-backend\n(Consul, intern)" { class: node }
  kuma: "Uptime-Kuma" { class: node }
}

browser -> traefik: "HTTPS m.keep.*"
traefik -> bff: "UI + /api/* (auth)"
bff -> keep: "Keep-API\n(API-Key serverseitig)"
bff -> kuma: "Status-Page\n(Inline-Status + Verlauf)"
kuma -> traefik: "/api/health\n(Self-Monitor, no-auth)"
```

## Auth-Muster

Keep Mobile folgt dem [Auth-Standard fuer SPAs hinter Authentik](../app-standard/): das zentrale Authentik-ForwardAuth bleibt die Auth-Grenze, die App betreibt **kein** eigenes OIDC. Bei Ablauf der Session faengt die SPA den Redirect transparent ab (ein einmaliger, guarded Top-Level-Reload; bei Blockade ein App-weites "Session abgelaufen"-Overlay). Es ist bewusst **kein** Service Worker im Einsatz -- fuer eine auth-gated Live-Alerting-App ohne Offline-Nutzen war er reiner Ballast und Ursache mehrerer Auth-Sackgassen.

Damit die App auch unterwegs ohne VPN nutzbar ist, ist m.keep oeffentlich erreichbar -- nach dem Doppel-Router-Muster von `immo-monitor`: Der Catch-all-Router laeuft ueber `public-auth@file` (CrowdSec + Authentik), ein zweiter Router `keep-mobile-internal` faengt interne Quell-IPs (`ClientIP`-Allowlist) ab und laesst sie ohne CrowdSec ueber `intern-auth@file` -- das vermeidet, dass ein interner Fehler die eigene IP bannt. Die einzige Zugangsschicht ist damit Authentik (plus CrowdSec extern); der Provider ist auf die Gruppe `admin` gebunden, sodass nur Administratoren nach Login hineinkommen.

Damit der externe Uptime-Kuma-Monitor den Liveness-Endpoint pruefen kann, ohne den Authentik-302 zu kassieren, bedient ein zweiter Traefik-Router `keep-mobile-health` ausschliesslich `Path(/api/health)` ueber die `intern-noauth`-Chain (interne IP-Allowlist, kein Authentik). Der Endpoint ist dependency-frei und liefert nur `{status:"ok"}`. Alle anderen Pfade -- inklusive der uebrigen `/api/*` -- bleiben hinter Authentik. Muster wie `uptime-kuma-push` und `grafana-api`.

## Uptime-Kuma-Integration

Die Verbindung zu [Uptime-Kuma](../uptime-kuma/) besteht in zwei Richtungen:

- **Inline-Status (App liest Kuma):** Traegt ein Incident einen Uptime-Kuma-Alert, blendet die Detail-Ansicht eine Heartbeat-Leiste (gruen/gelb/rot pro Check, wie in Kuma), den aktuellen Status, die 24h-Uptime und die Antwortzeit sowie einen Deep-Link ins Kuma-Dashboard ein. Primaerquelle ist der **unauthentifizierte Status-Page-Heartbeat-Endpoint** (`/api/status-page/heartbeat/keep-mobile`, intern via Consul). Die dedizierte Status-Page `keep-mobile` enthaelt per API **alle** Monitore -- so hat jeder Kuma-Incident den Verlauf, nicht nur die der kuratierten `homelab`-Page (dort fehlten einzelne, z.B. Linstor GUI). Ein Request liefert Verlauf + Uptime ohne Kuma-Login im Browser. Fallback fuer Monitore ausserhalb der Page ist `/metrics` (HTTP-Basic, leerer User + API-Key).
- **Deep-Link:** Da Kuma hinter dem Authentik-Outpost laeuft und sein Eigen-Login deaktiviert ist ([Uptime-Kuma](../uptime-kuma/)), oeffnet der Link `…/dashboard/<monitor-id>` das Monitor-Dashboard nahtlos (nur Authentik admin-only davor).
- **Self-Monitoring (Kuma prueft die App):** Der HTTP-Monitor 86 prueft `m.keep.ackermannprivat.ch/api/health` im 60-Sekunden-Takt. Bei Ausfall alarmiert er ueber die Keep-Notification nach Telegram.

## Deploy

Keep Mobile wird nach dem [Homelab-App-Standard](../app-standard/) ausgeliefert: ein Commit ins App-Repo baut das Image und oeffnet einen SHA-Bump-PR auf `homelab-nomad-jobs`; der Merge startet den Nomad-Deploy mit Health-Gate und `auto_revert`. Job-Details und Traefik-Tags stehen in `monitoring/keep-mobile.nomad`.

## Verwandte Dokumentation

- [Keep](keep.md) -- Incident-Hub und Alert-Routing
- [Homelab-App-Standard](../app-standard/) -- Build-/Deploy-Pattern und Auth-Muster
- [Uptime-Kuma](../uptime-kuma/) -- Monitoring-Backend
- [Coverage](coverage.md) -- Monitoring-Abdeckung (Layer 8)
