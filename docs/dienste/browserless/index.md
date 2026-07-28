---
title: Browserless
description: Geteilter Headless-Browser-Dienst für alle Dienste, die eine Seite echt rendern oder bedienen müssen
tags:
  - service
  - nomad
  - infrastructure
  - browser
---

# Browserless

Browserless stellt einen headless Chrome als eigenen Nomad-Job bereit, den mehrere Dienste gemeinsam nutzen. Er rendert JavaScript-lastige Seiten und führt auf Wunsch Puppeteer-Code aus, den der aufrufende Dienst als Text mitschickt. Der Dienst ist rein intern und hat keinen Traefik-Router.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Nomad Job `services/browserless.nomad` |
| Consul DNS | `browserless.service.consul:3300` (`ws://` und `http://`) |
| Exposition | nur intern, kein Traefik-Router |
| Storage | Keine (stateless) |
| Health-Check | Consul-Check auf `/pressure` |

## Rolle im Stack

Browserless ist die gemeinsame Browser-Schicht des Homelabs. Er wurde am 28.07.2026 aus dem ChangeDetection-Job herausgelöst, wo derselbe Container zuvor als Sidecar lief. Auslöser war die Konsolidierungs-Analyse zum Consent-Browser-Fallback des Karakeep-Ingest: mit dem Sidecar-Muster hätte jeder weitere Browser-Konsument eine eigene Chrome-Instanz mitgeschleppt.

Ein geteilter Dienst statt drei Sidecars spart die dreifache Speicher-Reservation und das dreifache Image, und er bündelt die Betriebs-Parameter (Session-Limit, Stealth, Ad-Blocking, Chrome-Refresh) an einer Stelle. Der Preis ist eine gemeinsame Ausfall-Fläche: fällt Browserless aus, verliert ChangeDetection das JavaScript-Rendering und der Karakeep-Ingest seinen Consent-Fallback. Beide Konsumenten sind dafür ausgelegt und arbeiten degradiert weiter, statt in den Crash-Pfad zu laufen.

## Konsumenten

| Dienst | Zugriffsart | Zweck |
|--------|-------------|-------|
| [ChangeDetection.io](../changedetection/) | WebSocket (`PLAYWRIGHT_DRIVER_URL`, `WEBDRIVER_URL`) | JavaScript-Rendering der überwachten Seiten |
| [Karakeep Ingest](../karakeep-ingest/) | REST `POST /function` (`BROWSERLESS_URL`) | Consent-Klick im CMP-iFrame beim Browser-Fallback |
| [Todo Ingest](../todo-ingest/) | geplant | Link-Lese-Fallback |

Beide produktiven Konsumenten sprechen den Dienst über den Consul-Namen an, nicht über eine IP. Job-Parameter (Image, Ressourcen, Session-Limit, Fenstergrösse) stehen im Nomad-Job `services/browserless.nomad`.

::: info Warum ein statischer Port
Der Job belegt Port 3300 statisch, weil die Konsumenten-Container den Dienst über die Pi-hole-Weiterleitung für `*.service.consul` auflösen. Diese Auflösung liefert nur den A-Record, keinen SRV-Record mit dynamischem Port -- gleiches Muster wie bei Authentik und Alloy. Ein dynamischer Port wäre für die Container nicht adressierbar.
:::

::: warning Ausfall bleibt beim Konsumenten unauffällig
Der Consul-Check `/pressure` meldet, wenn der Dienst selbst weg ist. Die Konsumenten melden den Verlust nicht eigenständig: ChangeDetection liefert dann leere oder unvollständige Seiten-Snapshots, und der Karakeep-Ingest überspringt den Consent-Fallback stillschweigend und lässt den Job mit dem regulären Consent-Wall-Fehler enden. Coverage-Stand: [Monitoring Coverage](../../monitoring/coverage/index.md).
:::

## Verwandte Seiten

- [ChangeDetection.io](../changedetection/) -- Konsument für das JavaScript-Rendering
- [Karakeep Ingest](../karakeep-ingest/) -- Konsument für den Consent-Browser-Fallback
- [Ports und Dienste](../../_referenz/ports-und-dienste.md) -- statische Nomad-Ports
- [DNS-Architektur](../../netz/dns/index.md) -- Auflösung von `*.service.consul` in Containern
- [Monitoring Coverage](../../monitoring/coverage/index.md) -- Überwachungs-Ist-Zustand
