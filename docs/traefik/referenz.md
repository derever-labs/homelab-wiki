---
title: Traefik Middleware Chains
description: Authentik-basierte Middleware Chains und TLS-Konfiguration fuer Traefik
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
| `intern-auth` | ipAllowList → secure-headers → authentik-forward-auth → compress | IP-Allowlist + Sicherheits-Header + Authentik ForwardAuth |

### Für externen Zugriff mit Authentik-Login

| Chain | Komponenten (Reihenfolge) | Beschreibung |
|-------|--------------------------|--------------|
| `public-auth` | crowdsec → secure-headers → authentik-forward-auth → compress | CrowdSec + Sicherheits-Header + Authentik ForwardAuth |

### Ohne Login

| Chain | Komponenten | Beschreibung |
|-------|-------------|--------------|
| `public-noauth` | crowdsec → secure-headers → compress | Öffentlich erreichbar, kein Login (z.B. Jellyfin) |
| `intern-noauth` | ipAllowList → compress | Nur IP-Allowlist, kein Login (für Apps mit eigener Auth) |
| `intern-api` | ipAllowList | IP-Allowlist für API-Key-Routen (ohne Compression) |

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

Leitet HTTP-5xx-Antworten an einen Maintenance-Page-Service weiter. Nicht in allen Chains standardmässig enthalten -- bei Bedarf separat hinzufügen.

Siehe `standalone-stacks/traefik-proxy/configurations/middlewares.yml`.

### login-ratelimit

Rate-Limiting für Login-Endpunkte (Authentik). Aktuelle Werte: 50 req/min, Burst 100 (temporär erhöht für Testphase; ursprünglich 10 req/min, Burst 20). Definiert in `middlewares.yml`.

### ipAllowList

Ersetzt das frühere `ipWhiteList` (in Traefik v3 umbenennt). Funktional identisch -- nur der Schlüsselname hat sich geändert.

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
