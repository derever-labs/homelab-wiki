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
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  blocked: { style: { border-radius: 8; stroke-dash: 2 } }
}

user: User-Request { class: node }
cs: "CrowdSec-Plugin\n(Stream-Modus)" { class: node }
chain: "Middleware-Chain\n(intern-* / public-*)" { class: node }
fwd: Authentik ForwardAuth { class: node }
ak: Authentik { class: node; tooltip: "auth.ackermannprivat.ch" }
backend: Backend-Service { class: node }
block: "Blockiert\n(böswillige IP)" { class: blocked }

user -> cs
cs -> chain
chain -> fwd
fwd -> ak: { style.stroke-dash: 5 }
fwd -> backend
cs -> block: { style.stroke-dash: 5 }
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

Gruppen und Zugriffs-Tiers (inkl. MFA-Hinweisen): [Authentik Gruppen und Bindings](../authentik/gruppen-bindings.md#gruppen).

## Middleware Chains

Services werden über Traefik Middleware Chains geschützt. Die vier Basis-Chains sind `intern-api`, `intern-auth`, `public-auth` und `public-noauth`; für Apps mit UI- oder JSON-untauglichen 401/403-Antworten kommen zusätzlich die strict-Varianten `intern-auth-strict` und `public-auth-strict` zum Einsatz. Die kanonische Chain-Definition inklusive Komponenten-Reihenfolge und IP-Allowlist-Ranges liegt in [Traefik Middlewares](../traefik/referenz.md).

## Konfiguration neuer Services

Um einen Service zu schützen, wird im Nomad Job die entsprechende Middleware als Tag gesetzt, z.B. `traefik.http.routers.my-service.middlewares=intern-auth@file`.

## Verwandte Seiten

- [Traefik Middlewares](../traefik/referenz.md) -- Vollständige Middleware-Chain-Dokumentation
- [CrowdSec](../crowdsec/index.md) -- Intrusion Detection und IP-Blocking
- [LDAP im Homelab](../ldap/index.md) -- LDAP-Schichten, Outpost, OpenLDAP-Legacy
- [DNS-Architektur](../dns/index.md) -- DNS-Kette inkl. lxc-dns-01/02
