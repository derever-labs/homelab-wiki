---
title: Traefik Middleware Chains
description: OAuth2-Proxy v2 Middleware Chains fuer Traefik
tags:
  - platform
  - traefik
  - security
  - oauth2
---

# Traefik Middleware Chains

Diese Dokumentation beschreibt die verfügbaren Middleware Chains für Traefik und deren Verwendung.

## Übersicht

Alle Services werden über Traefik (vm-proxy-dns-01, 10.0.2.1) geroutet. Die Authentifizierung erfolgt über OAuth2-Proxy v2 mit Keycloak als Identity Provider.

> **Migration v1 → v2:** Am 21.02.2026 wurden alle Middleware Chains auf v2 migriert.
> Die v2 Chains nutzen einen zentralen oauth2-proxy mit ForwardAuth (`/oauth2/auth?allowed_groups=...`)
> statt separater oauth2-proxy-Instanzen pro Gruppe.

## Middleware Chains

### Für externen Zugriff (Public)

Diese Chains erlauben Zugriff von überall, erfordern aber OAuth2-Authentifizierung:

| Chain | Komponenten (Reihenfolge) | Beschreibung |
|-------|--------------------------|--------------|
| `public-guest-chain-v2` | crowdsec → oauth2-errors → require-guest | CrowdSec + OAuth2 Guest |
| `public-admin-chain-v2` | crowdsec → oauth2-errors → require-admin | CrowdSec + OAuth2 Admin |
| `public-family-chain-v2` | crowdsec → oauth2-errors → require-family | CrowdSec + OAuth2 Family |

### Für internen Zugriff (IP-Whitelist + OAuth2)

Diese Chains erfordern sowohl OAuth2-Authentifizierung als auch eine interne IP:

| Chain | Komponenten (Reihenfolge) | Beschreibung |
|-------|--------------------------|--------------|
| `admin-chain-v2` | oauth2-errors → require-admin → intern-chain | OAuth2 Admin + IP-Whitelist |
| `family-chain-v2` | oauth2-errors → require-family → intern-chain | OAuth2 Family + IP-Whitelist |

### Nur IP-Whitelist (ohne OAuth2)

| Chain | Komponenten | Beschreibung |
|-------|-------------|--------------|
| `intern-chain` | ipWhiteList | Basis IP-Whitelist |
| `intern-api-chain` | intern-chain | Für API-Zugriffe (nur IP-Whitelist) |

### IP-Whitelist Ranges

Die `intern-chain` erlaubt folgende IP-Bereiche:
- `10.0.0.0/8` - Internes Netzwerk
- `172.16.0.0/12` - Docker Networks
- `192.168.0.0/16` - VPN und weitere private Netze
- `100.64.0.0/10` - Tailscale CGNAT Range

## v2 Architektur

### Zentraler oauth2-proxy

Statt separater Instanzen pro Gruppe gibt es **einen** oauth2-proxy, der die Gruppenprüfung per `allowed_groups` Query-Parameter macht:

```mermaid
flowchart LR
    User:::entry --> Traefik:::svc
    Traefik --> errors:::svc["oauth2-errors"]
    errors --> require:::svc["require-{group}"]
    require --> Backend:::svc
    errors -.-> backend2:::accent["oauth2-backend<br/>(Redirect zu<br/>Keycloak Login)"]
    require -.-> fwd:::accent["ForwardAuth<br/>/oauth2/auth?allowed_groups=X"]

    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
```

### ForwardAuth Middlewares (require-*)

| Middleware | ForwardAuth URL | Erlaubte Gruppen |
|------------|-----------------|------------------|
| `require-admin` | `/oauth2/auth?allowed_groups=admin` | admin |
| `require-family` | `/oauth2/auth?allowed_groups=admin,family` | admin, family |
| `require-guest` | `/oauth2/auth?allowed_groups=admin,family,guest` | admin, family, guest |

### Error Handling (oauth2-errors)

Die `oauth2-errors` Middleware fängt 401-Antworten von den `require-*` Middlewares ab und leitet den User zur Keycloak-Login-Seite weiter. Die `statusRewrites` Konfiguration (Traefik >= 3.4) schreibt den 401 auf 302 um, damit der Browser dem `Location`-Header folgt. Ohne `statusRewrites` würde der Browser "Found." als Text anzeigen statt automatisch weiterzuleiten.

**Reihenfolge:** `oauth2-errors` muss in der Chain **vor** `require-*` stehen, da die `errors` Middleware nur Antworten von Middlewares abfängt, die **nach** ihr in der Chain kommen.

## Konfiguration neuer Services

Für jeden Service mit OAuth2-Middleware muss die entsprechende Chain als Traefik Middleware im Nomad Job aktiviert werden (z.B. `public-admin-chain-v2@file`). Zusätzlich muss eine OAuth2 Callback-Route in der Traefik Dynamic Config existieren.

Beispiele für die Verwendung der Chains stehen in der [Security-Dokumentation](../security/index.md).

## Konfigurationsdateien

- **Traefik Dynamic Config:** `/nfs/docker/traefik/configurations/config.yml` (auf vm-proxy-dns-01, wird live reloaded)
- **OAuth2-Proxy:** `/home/sam/docker-compose.yml` (auf vm-proxy-dns-01)
- **Traefik Static Config:** `/nfs/docker/traefik/traefik.yml` (auf vm-proxy-dns-01)

## Verwandte Seiten

- [Sicherheit](../security/index.md) -- Gesamte Security-Architektur mit Keycloak und OAuth2
- [CrowdSec](../crowdsec/index.md) -- Intrusion Detection als erste Middleware-Stufe
- [Nomad Job-Übersicht](../nomad/index.md) -- Jobs die diese Middleware Chains nutzen

---
*Aktualisiert: 21.02.2026 (v1 → v2 Migration)*
