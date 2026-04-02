---
title: Authentik
description: Identity Provider für SSO, ForwardAuth und OIDC im Homelab
tags:
  - platform
  - security
  - authentik
  - sso
  - oidc
---

# Authentik

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [auth.ackermannprivat.ch](https://auth.ackermannprivat.ch) |
| **Deployment** | Docker Compose auf vm-proxy-dns-01 |
| **Auth** | Eigenständig (kein ForwardAuth auf der Login-Seite selbst) |
| **Storage** | PostgreSQL (`authentik` Datenbank), Redis (Cache/Sessions) |

## Rolle im Stack

Authentik ist der zentrale Identity Provider des Homelabs. Er ersetzt die frühere Kombination aus Keycloak und oauth2-proxy. Alle Services, die eine Authentifizierung benötigen, delegieren diese entweder via ForwardAuth (Traefik-Integration) oder über OIDC (native App-Integration) an Authentik.

## Architektur

```mermaid
flowchart LR
    subgraph Zugriff["Zugriff von aussen"]
        User:::entry["Benutzer"]
    end

    subgraph Traefik["Traefik (vm-proxy-dns-01)"]
        TR:::svc["Reverse Proxy"]
        FWD:::svc["ForwardAuth Middleware\n(authentik-forward-auth)"]
    end

    subgraph Authentik["Authentik (vm-proxy-dns-01)"]
        AK:::accent["Authentik Server"]
        OUTPOST:::accent["Embedded Outpost\n(/outpost.goauthentik.io/...)"]
        LDAP_OUT:::accent["LDAP Outpost\n(:636 intern)"]
    end

    subgraph Backend["Backend-Services"]
        SVC:::svc["Geschützte Services\n(intern-auth / public-auth)"]
        OIDC:::svc["OIDC-Services\n(Grafana, Open-WebUI, Paperless)"]
    end

    subgraph Verzeichnis["Benutzerverwaltung"]
        LDAP:::db["OpenLDAP\n(Benutzer-SSOT)"]
        PG:::db["PostgreSQL\n(Authentik DB)"]
    end

    User --> TR
    TR --> FWD
    FWD -.->|"ForwardAuth Check"| OUTPOST
    OUTPOST --> AK
    AK --> LDAP
    AK --> PG
    FWD -->|"Zugriff erlaubt"| SVC
    OIDC -.->|"OIDC Discovery"| AK

    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
```

## Authentifizierungsmethoden

Authentik schützt Services auf zwei Arten:

### ForwardAuth (über Traefik-Middleware)

Traefik delegiert jeden Request an den Authentik Embedded Outpost unter `/outpost.goauthentik.io/`. Ist der Benutzer nicht eingeloggt, leitet Authentik zum Login-Flow weiter. Nach erfolgreichem Login wird der ursprüngliche Request durchgelassen.

Diese Methode wird für alle Services mit `intern-auth@file` oder `public-auth@file` verwendet. Die App selbst benötigt keine Authentifizierungslogik -- Authentik übernimmt das vollständig.

Details zur Middleware-Konfiguration: [Traefik Middleware Chains](../traefik/referenz.md)

### Natives OIDC (App-integriert)

Apps, die OIDC nativ unterstützen, werden direkt als OIDC-Provider-Client konfiguriert. In diesen Fällen übernimmt die App den Login-Dialog selbst und tauscht Token mit Authentik aus. Die Traefik-Chain ist dann `intern-noauth@file` (IP-Allowlist reicht, die App kümmert sich um Auth).

Services mit nativem OIDC:
- Grafana
- Open-WebUI
- Paperless

## Outposts

Authentik nutzt sogenannte Outposts für die Protokoll-Integration:

| Outpost | Protokoll | Zweck |
|---------|-----------|-------|
| Embedded Outpost | HTTP/ForwardAuth | Traefik-Integration via `/outpost.goauthentik.io/` |
| LDAP Outpost | LDAPS `:636` | Authentifizierung für Services ohne OIDC-Support |

Der Embedded Outpost läuft direkt im Authentik-Container und ist intern über `authentik.service.consul` erreichbar. Er muss nach einem Traefik-Neustart gegebenenfalls neu starten, da er OIDC Discovery über die eigene URL durchführt.

::: warning Authentik nach Traefik-Neustart
Falls Authentik nach einem Traefik-Neustart nicht mehr antwortet: den Authentik-Container neu starten. Der Embedded Outpost führt beim Start OIDC Discovery durch und braucht dafür erreichbares Traefik.
:::

## Flows

Authentik arbeitet mit konfigurierbaren Flows. Im Homelab sind folgende Flows aktiv:

| Flow | Zweck |
|------|-------|
| Authentication Flow | Login mit Username/Passwort (LDAP-Backend) |
| Authorization Flow | Bestätigt den Zugriff auf OIDC-Clients (implicit consent) |
| Invalidation Flow | Logout (Session-Invalidierung) |

Die Flows sind über die Authentik-UI unter `auth.ackermannprivat.ch` konfigurierbar.

## Benutzerverwaltung

Authentik liest Benutzer aus OpenLDAP (LDAP-Source). OpenLDAP ist der Single Source of Truth für alle User-Accounts. Passwort-Änderungen in Authentik schreiben zurück nach LDAP.

Details: [OpenLDAP & Benutzerverwaltung](../ldap/index.md)

| Gruppe | Zugriff |
|--------|---------|
| `admin` | Voller Zugriff auf alle Services |
| `family` | Familien-Zugriff (Jellyfin, Jellyseerr etc.) |

## Migration von Keycloak

Authentik ersetzt Keycloak (`sso.ackermannprivat.ch`) und oauth2-proxy. Die Migration umfasste:

- Alle Nomad-Jobs von `*-chain-v2@file` auf die neuen Authentik-Chains umgestellt
- Stash und Stash-Secure auf `intern-auth` migriert
- uptime-kuma, metabase, gatus von extern auf intern umgestellt
- Keycloak und oauth2-proxy gestoppt und entfernt
- DNS-Eintrag: `auth.ackermannprivat.ch` (statt `sso.ackermannprivat.ch`)

## Verwandte Seiten

- [Traefik Middleware Chains](../traefik/referenz.md) -- ForwardAuth-Konfiguration und Chain-Übersicht
- [Traefik Reverse Proxy](../traefik/index.md) -- Reverse Proxy Architektur
- [OpenLDAP & Benutzerverwaltung](../ldap/index.md) -- Benutzer-SSOT
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking als erste Middleware-Stufe
- [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) -- Abhängigkeits-Übersicht
