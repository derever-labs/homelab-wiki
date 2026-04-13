---
title: Sicherheit & Authentifizierung
description: Authentik, CrowdSec und Zugriffskontrolle
tags:
  - platform
  - security
  - authentik
---

# Sicherheit & Authentifizierung

## Übersicht

Der Zugriff auf interne Services wird zentral über Traefik gesteuert. Authentifizierungsanfragen werden an Authentik delegiert. CrowdSec läuft als natives Traefik-Plugin und blockiert böswillige IPs im Stream-Modus, bevor der Request überhaupt die Middleware-Chain erreicht.

```d2
direction: right

User: User Request
CS: CrowdSec Plugin (Stream-Modus)
Chain: Middleware Chain (secure-headers)
FWD: Authentik ForwardAuth
AK: Authentik { tooltip: "auth.ackermannprivat.ch" }
Backend: Backend Service
Block: Blockiert (böswillige IP)

User -> CS
CS -> Chain
Chain -> FWD
FWD -> AK: { style.stroke-dash: 5 }
FWD -> Backend
CS -> Block: { style.stroke-dash: 5 }
```

## Komponenten

### Authentik (Identity Store und SSO Provider)

- **URL:** `https://auth.ackermannprivat.ch`
- **Deployment:** Nomad Job
- **ForwardAuth-Endpunkt:** Eingebunden in Middleware Chains `intern-auth` und `public-auth`

Authentik ist der zentrale Identity Store für alle User-Accounts. Die User-Daten leben in der Authentik-eigenen PostgreSQL-Datenbank, nicht in einem externen Verzeichnis. Services authentifizieren über drei Wege:

- **OIDC** für native Clients wie Grafana, Gitea, Proxmox
- **ForwardAuth** für Web-UIs ohne OIDC-Support (via Traefik Middleware Chains)
- **LDAP Bind** für Jellyfin über den [Authentik LDAP Outpost](../ldap/index.md)

Authentik ersetzt die frühere Kombination aus Keycloak und oauth2-proxy. Die ForwardAuth-Integration läuft direkt in Traefik -- kein separater oauth2-proxy-Container mehr.

Details: [Authentik](../authentik/index.md) -- Übersicht und Architektur. LDAP-Schichten im Homelab: [LDAP im Homelab](../ldap/index.md).

### CrowdSec (natives Traefik-Plugin)

CrowdSec läuft als natives Traefik-Plugin (`maxlerebourg/crowdsec-bouncer-traefik-plugin`) im Stream-Modus. Es ist kein separater ForwardAuth-Container mehr nötig. Das Plugin ist in den `public-*` Chains sowie auf der Authentik-Login-Route aktiv.

Details: [CrowdSec](../crowdsec/index.md)

## Zugriffsgruppen

| Gruppe | Mitglieder | Zugriff |
|--------|------------|---------|
| `admin` | samuel | Voller Zugriff auf alle Services |
| `family` | corinna, + weitere | Familien-Zugriff (Jellyseerr, Jellyfin, etc.) |
| `guest` | Weitere | Limitierter Zugriff |

## Middleware Chains

Detaillierte Beschreibung siehe [Traefik Middleware Chains](../traefik/referenz.md).

### Kurzübersicht

| Chain | Beschreibung |
|-------|--------------|
| `intern-api@file` | Nur IP-Allowlist (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 100.64.0.0/10) |
| `intern-auth@file` | secure-headers + Authentik ForwardAuth + IP-Allowlist |
| `public-auth@file` | CrowdSec + secure-headers + Authentik ForwardAuth |
| `public-noauth@file` | CrowdSec + secure-headers |

Vollständige Dokumentation: [Traefik Middlewares](../traefik/referenz.md)

## Konfiguration neuer Services

Um einen Service zu schützen, wird im Nomad Job die entsprechende Middleware als Tag gesetzt, z.B. `traefik.http.routers.my-service.middlewares=intern-auth@file`.

## Tailscale-Zugriff

Tailscale-Verbindungen nutzen den CGNAT-Bereich `100.64.0.0/10`. Dieser ist in der `intern-api` und `intern-auth` IP-Allowlist enthalten, sodass Zugriff über Tailscale auf interne Services möglich ist.

## Verwandte Seiten

- [Traefik Middlewares](../traefik/referenz.md) -- Vollständige Middleware-Chain-Dokumentation
- [CrowdSec](../crowdsec/index.md) -- Intrusion Detection und IP-Blocking
- [LDAP im Homelab](../ldap/index.md) -- LDAP-Schichten, Outpost, OpenLDAP-Legacy
- [DNS-Architektur](../dns/index.md) -- DNS-Kette inkl. lxc-dns-01/02
