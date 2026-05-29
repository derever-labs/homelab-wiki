---
title: Wartungsbanner
description: Wartungsbanner fuer Jellyfin ueber Jellyfins natives Custom-CSS
tags:
  - service
  - jellyfin
  - nomad
---

# Wartungsbanner

::: info Mechanik seit 2026-05-29
Der Banner wird ueber **Jellyfins natives Custom-CSS** eingebunden, nicht mehr ueber Traefik `plugin-rewritebody`. Jellyfin importiert per `@import` ein dynamisch aus Pocketbase gerendertes Stylesheet (`banner.ackermannprivat.ch/banner.css`); Pocketbase entscheidet server-seitig, ob und welcher Banner ausgeliefert wird.

Die fruehere cross-App-Variante (Traefik-`banner-inject` ueber alle Apps) wurde abgeloest, weil `plugin-rewritebody` SSE-/Streaming-Responses pufferte und damit Player wie Infuse brach. Der CSS-`@import` umgeht Traefik komplett -- der Browser laedt das Stylesheet direkt.
:::

Ein zentral pflegbarer Wartungs-Banner fuer die Jellyfin-Web-UI. Gepflegt wird er weiterhin im Pocketbase-Admin-UI mit Master-Schalter, Severity und optionalem Zeitfenster -- nur der Auslieferungsweg in den Browser ist neu.

## Schnellanleitung: Wartungsfenster ankuendigen

1. [banner.ackermannprivat.ch/_/](https://banner.ackermannprivat.ch/_/) oeffnen, durch Authentik-Login (admin-Gruppe), dann mit Pocketbase-Credentials einloggen (1P-Item `Pocketbase Banner`)
2. Collection `banner_config` -> den einen Record anklicken
3. Felder editieren:
   - `enabled` auf `true` (Master-Schalter)
   - `severity` waehlen: `wartung` (orange), `info` (blau), `incident` (rot), `resolved` (gruen)
   - `text` mit der Botschaft fuellen (einzeilig, siehe [Bekannte Grenzen](#bekannte-grenzen))
   - Optional `start_at` und `end_at` setzen, dann erscheint und verschwindet der Banner automatisch
4. Save

Der Banner erscheint beim naechsten Page-Reload in der Jellyfin-Web-UI ([watch.ackermannprivat.ch](https://watch.ackermannprivat.ch)). Zum Ausschalten `enabled` auf `false` setzen.

Detail-Runbook und Edge-Cases siehe [Betrieb](betrieb.md).

## Uebersicht

| Attribut | Wert |
|----------|------|
| URL | [banner.ackermannprivat.ch](https://banner.ackermannprivat.ch) |
| Admin-UI | [banner.ackermannprivat.ch/_/](https://banner.ackermannprivat.ch/_/) (Pocketbase eigene Auth) |
| Public-Endpoints | `/banner.css` (`@import`), `/banner.js` (Legacy), `/api/health` -- ueber `public-noauth` Chain |
| Konsumenten | Jellyfin Custom-CSS (Dashboard -> Allgemein) **+** Authentik Brand Custom-CSS (Login-Seite) |
| Storage | Linstor CSI `banner-pb-data` (SQLite, autoPlace=2) |
| Deployment | Nomad Job `services/pocketbase.nomad` |
| Image | `ghcr.io/muchobien/pocketbase` |
| Auth Admin-UI | Pocketbase Email/Passwort (1P: `Pocketbase Banner`); Admin-Router hinter Authentik (`intern-auth`) |

## Rolle im Stack

Anders als die alte, Traefik-weite Loesung wird der Banner jetzt gezielt ueber die nativen Custom-CSS-Felder zweier Dienste eingebunden: **Jellyfin** (Web-UI) und **Authentik** (Login-Seite, deckt den Login zu allen Authentik-vorgelagerten Apps ab). Beide Felder enthalten dauerhaft nur eine `@import`-Zeile auf `banner.css`; die gesamte Dynamik (an/aus, Severity, Text, Zeitfenster) lebt server-seitig in Pocketbase. So muss an den Feldern nie wieder etwas geaendert werden.

Der `@import` steht **nach** dem bestehenden Theme-Import (Ultrachromic), damit die Banner-Regeln im Cascade gewinnen; die Layout-Verschiebung nutzt zusaetzlich `!important`. Beide koexistieren konfliktfrei -- Ultrachromic belegt weder `body::before` noch verschiebt es `.skinHeader`.

## Architektur

```d2
direction: right

Browser: User Browser {
  style.stroke-dash: 4
  page: "Jellyfin-Web (HTML + Custom-CSS @import)" { style.border-radius: 8 }
  banner_dom: "body::before (fixed top, z-index 1000)" { style.border-radius: 8 }
}

JF: "Jellyfin (watch.ackermannprivat.ch)" {
  style.stroke-dash: 4
  branding: "Branding CustomCss: @import banner.css" { style.border-radius: 8 }
}

PB: "Pocketbase (banner.ackermannprivat.ch)" {
  style.stroke-dash: 4
  css: "GET /banner.css (server-seitig gerendert)" { style.border-radius: 8 }
  ui: "Admin-UI /_/ (Pflege)" { style.border-radius: 8 }
  db: "SQLite (Linstor CSI)" { style.border-radius: 8 }
}

Browser.page -> JF.branding: "1. Web-UI laedt, liest CustomCss"
JF.branding -> Browser.page: "2. @import url(banner.css)"
Browser.page -> PB.css: "3. GET /banner.css (cross-origin)"
PB.css -> PB.db: "4. SELECT banner_config"
PB.db -> PB.css: "5. enabled, severity, text, Zeitfenster"
PB.css -> Browser.page: "6. CSS (Banner-Regeln oder leer)"
Browser.page -> Browser.banner_dom: "7. body::before rendern"

PB.ui -> PB.db: "Pflege-Workflow"
```

## Banner-Steuerung

Collection `banner_config` mit genau einem Record. Die Aktivierungs-Logik laeuft komplett server-seitig im Pocketbase-Hook: ist der Banner aus oder ausserhalb des Zeitfensters, liefert `/banner.css` ein leeres Stylesheet (`/* maintenance banner: off */`), sonst die Banner-Regeln.

| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `severity` | select | Farb-Preset (`wartung` orange, `info` blau, `incident` rot, `resolved` gruen). Default `wartung` |
| `enabled` | bool | Master-Schalter. `false` = Banner aus |
| `text` | string | Anzeigetext, einzeilig, max 500 Zeichen |
| `start_at` | datetime | Optional. Wenn gesetzt: Banner erscheint erst ab diesem Zeitpunkt |
| `end_at` | datetime | Optional. Wenn gesetzt: Banner verschwindet automatisch nach diesem Zeitpunkt |

Aktivierungslogik: `enabled && (start_at unset oder now >= start_at) && (end_at unset oder now <= end_at)`.

## CSS-Mechanik

`/banner.css` rendert ein `body::before` (fixed, oberer Rand, Hoehe 40px, `z-index` 1000) mit dem Text via CSS-`content` und der Severity-Farbe. Damit der Banner nichts verdeckt, schiebt das Stylesheet die drei top-gepinnten Jellyfin-Container um die Bannerhoehe nach unten: `.skinHeader`, `.skinBody` und `.mainDrawer`. Diese Selektoren sind gegen den React-Web-Client von **Jellyfin 10.11** verifiziert (das aeltere `mainAnimatedPages` gibt es nicht mehr).

Severity-Farben sind identisch zur Legacy-`/banner.js`-Variante. Quelle des Render-Hooks: [`services/pocketbase.nomad`](https://github.com/derever-labs/homelab-nomad-jobs/blob/main/services/pocketbase.nomad) (`routerAdd("GET", "/banner.css", ...)`).

## Bekannte Grenzen

::: warning Nur Web-UIs im Browser
Der Banner zeigt sich in der Jellyfin-Web-UI und auf der Authentik-Login-Seite (dort via Brand-CSS auch in `/if/user/` und `/if/admin/`). Native Clients (Infuse, Android-TV-App) ignorieren Server-CSS. Apps, die ueber Authentik einloggen, zeigen den Banner damit beim Login -- in der App selbst aber nur Jellyfin. Die fruehere Traefik-weite cross-App-Reichweite ist mit dem Wegfall von `banner-inject` weg.
:::

::: tip Einzeiliger Text
Weil die Layout-Offsets auf eine feste Bannerhoehe (40px) ausgelegt sind, wird der Text einzeilig dargestellt (laengerer Text wird mit Ellipsis abgeschnitten). Botschaft kurz halten.
:::

::: info Content-Security-Policy
Weder Traefik (`secure-headers`) noch Jellyfin setzen `default-src`/`style-src` -- der cross-origin CSS-`@import` von `banner.ackermannprivat.ch` wird daher nicht blockiert. Ist Pocketbase nicht erreichbar, faellt der `@import` still aus (kein Banner), die Jellyfin-UI bleibt unbeeintraechtigt.
:::
