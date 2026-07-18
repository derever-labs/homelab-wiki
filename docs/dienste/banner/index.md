---
title: Wartungsbanner
description: Wartungsbanner für Jellyfin über Jellyfins natives Custom-CSS
tags:
  - service
  - jellyfin
  - nomad
---

# Wartungsbanner

::: info Mechanik seit 2026-05-29
Der Banner wird über **Jellyfins natives Custom-CSS** eingebunden, nicht mehr über Traefik `plugin-rewritebody`. Jellyfin importiert per `@import` ein dynamisch aus Pocketbase gerendertes Stylesheet (`banner.ackermannprivat.ch/banner.css`); Pocketbase entscheidet server-seitig, ob und welcher Banner ausgeliefert wird.

Die frühere cross-App-Variante (Traefik-`banner-inject` über alle Apps) wurde abgelöst, weil `plugin-rewritebody` SSE-/Streaming-Responses pufferte und damit Player wie Infuse brach. Der CSS-`@import` umgeht Traefik komplett -- der Browser lädt das Stylesheet direkt.
:::

Ein zentral pflegbarer Wartungs-Banner für die Jellyfin-Web-UI. Gepflegt wird er weiterhin im Pocketbase-Admin-UI mit Master-Schalter, Severity und optionalem Zeitfenster -- nur der Auslieferungsweg in den Browser ist neu.

## Schnellanleitung: Wartungsfenster ankündigen

1. [banner.ackermannprivat.ch/_/](https://banner.ackermannprivat.ch/_/) öffnen, durch Authentik-Login (admin-Gruppe), dann mit Pocketbase-Credentials einloggen (1P-Item `Pocketbase Banner`)
2. Collection `banner_config` -> den einen Record anklicken
3. Felder editieren:
   - `enabled` auf `true` (Master-Schalter)
   - `severity` wählen: `wartung` (orange), `info` (blau), `incident` (rot), `resolved` (grün)
   - `text` mit der Botschaft füllen (einzeilig, siehe [Bekannte Grenzen](#bekannte-grenzen))
   - Optional `start_at` und `end_at` setzen, dann erscheint und verschwindet der Banner automatisch
4. Save

Der Banner erscheint beim nächsten Page-Reload in der Jellyfin-Web-UI ([watch.ackermannprivat.ch](https://watch.ackermannprivat.ch)). Zum Ausschalten `enabled` auf `false` setzen.

Detail-Runbook und Edge-Cases siehe [Betrieb](./betrieb.md).

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [banner.ackermannprivat.ch](https://banner.ackermannprivat.ch) |
| Admin-UI | [banner.ackermannprivat.ch/_/](https://banner.ackermannprivat.ch/_/) (Pocketbase eigene Auth) |
| Public-Endpoints | `/banner.css` (`@import`), `/banner.js` (Legacy), `/api/health` -- über `public-noauth` Chain |
| Konsumenten | Jellyfin Custom-CSS (Dashboard -> Allgemein) **+** Authentik Brand Custom-CSS (Login-Seite) |
| Storage | Linstor CSI `banner-pb-data` (SQLite, autoPlace=2) |
| Deployment | Nomad Job `services/pocketbase.nomad` |
| Image | `ghcr.io/muchobien/pocketbase` |
| Auth Admin-UI | Pocketbase Email/Passwort (1P: `Pocketbase Banner`); Admin-Router hinter Authentik (`intern-auth`) |

## Rolle im Stack

Anders als die alte, Traefik-weite Lösung wird der Banner jetzt gezielt über die nativen Custom-CSS-Felder zweier Dienste eingebunden: **Jellyfin** (Web-UI) und **Authentik** (Login-Seite, deckt den Login zu allen Authentik-vorgelagerten Apps ab). Beide Felder enthalten dauerhaft nur eine `@import`-Zeile auf `banner.css`; die gesamte Dynamik (an/aus, Severity, Text, Zeitfenster) lebt server-seitig in Pocketbase. So muss an den Feldern nie wieder etwas geändert werden.

Der `@import` steht **nach** dem bestehenden Theme-Import (Ultrachromic), damit die Banner-Regeln im Cascade gewinnen; die Layout-Verschiebung nutzt zusätzlich `!important`. Beide koexistieren konfliktfrei -- Ultrachromic belegt weder `body::before` noch verschiebt es `.skinHeader`.

## Architektur

```d2
shape: sequence_diagram

B: "Browser\n(Jellyfin-Web)"
JF: "Jellyfin\nwatch.ackermannprivat.ch"
PB: "Pocketbase\nbanner.ackermannprivat.ch"
DB: "SQLite\n(Linstor CSI)"

B -> JF: "Web-UI laden,\nBranding CustomCss lesen"
JF -> B: "@import url(banner.css)"
B -> PB: "GET /banner.css\n(cross-origin)"
PB -> DB: "SELECT banner_config"
DB -> PB: "enabled, severity,\ntext, Zeitfenster"
PB -> B: "CSS: Banner-Regeln\noder leer"
B -> B: "body::before rendern\n(fixed top, z-index 1000)"
```

## Banner-Steuerung

Gepflegt wird der Banner über genau einen Record der Collection `banner_config` im Pocketbase-Admin-UI. Die Aktivierungs-Logik läuft server-seitig im Pocketbase-Hook. Die vollständige Feld-Referenz (`enabled`, `severity`, `text`, `start_at`, `end_at`) und die Aktivierungslogik-Formel stehen im Betrieb unter [banner_config-Felder](./betrieb.md#banner-config-felder).

## CSS-Mechanik

`/banner.css` rendert ein `body::before` (fixed, oberer Rand, Höhe 40px, `z-index` 1000) mit dem Text via CSS-`content` und der Severity-Farbe. Damit der Banner nichts verdeckt, schiebt das Stylesheet die drei top-gepinnten Jellyfin-Container um die Bannerhöhe nach unten: `.skinHeader`, `.skinBody` und `.mainDrawer`. Diese Selektoren sind gegen den React-Web-Client von **Jellyfin 10.11** verifiziert (das ältere `mainAnimatedPages` gibt es nicht mehr).

Severity-Farben sind identisch zur Legacy-`/banner.js`-Variante. Quelle des Render-Hooks: [`services/pocketbase.nomad`](https://github.com/derever-labs/homelab-nomad-jobs/blob/main/services/pocketbase.nomad) (`routerAdd("GET", "/banner.css", ...)`).

## Bekannte Grenzen

::: warning Nur Web-UIs im Browser
Der Banner zeigt sich in der Jellyfin-Web-UI und auf der Authentik-Login-Seite (dort via Brand-CSS auch in `/if/user/` und `/if/admin/`). Native Clients (Infuse, Android-TV-App) ignorieren Server-CSS. Apps, die über Authentik einloggen, zeigen den Banner damit beim Login -- in der App selbst aber nur Jellyfin. Die frühere Traefik-weite cross-App-Reichweite ist mit dem Wegfall von `banner-inject` weg.
:::

::: tip Einzeiliger Text
Weil die Layout-Offsets auf eine feste Bannerhöhe (40px) ausgelegt sind, wird der Text einzeilig dargestellt (längerer Text wird mit Ellipsis abgeschnitten). Botschaft kurz halten.
:::

::: info Content-Security-Policy
Weder Traefik (`secure-headers`) noch Jellyfin setzen `default-src`/`style-src` -- der cross-origin CSS-`@import` von `banner.ackermannprivat.ch` wird daher nicht blockiert. Ist Pocketbase nicht erreichbar, fällt der `@import` still aus (kein Banner), die Jellyfin-UI bleibt unbeeinträchtigt.
:::
