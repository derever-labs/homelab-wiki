---
title: Sicherheit & Authentifizierung
description: Keycloak, OAuth2-Proxy und Zugriffskontrolle
tags:
  - platform
  - security
  - keycloak
---

# Sicherheit & Authentifizierung

## Übersicht
Der Zugriff auf interne Services wird zentral über Traefik gesteuert, welches Authentifizierungsanfragen an Keycloak delegiert.

```mermaid
flowchart LR
    User:::entry["User Request"] --> Traefik:::svc
    Traefik --> errors:::svc["oauth2-errors"]
    errors --> require:::svc["require-{group}"]
    require --> Backend:::svc["Backend Service"]
    errors -.-> backend2:::accent["oauth2-backend<br/>(Redirect zu<br/>Keycloak Login)"]
    require -.-> fwd:::accent["ForwardAuth<br/>/oauth2/auth?allowed_groups=X"]
    fwd -.-> KC:::ext["Keycloak OIDC<br/>(Gruppenprüfung)"]

    classDef ext fill:#fef2f2,stroke:#e11d48,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

## Komponenten

### OpenLDAP (Benutzerverzeichnis)

Zentraler Identity Store für alle User-Accounts. Keycloak ist per LDAP Federation (WRITABLE) angebunden und synchronisiert Passwort-Änderungen zurück nach LDAP. Services wie Jellyfin authentifizieren direkt gegen LDAP.

Details: [OpenLDAP & Benutzerverwaltung](../services/core/ldap.md)

### Keycloak (SSO Provider)
- **URL:** `https://sso.ackermannprivat.ch`
- **Realm:** `traefik`
- **Client:** `traefik-forward-auth`
- **Deployment:** Docker Compose auf vm-proxy-dns-01
- **LDAP Federation:** WRITABLE (Änderungen in Keycloak werden nach LDAP geschrieben)

### oauth2-proxy (v2)
Zentraler oauth2-proxy mit ForwardAuth. Prüft das Session-Cookie und validiert die Gruppenzugehörigkeit via `allowed_groups` Query-Parameter.

- **Container:** `oauth2-proxy` (einzelne Instanz)
- **Auth-Endpoint:** `/oauth2/auth?allowed_groups=...`
- **Sign-In:** `/oauth2/sign_in?rd={url}`

## Zugriffsgruppen

| Gruppe | Mitglieder | Zugriff |
|--------|------------|---------|
| `admin` | samuel | Voller Zugriff auf alle Services |
| `family` | corinna, + weitere | Familien-Zugriff (Jellyseerr, Jellyfin, etc.) |
| `guest` | Weitere | Limitierter Zugriff |

## CrowdSec (Intrusion Detection)

CrowdSec analysiert Traefik-Logs und blockiert böswillige IPs per ForwardAuth-Bouncer. In den `public-*-chain-v2` Middleware Chains ist CrowdSec als erste Stufe eingebunden.

Details: [CrowdSec](crowdsec.md)

## Middleware Chains

Detaillierte Beschreibung siehe [Traefik Middleware Chains](traefik-middlewares.md).

### Kurzübersicht

| Chain | Beschreibung |
|-------|--------------|
| `public-admin-chain-v2@file` | CrowdSec + OAuth2 Admin |
| `public-family-chain-v2@file` | CrowdSec + OAuth2 Family |
| `public-guest-chain-v2@file` | CrowdSec + OAuth2 Guest |
| `intern-admin-chain-v2@file` | OAuth2 Admin + IP-Whitelist |
| `intern-family-chain-v2@file` | OAuth2 Family + IP-Whitelist |
| `intern-chain@file` | Nur IP-Whitelist |

Vollständige Dokumentation: [Traefik Middlewares](traefik-middlewares.md)

## Konfiguration neuer Services

Um einen Service zu schützen, wird im Nomad Job die entsprechende Middleware als Tag gesetzt, z.B. `traefik.http.routers.my-service.middlewares=public-admin-chain-v2@file`.

Zusätzlich muss für jeden neuen Service mit OAuth2 eine Callback-Route in der Traefik Dynamic Config definiert werden (siehe `standalone-stacks/traefik-proxy/templates/` im Repo). Diese Route leitet `/oauth2/`-Pfade an den oauth2-backend weiter und muss eine hohe Priorität (1000) haben.

## Tailscale-Zugriff

Tailscale-Verbindungen nutzen den CGNAT-Bereich `100.64.0.0/10`. Dieser ist in der `intern-chain` IP-Whitelist enthalten, sodass Zugriff über Tailscale auf interne Services möglich ist.

## Verwandte Seiten

- [Traefik Middlewares](traefik-middlewares.md) -- Vollständige Middleware-Chain-Dokumentation
- [CrowdSec](crowdsec.md) -- Intrusion Detection und IP-Blocking
- [OpenLDAP & Benutzerverwaltung](../services/core/ldap.md) -- Zentrales Benutzerverzeichnis
- [DNS-Architektur](dns-architecture.md) -- DNS-Kette inkl. vm-proxy-dns-01
