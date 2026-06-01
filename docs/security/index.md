---
title: Sicherheit & Authentifizierung
description: Authentik, CrowdSec und Zugriffskontrolle
tags:
  - platform
  - security
  - authentik
---

# Sicherheit & Authentifizierung

Der Zugriff auf interne Services wird zentral über Traefik gesteuert. Authentifizierungsanfragen werden an Authentik delegiert. CrowdSec läuft als natives Traefik-Plugin und blockiert böswillige IPs im Stream-Modus, bevor der Request überhaupt die Middleware-Chain erreicht.

## Übersicht

| Attribut | Wert |
|----------|------|
| Auth | Traefik Middleware Chains mit Authentik ForwardAuth |
| Deployment (Authentik) | Nomad Job `identity/authentik.nomad` |
| Secrets | Vault `kv/authentik`, `kv/authentik-outpost` |

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: right

User: User Request { style.border-radius: 8 }
CS: CrowdSec Plugin (Stream-Modus) { style.border-radius: 8 }
Chain: Middleware Chain (secure-headers) { style.border-radius: 8 }
FWD: Authentik ForwardAuth { style.border-radius: 8 }
AK: Authentik { tooltip: auth.ackermannprivat.ch; style.border-radius: 8 }
Backend: Backend Service { style.border-radius: 8 }
Block: Blockiert (böswillige IP) { style.border-radius: 8 }

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

Details: [Authentik](../authentik/index.md) -- Übersicht und Architektur. LDAP-Schichten im Homelab: [LDAP im Homelab](../ldap/index.md).

### CrowdSec (natives Traefik-Plugin)

CrowdSec läuft als natives Traefik-Plugin (`maxlerebourg/crowdsec-bouncer-traefik-plugin`) im Stream-Modus. Es ist kein separater ForwardAuth-Container mehr nötig. Das Plugin ist in den `public-*` Chains sowie auf der Authentik-Login-Route aktiv.

Details: [CrowdSec](../crowdsec/index.md)

## Zugriffsgruppen

Gruppen und Zugriffs-Tiers (inkl. MFA-Hinweisen): [Authentik Referenz](../authentik/referenz.md#gruppen).

## Middleware Chains

Alle Services werden über eine der vier Chains (`intern-api`, `intern-auth`, `public-auth`, `public-noauth`) geschützt. Die kanonische Chain-Definition inklusive Komponenten-Reihenfolge und IP-Allowlist-Ranges liegt in [Traefik Middlewares](../traefik/referenz.md).

## Konfiguration neuer Services

Um einen Service zu schützen, wird im Nomad Job die entsprechende Middleware als Tag gesetzt, z.B. `traefik.http.routers.my-service.middlewares=intern-auth@file`.

## Verwandte Seiten

- [Traefik Middlewares](../traefik/referenz.md) -- Vollständige Middleware-Chain-Dokumentation
- [CrowdSec](../crowdsec/index.md) -- Intrusion Detection und IP-Blocking
- [LDAP im Homelab](../ldap/index.md) -- LDAP-Schichten, Outpost, OpenLDAP-Legacy
- [DNS-Architektur](../dns/index.md) -- DNS-Kette inkl. lxc-dns-01/02
