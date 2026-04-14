---
title: Traefik Middleware Chains
description: Authentik-basierte Middleware Chains und TLS-Konfiguration für Traefik
tags:
  - platform
  - traefik
  - security
  - authentik
---

# Traefik Middleware Chains

Diese Dokumentation beschreibt die verfügbaren Middleware Chains für Traefik und deren Verwendung.

## Übersicht

Alle Services werden über Traefik (VIP 10.0.2.20, vm-traefik-01/02) geroutet. Die Authentifizierung erfolgt über Authentik als Identity Provider via ForwardAuth.

::: info Migration von OAuth2-Proxy/Keycloak auf Authentik
Die v2-Chains (`admin-chain-v2`, `family-chain-v2`, `public-*-chain-v2`) sowie alle OAuth2-Callback-Routen wurden im Rahmen der Keycloak-Abschaltung entfernt. Alle Services nutzen neu die unten dokumentierten Authentik-Chains.
:::

## Middleware Chains

### Für internen Zugriff mit Authentik-Login

| Chain | Komponenten (Reihenfolge) | Beschreibung |
|-------|--------------------------|--------------|
| `intern-auth` | secure-headers → authentik-forward-auth → ipAllowList → error-pages | IP-Allowlist + Sicherheits-Header + Authentik ForwardAuth + Error Pages. Default für interne Apps |
| `intern-auth-strict` | secure-headers → authentik-forward-auth → ipAllowList → error-pages-strict | Wie `intern-auth`, aber fängt zusätzlich 401/403 vom Backend ab (Maintenance-Page statt rohem Fehler). Für yt-dlp, special-youtube-dl, special-yt-dlp, video-grabber |

### Für externen Zugriff mit Authentik-Login

| Chain | Komponenten (Reihenfolge) | Beschreibung |
|-------|--------------------------|--------------|
| `public-auth` | crowdsec → secure-headers → authentik-forward-auth → error-pages | CrowdSec + Sicherheits-Header + Authentik ForwardAuth + Error Pages |
| `public-auth-strict` | crowdsec → secure-headers → authentik-forward-auth → error-pages-strict | Wie `public-auth`, aber mit 401/403 in Error Pages. Für externe Apps mit UI-kaputten Backend-401/403-Responses |

### Ohne Login

| Chain | Komponenten | Beschreibung |
|-------|-------------|--------------|
| `public-noauth` | crowdsec → secure-headers → error-pages | Öffentlich erreichbar, kein Login (z.B. Jellyfin) |
| `intern-noauth` | ipAllowList → compress | Nur IP-Allowlist, kein Login (für Apps mit eigener Auth) |
| `intern-api` | ipAllowList | IP-Allowlist für API-Key-Routen, keine Error Pages (Backends liefern eigene JSON-Errors) |

### Sonderfall: Authentik Login-Route

Die Authentik-Route selbst verwendet keine der obigen Chains, sondern direkt: `login-ratelimit@file,crowdsec@file,secure-headers@file`. Eine IP-Allowlist ist hier nicht möglich, da externe Clients nach dem ForwardAuth-Redirect auf die Authentik-Login-Seite weitergeleitet werden. Details: [Authentik Integration](../authentik/index.md#integration-mit-traefik).

### Legacy (entfernt)

::: warning Entfernte Chains
Die folgenden Chains aus der Keycloak/oauth2-proxy-Ära wurden entfernt und sind nicht mehr verfügbar. Alle darauf basierenden Nomad-Jobs wurden auf die neuen Chains migriert.
:::

| Chain | Ersetzt durch |
|-------|---------------|
| `admin-chain-v2@file` | `intern-auth@file` |
| `family-chain-v2@file` | `intern-auth@file` |
| `intern-chain@file` | `intern-noauth@file` |
| `public-admin-chain-v2@file` | `public-auth@file` |
| `public-family-chain-v2@file` | `public-auth@file` |
| `public-guest-chain-v2@file` | `public-auth@file` |

### IP-Allowlist Ranges

Die `ipAllowList`-Middleware (früher `ipWhiteList`, in Traefik v3 umbenannt) erlaubt folgende IP-Bereiche:
- `10.0.0.0/8` -- Internes Netzwerk
- `172.16.0.0/12` -- Docker Networks
- `192.168.0.0/16` -- VPN und weitere private Netze
- `100.64.0.0/10` -- Tailscale CGNAT Range

Siehe `standalone-stacks/traefik-proxy/configurations/middlewares.yml` für die vollständige Definition.

## Architektur

### Authentik ForwardAuth

```d2
direction: right

User: User
Traefik: Traefik
chain: Middleware Chain
ipcheck: ipAllowList (intern) oder CrowdSec (public)
fwdauth: authentik-forward-auth
authentik: Authentik { tooltip: "ForwardAuth /outpost.goauthentik.io/..." }
compress: compress
Backend: Backend

User -> Traefik
Traefik -> chain
chain -> ipcheck
ipcheck -> fwdauth
fwdauth -> authentik: { style.stroke-dash: 5 }
fwdauth -> compress
compress -> Backend
```

### Authentik-Callback

Die Authentik-Callback-Routen sind in `auth-routes.yml` mit Priority 1000 definiert, damit sie vor anderen Routen matchen. Siehe `standalone-stacks/traefik-proxy/configurations/auth-routes.yml`.

## Middlewares

### compress

Aktiviert HTTP-Komprimierung mit den Encoding-Präferenzen `br` (Brotli), `zstd`, `gzip`. Bilder und PDFs sind ausgenommen. Ist in allen Chains (ausser `intern-api`) enthalten.

Siehe `standalone-stacks/traefik-proxy/configurations/middlewares.yml`.

### error-pages

Leitet HTTP-Fehlerantworten an den Maintenance-Page-Service (nginx-Container mit statischen HTML-Seiten) weiter. In allen Web-Chains (`intern-auth`, `public-auth`, `public-noauth`) standardmässig enthalten. Nicht in `intern-api` -- API-Endpoints liefern eigene JSON-Fehler.

**Abgedeckte Statuscodes:** 404-405, 408, 429, 500-599

**Bewusst ausgenommen:**
- 400 (Bad Request) -- Backends liefern oft eigene JSON-Bodies mit Validierungsdetails
- 401 (Unauthorized) -- Authentik-Outpost liefert bei fehlender Session 302-Redirect (nicht 401), aber manche Backends senden eigene 401 für API-Contracts -- default reicht 401 durch
- 403 (Forbidden) -- Authentik-Outpost redirectet bei fehlender Berechtigung ebenfalls auf 302 zur Access-Denied-Seite; 403 kommt typischerweise vom Backend und bleibt unangetastet

### error-pages-strict

Variante von `error-pages`, die zusätzlich 401 und 403 auf die Maintenance-Page umleitet. Nur für Apps einsetzen, deren Backend-401/403-Responses UI-kaputt oder JSON-only sind (z.B. yt-dlp-Container liefert rohes "403 Forbidden"-Plain-HTML). Verwendet in den Chains `intern-auth-strict` und `public-auth-strict`.

::: warning Nicht global einsetzen
API-Endpoints nutzen 401 als Contract-Response (WWW-Authenticate-Header, Token-Renewal-Trigger). Strict-Chain würde diese Semantik brechen. Deshalb gezielt nur für die vier Media-Tool-Apps aktiviert.
:::

**Fallback:** Für unbekannte Codes (z.B. 418, 422) existieren generische Fallback-Seiten (`4xx.html`, `5xx.html`) via nginx `try_files`. Die Catch-All-Seiten enthalten bewusst keine Links zu internen Services um Information Disclosure bei Subdomain-Scans zu vermeiden.

**Cache-Verhalten:** 5xx-Seiten werden mit `Cache-Control: no-store` ausgeliefert (temporäre Serverfehler nicht cachen). 4xx-Seiten werden mit `Cache-Control: public, max-age=30` kurz gecached -- knapp genug, damit der 404-Flicker während eines Nomad-Alloc-Cutover (neuer Container ersetzt alten, Consul-Service-Registration braucht wenige Sekunden) nicht im Browser hängenbleibt, aber hoch genug um Bot- und Scanner-Requests auf echte 404s zu dämpfen. Definiert in `standalone-stacks/traefik-proxy/configs/nginx/config/default.conf`.

**Error Pages generieren:** `standalone-stacks/traefik-ha/configs/nginx/generate-error-pages.sh` ist die einzige Source-of-Truth. Nach Textänderungen Script ausführen, Dateien einchecken, auf beide Stacks deployen.

Siehe `standalone-stacks/traefik-proxy/configurations/middlewares.yml` für die Middleware-Definition und `standalone-stacks/traefik-ha/configs/nginx/` für die HTML-Templates.

### login-ratelimit

Rate-Limiting für Login-Endpunkte (Authentik). Aktuelle Werte: 50 req/min, Burst 100 (temporär erhöht für Testphase; ursprünglich 10 req/min, Burst 20). Definiert in `middlewares.yml`.

### ipAllowList

Ersetzt das frühere `ipWhiteList` (in Traefik v3 umbenannt). Funktional identisch -- nur der Schlüsselname hat sich geändert.

## TLS-Options

Die TLS-Konfiguration legt Mindeststandards für alle HTTPS-Verbindungen fest. Sie ist in `standalone-stacks/traefik-proxy/configurations/tls-options.yml` definiert und gilt als `default` TLS-Option.

Wesentliche Einstellungen:
- **Mindestversion:** TLS 1.2
- **SNI Strict:** aktiviert (verhindert TLS ohne SNI)
- **Cipher Suites:** nur ECDHE-basierte Suites (AES-256-GCM, AES-128-GCM, ChaCha20-Poly1305)
- **Curve Preferences:** X25519, P-256

Siehe `standalone-stacks/traefik-proxy/configurations/tls-options.yml` für die vollständige Liste.

## Konfiguration neuer Services

Für jeden Service wird im Nomad Job oder Docker Label die gewünschte Chain angegeben, z.B. `intern-auth@file` oder `public-noauth@file`. Für Authentik-geschützte Services wird zusätzlich keine separate Callback-Route benötigt -- die zentrale `auth-routes.yml` deckt den Callback ab.

Beispiele für die Verwendung der Chains stehen in der [Security-Dokumentation](../security/index.md).

## Konfigurationsdateien

Alle Konfigurationsdateien liegen im Git unter `standalone-stacks/traefik-proxy/configurations/` und werden per Ansible auf `/opt/traefik/configurations/` deployed:

| Datei | Inhalt |
|-------|--------|
| `middlewares.yml` | Middleware-Definitionen (ipAllowList, compress, error-pages etc.) |
| `middleware-chains.yml` | Chain-Definitionen (intern-auth, public-auth etc.) |
| `tls-options.yml` | TLS-Mindestversion, Cipher Suites |
| `servers-transports.yml` | `insecureSkipVerify` für interne Backends |
| `auth-routes.yml` | Authentik-Callback-Routen |
| `services-external.yml` | Routen für externe/interne File-Provider-Services |
| `tcp-meeting.yml` | TCP Passthrough |

## Failover-Test

Getestete Szenarien (G2-Test bestanden):

**Failover (MASTER ausgefallen):**
- Keepalived auf vm-traefik-01 stoppen
- Erwartetes Verhalten: VIP wechselt innerhalb ~4s auf vm-traefik-02
- Prüfen: `ip addr show` auf vm-traefik-02 zeigt 10.0.2.20; Services über VIP erreichbar

**Failback (MASTER wieder verfügbar):**
- Keepalived auf vm-traefik-01 starten
- Erwartetes Verhalten: VIP wechselt zurück auf vm-traefik-01 (Priorität 150 > 100)
- Prüfen: `ip addr show` auf vm-traefik-01 zeigt 10.0.2.20; Services weiterhin erreichbar

**Split-Brain-Check nach Deployment:**
- Nach dem Ansible-Deploy: `ip addr show` auf beiden Nodes prüfen
- Nur ein Node darf 10.0.2.20 zeigen
- Falls beide die VIP halten: VRRP-Auth-Konfiguration und Keepalived-Status prüfen (`systemctl status keepalived`)

## Verwandte Seiten

- [Traefik Übersicht](./index.md) -- Architektur und Deployment
- [Sicherheit](../security/index.md) -- Gesamte Security-Architektur
- [Authentik](../authentik/index.md) -- Identity Provider für ForwardAuth
- [CrowdSec](../crowdsec/index.md) -- Intrusion Detection als erste Middleware-Stufe
- [Nomad Job-Übersicht](../nomad/index.md) -- Jobs die diese Middleware Chains nutzen
