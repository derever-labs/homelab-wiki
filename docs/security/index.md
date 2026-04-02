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

```mermaid
flowchart LR
    User:::entry["User Request"] --> CS:::svc["CrowdSec Plugin<br/>(Stream-Modus)"]
    CS --> Chain:::svc["Middleware Chain<br/>(secure-headers)"]
    Chain --> FWD:::svc["Authentik ForwardAuth"]
    FWD -.-> AK:::ext["Authentik<br/>auth.ackermannprivat.ch"]
    FWD --> Backend:::svc["Backend Service"]
    CS -.-> Block:::accent["Blockiert<br/>(böswillige IP)"]

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Komponenten

### OpenLDAP (Benutzerverzeichnis)

Zentraler Identity Store für alle User-Accounts. Authentik ist per LDAP angebunden. Services wie Jellyfin authentifizieren direkt gegen LDAP.

Details: [OpenLDAP & Benutzerverwaltung](../ldap/index.md)

### Authentik (SSO Provider)

- **URL:** `https://auth.ackermannprivat.ch`
- **Deployment:** Nomad Job
- **ForwardAuth-Endpunkt:** Eingebunden in Middleware Chains `intern-auth` und `public-auth`

Authentik ersetzt Keycloak (ehemals `sso.ackermannprivat.ch`). Die ForwardAuth-Integration läuft direkt in Traefik -- kein separater oauth2-proxy-Container mehr.

### CrowdSec (natives Traefik-Plugin)

CrowdSec läuft als natives Traefik-Plugin (`maxlerebourg/crowdsec-bouncer-traefik-plugin` v1.4.7) im Stream-Modus. Es ist kein separater ForwardAuth-Container mehr nötig. Das Plugin ist in den `public-*` Chains sowie auf der Authentik-Login-Route aktiv.

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
- [OpenLDAP & Benutzerverwaltung](../ldap/index.md) -- Zentrales Benutzerverzeichnis
- [DNS-Architektur](../dns/index.md) -- DNS-Kette inkl. lxc-dns-01/02
