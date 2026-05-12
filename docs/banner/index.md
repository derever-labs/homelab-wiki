---
title: Wartungsbanner
description: Cross-Site Wartungsbanner ueber alle Apps hinter Traefik
tags:
  - service
  - traefik
  - infrastruktur
  - nomad
---

# Wartungsbanner

Ein zentral pflegbarer Banner der ueber alle Apps hinter Traefik eingeblendet werden kann, ohne jede App einzeln anfassen zu muessen. Pflege erfolgt ueber das Pocketbase-Admin-UI mit Master-Schalter und optionalem Zeitfenster.

## Uebersicht

| Attribut | Wert |
|----------|------|
| URL | [banner.ackermannprivat.ch](https://banner.ackermannprivat.ch) |
| Admin-UI | [banner.ackermannprivat.ch/_/](https://banner.ackermannprivat.ch/_/) (Pocketbase eigene Auth) |
| Public-Endpoint | `/banner.js` (dynamisch aus aktueller Config gerendert) |
| Storage | Linstor CSI `pocketbase-data` (SQLite) |
| Deployment | Nomad Job `services/pocketbase.nomad` |
| Image | `ghcr.io/muchobien/pocketbase` (Direct-Pull, kein ZOT-Mirror) |
| Traefik-Plugin | `traefik/plugin-rewritebody v0.3.1` |
| Auth Admin-UI | Pocketbase Email/Passwort (Credentials in 1P: `Pocketbase Banner`) |

## Rolle im Stack

Das Banner-System loest das Problem dass eine einheitliche Wartungs-Meldung ueber alle hinter Traefik laufenden Apps benoetigt wird, ohne jede App eigenen Code aenden zu muessen. Apps wissen nichts vom Banner -- Traefik injiziert ein einziges Script-Tag in jede HTML-Antwort, das Script holt die aktuelle Banner-Config und rendert ein DOM-Element. Pflege erfolgt zentral in Pocketbase.

Banner ist optional pro Domain: Routen die das Banner zeigen sollen verwenden eine der `*-with-banner` Middleware-Chains. Routen ohne diese Chain sehen kein Banner.

## Architektur

```d2
direction: right

Browser: User Browser {
  style.stroke-dash: 4
  page: "App-Seite (HTML mit injiziertem Script-Tag)" { style.border-radius: 8 }
  banner_dom: "Banner-DOM (z-index max, fixed top)" { style.border-radius: 8 }
}

Traefik: "Traefik HA (10.0.2.20)" {
  style.stroke-dash: 4
  plugin: "plugin-rewritebody (injiziert <script src>)" { style.border-radius: 8 }
  chain: "intern-auth-with-banner / public-{auth,noauth}-with-banner Chains" { style.border-radius: 8 }
}

Apps: "Beliebige App hinter Traefik" {
  style.stroke-dash: 4
  flame: flame-intra { style.border-radius: 8 }
  jellyfin: "Jellyfin (watch)" { style.border-radius: 8 }
  jellyseerr: "Jellyseerr (wish)" { style.border-radius: 8 }
}

PB: "Pocketbase (banner.ackermannprivat.ch)" {
  style.stroke-dash: 4
  hook: "JS-Hook /banner.js" { style.border-radius: 8 }
  ui: "Admin-UI /_/ (Pflege)" { style.border-radius: 8 }
  db: "SQLite (Linstor CSI)" { style.border-radius: 8 }
}

Browser.page -> Traefik.chain: "1. HTML-Request"
Traefik.chain -> Apps.flame: "2. Forward zur App"
Apps.flame -> Traefik.chain: "3. HTML-Response"
Traefik.chain -> Traefik.plugin: "4. Body-Rewrite vor </head>"
Traefik.plugin -> Browser.page: "5. HTML + <script src=banner.js>"
Browser.page -> PB.hook: "6. GET /banner.js (cross-origin)"
PB.hook -> PB.db: "7. SELECT banner_config"
PB.db -> PB.hook: "8. enabled, text, Zeitfenster"
PB.hook -> Browser.page: "9. JS mit Config + Inject-Logik"
Browser.page -> Browser.banner_dom: "10. DOM-Element rendern"

Apps.jellyfin -> Traefik.chain
Apps.jellyseerr -> Traefik.chain

PB.ui -> PB.db: "Pflege-Workflow"
```

## Banner-Steuerung

Das Banner wird ueber das Pocketbase-Admin-UI verwaltet. Single-Record-Collection `banner_config` mit folgenden Feldern:

| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `enabled` | bool | Master-Schalter. `false` = Banner aus, unabhaengig von den Zeit-Feldern |
| `text` | string | Anzeigetext, max 500 Zeichen |
| `bg_color` | string | Hintergrundfarbe (Default `#ff9900`) |
| `fg_color` | string | Textfarbe (Default `#000000`) |
| `start_at` | datetime | Optional. Wenn gesetzt: Banner erscheint erst ab diesem Zeitpunkt |
| `end_at` | datetime | Optional. Wenn gesetzt: Banner verschwindet automatisch nach diesem Zeitpunkt |

Aktivierungslogik im Client-JS: `enabled && (start_at unset oder now >= start_at) && (end_at unset oder now <= end_at)`.

## Banner-faehige Routen

Drei spezialisierte Middleware-Chains aktivieren das Banner pro Route (Quelle: [`traefik-proxy/configurations/middleware-chains.yml`](https://github.com/derever-labs/infra/blob/main/homelab-hashicorp-stack/standalone-stacks/traefik-proxy/configurations/middleware-chains.yml)):

- `intern-auth-with-banner` -- wie `intern-auth`, plus `force-identity-encoding` und `banner-inject`. Fuer interne Apps mit Authentik-Auth.
- `public-auth-with-banner` -- wie `public-auth`, plus die beiden Banner-Middlewares. Fuer extern verfuegbare Apps mit Authentik.
- `public-noauth-with-banner` -- wie `public-noauth`. Fuer extern verfuegbare Apps ohne Authentik (z.B. Jellyfin mit eigener Auth).

Eine Route bekommt das Banner indem ihr Traefik-Tag `traefik.http.routers.<name>.middlewares` auf eine dieser Chains zeigt.

## force-identity-encoding (technische Notwendigkeit)

`traefik/plugin-rewritebody v0.3.x` kennt keine Decompression. Backends die HTML komprimiert ausliefern (Jellyfin sendet brotli, viele Java/Spring-Apps gzip) werden ohne Body-Rewrite weitergeleitet -- das Banner waere unsichtbar.

Loesung: Eine Headers-Middleware setzt vor `banner-inject` den Request-Header `Accept-Encoding: identity` -- das Backend antwortet dann unkomprimiert, der Regex-Replace greift, der Browser empfaengt unkomprimierte HTML (vernachlaessigbar bei HTML-Shell-Files).

Diese Middleware ist Teil aller `*-with-banner` Chains. Bei stark komprimierungs-abhaengigen Routen mit grossen HTML-Bodies waere sie ein Performance-Tradeoff -- bei den aktuellen Routen vernachlaessigbar.

## Bekannte Grenzen

::: warning Content-Security-Policy
Apps mit strikter `Content-Security-Policy` (`script-src 'self'`) blockieren das externe Banner-Script im Browser. Aktuelle Apps mit `secure-headers`-Chain sind nicht betroffen (kein `script-src` gesetzt). Bei zukuenftigen Apps mit eigener strenger CSP muss Traefik einen Headers-Override pro Domain bereitstellen.
:::

::: warning Streaming-Endpoints
`plugin-rewritebody` buffert die gesamte Response im Speicher. Routen mit grossen Downloads oder SSE-Streams sollten die `*-with-banner` Chains NICHT verwenden. Standardmaessig keine bekannten Routen mit diesem Profil im Stack.
:::

::: tip Browser-Cache
Banner-Aenderungen kommen erst beim naechsten Page-Load durch (nicht live auf bereits geladenen Seiten). Hard-Reload (Cmd+Shift+R) wenn man Aenderungen sofort sehen will. Der `banner.js`-Endpoint sendet `Cache-Control: no-cache, must-revalidate`, das HTML der App selbst kann anders gecacht sein.
:::
