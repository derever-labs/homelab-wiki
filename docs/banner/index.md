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

## Schnellanleitung: Wartungsfenster ankuendigen

1. [banner.ackermannprivat.ch/_/](https://banner.ackermannprivat.ch/_/) oeffnen, durch Authentik-Login (admin-Gruppe), dann mit Pocketbase-Credentials einloggen (1P-Item `Pocketbase Banner`)
2. Collection `banner_config` -> den einen Record anklicken (Homelab hat im Gegensatz zum DCLab keine intern/extern-Trennung)
3. Felder editieren:
   - `enabled` auf `true` (das ist der Master-Schalter)
   - `severity` waehlen: `wartung` (orange), `info` (blau), `incident` (rot), `resolved` (gruen)
   - `text` mit der Botschaft fuellen
   - Optional `start_at` und `end_at` setzen, dann erscheint und verschwindet das Banner automatisch
4. Save

Der Banner erscheint beim naechsten Page-Reload auf allen Apps mit `*-with-banner` Chain. Zum Ausschalten `enabled` auf `false` setzen.

Detail-Runbook und Edge-Cases siehe [Betrieb](betrieb.md).

## Uebersicht

| Attribut | Wert |
|----------|------|
| URL | [banner.ackermannprivat.ch](https://banner.ackermannprivat.ch) |
| Admin-UI | [banner.ackermannprivat.ch/_/](https://banner.ackermannprivat.ch/_/) (Pocketbase eigene Auth) |
| Public-Endpoint | `/banner.js` (dynamisch aus aktueller Config gerendert) |
| Storage | Linstor CSI `banner-pb-data` (SQLite, autoPlace=2) |
| Admin-Auth | Authentik-Forward-Auth via `intern-auth` Chain (pocketbase-admin Router, Priority 10) |
| Public-Endpoints | `/banner.js`, `/api/health` ueber `public-noauth` Chain (pocketbase-public Router, Priority 100) |
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

Das Banner wird ueber das Pocketbase-Admin-UI verwaltet. Collection `banner_config` mit zwei Records (`audience: intern` und `audience: extern`). Beide Audiences unabhaengig steuerbar:

- **intern** -- erscheint auf allen Routen mit `intra.*` Hostname (z.B. intra.ackermannprivat.ch). Typisch fuer technische Wartungs-Infos an Admins
- **extern** -- erscheint auf allen anderen Routen (welcome, watch, wish, gitea, ...). Typisch fuer User-Freundliche Wartungs-Hinweise

Die Audience-Wahl passiert client-seitig im Banner-JS via `location.hostname.startsWith("intra.")`. Daher muss Traefik die Chains NICHT pro Audience splitten -- eine einzige `banner-inject` Middleware reicht. Der Pocketbase-Hook liefert beide Configs inline in der gleichen `banner.js`-Response.

Felder pro Record:

| Feld | Typ | Bedeutung |
|------|-----|-----------|
| `severity` | select | Farb-Preset (`wartung` orange, `info` blau, `incident` rot, `resolved` gruen). Default `wartung` |
| `enabled` | bool | Master-Schalter. `false` = Banner aus, unabhaengig von den Zeit-Feldern |
| `text` | string | Anzeigetext, max 500 Zeichen |
| `start_at` | datetime | Optional. Wenn gesetzt: Banner erscheint erst ab diesem Zeitpunkt |
| `end_at` | datetime | Optional. Wenn gesetzt: Banner verschwindet automatisch nach diesem Zeitpunkt |

Aktivierungslogik im Client-JS: `enabled && (start_at unset oder now >= start_at) && (end_at unset oder now <= end_at)`.

## Banner-faehige Routen

Banner ist Teil der Base-Chains in [`middleware-chains.yml`](https://github.com/derever-labs/homelab-hashicorp-stack/blob/main/standalone-stacks/traefik-proxy/configurations/middleware-chains.yml). Jede Route die eine dieser Chains nutzt bekommt automatisch das Banner-Verhalten:

- `intern-auth` / `intern-auth-strict`
- `public-auth` / `public-auth-strict`
- `public-noauth`

Reihenfolge in der Chain ist relevant: `force-identity-encoding` ganz vorne (sonst sieht das Plugin komprimierte Bytes), `banner-inject` VOR `error-pages` (so wird bei 4xx/5xx der Body durch die Error-Page komplett ersetzt und das Banner verschwindet automatisch auf Error-Seiten -- kein doppeltes Banner).

Routen ohne Banner: `intern-api` (JSON-API-Endpoints) und `keep-webhook` (machine-to-machine ohne User-Browser).

## force-identity-encoding (technische Notwendigkeit)

`traefik/plugin-rewritebody v0.3.x` kennt keine Decompression. Backends die HTML komprimiert ausliefern (Jellyfin sendet brotli, viele Java/Spring-Apps gzip) werden ohne Body-Rewrite weitergeleitet -- das Banner waere unsichtbar.

Loesung: Eine Headers-Middleware setzt vor `banner-inject` den Request-Header `Accept-Encoding: identity` -- das Backend antwortet dann unkomprimiert, der Regex-Replace greift, der Browser empfaengt unkomprimierte HTML (vernachlaessigbar bei HTML-Shell-Files).

Diese Middleware ist Teil aller `*-with-banner` Chains. Bei stark komprimierungs-abhaengigen Routen mit grossen HTML-Bodies waere sie ein Performance-Tradeoff -- bei den aktuellen Routen vernachlaessigbar.

## Bekannte Grenzen

::: tip Error-Pages bleiben sauber
Bei 4xx/5xx ersetzt die `error-pages`-Middleware den Backend-Body durch die nginx-error-page (Title-Format `"<status> - <text>"`). Das Banner-JS erkennt dieses Title-Pattern (`^\d{3} - `) und rendert auf Error-Seiten nicht -- so erscheint kein doppelter Wartungs-Hinweis ueber der eh schon prominenten Maintenance-Page. Plugin-rewritebody injiziert das Script-Tag dort trotzdem (technisch unvermeidbar weil das Plugin nach error-pages auf den finalen Body greift), aber das Banner-JS bricht beim Title-Check frueh ab.
:::

::: warning Content-Security-Policy
Apps mit strikter `Content-Security-Policy` (`script-src 'self'`) blockieren das externe Banner-Script im Browser. Aktuelle Apps mit `secure-headers`-Chain sind nicht betroffen (kein `script-src` gesetzt). Bei zukuenftigen Apps mit eigener strenger CSP muss Traefik einen Headers-Override pro Domain bereitstellen.
:::

::: warning Streaming-Endpoints
`plugin-rewritebody` buffert die gesamte Response im Speicher. Routen mit grossen Downloads oder SSE-Streams sollten die `*-with-banner` Chains NICHT verwenden. Standardmaessig keine bekannten Routen mit diesem Profil im Stack.
:::

::: tip Browser-Cache
Banner-Aenderungen kommen erst beim naechsten Page-Load durch (nicht live auf bereits geladenen Seiten). Hard-Reload (Cmd+Shift+R) wenn man Aenderungen sofort sehen will. Der `banner.js`-Endpoint sendet `Cache-Control: no-cache, must-revalidate`, das HTML der App selbst kann anders gecacht sein.
:::
