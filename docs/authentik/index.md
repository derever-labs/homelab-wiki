---
title: Authentik
description: Identity Provider für SSO, ForwardAuth und OIDC im Homelab
tags:
  - identity
  - security
  - authentik
---

# Authentik

| Attribut | Wert |
| :--- | :--- |
| **Status** | Aktiv |
| **URL** | [auth.ackermannprivat.ch](https://auth.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`identity/authentik.nomad`) |
| **Auth** | Eigenständig (kein ForwardAuth auf der Login-Seite selbst) |
| **Storage** | PostgreSQL (`postgres.service.consul`, Datenbank `authentik`) |
| **Secrets** | Vault (`kv/data/authentik`, `kv/data/authentik-outpost`) |

## Rolle im Stack

Authentik ist der zentrale Identity Provider des Homelabs. Er ersetzt die frühere Kombination aus Keycloak und oauth2-proxy. Alle Services, die eine Authentifizierung benötigen, delegieren diese entweder via ForwardAuth (Traefik-Integration) oder über OIDC (native App-Integration) an Authentik.

## Architektur

```mermaid
flowchart LR
    subgraph Zugriff["Zugriff von aussen"]
        User:::entry["Benutzer"]
    end

    subgraph Traefik["Traefik (10.0.2.20 VIP)"]
        TR:::svc["Reverse Proxy"]
        FWD:::svc["ForwardAuth Middleware\n(intern-auth / public-auth)"]
    end

    subgraph Authentik["Authentik (Nomad Job)"]
        AK:::accent["Authentik Server\n(:9000)"]
        WRK:::accent["Authentik Worker"]
        PROXY:::accent["Proxy Outpost\n(:9010 statisch)"]
        LDAP_OUT:::accent["LDAP Outpost\n(:3389 statisch)"]
    end

    subgraph Backend["Backend-Services"]
        SVC:::svc["Geschützte Services\n(ForwardAuth)"]
        OIDC:::svc["OIDC-Services\n(Grafana, Gitea)"]
    end

    PG:::db["PostgreSQL\n(postgres.service.consul)"]

    User --> TR
    TR --> FWD
    FWD -.->|"ForwardAuth Check"| PROXY
    PROXY --> AK
    AK --> WRK
    AK --> PG
    FWD -->|"Zugriff erlaubt"| SVC
    OIDC -.->|"OIDC Discovery"| AK

    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
```

## Komponenten

Der Nomad Job `authentik` läuft als einzelne Gruppe mit vier Tasks auf `vm-nomad-client-05` oder `vm-nomad-client-06` (Affinity auf client-06).

| Task | Image | Ports | Zweck |
| :--- | :--- | :--- | :--- |
| `server` | `ghcr.io/goauthentik/server` | 9000 (http), 9443 (https), 9300 (metrics) | Authentik Hauptprozess, API, Login-Flows |
| `worker` | `ghcr.io/goauthentik/server` | -- | Background-Tasks (Zertifikate, E-Mail, Events) |
| `proxy` | `ghcr.io/goauthentik/proxy` | 9010 (statisch), 9301 (metrics) | Proxy Outpost für Traefik ForwardAuth |
| `ldap` | `ghcr.io/goauthentik/ldap` | 3389 (statisch), 9303 (metrics) | LDAP Outpost für Jellyfin |

### Server

Läuft mit `args = ["server"]`. Stellt die Authentik-UI, die API und alle Login-Flows bereit. Consul-Service `authentik` registriert den HTTP-Port für Traefik.

### Worker

Läuft mit `args = ["worker"]`. Teilt die gleiche Konfiguration (Vault-Secrets, DB-Verbindung) wie der Server und übernimmt asynchrone Aufgaben: Zertifikatserneuerung, E-Mail-Versand, Event-Verarbeitung.

### Proxy Outpost (ForwardAuth für Traefik)

Der Proxy Outpost verbindet sich beim Start zum Authentik Server (`AUTHENTIK_HOST`) und holt die Outpost-Konfiguration. Er lauscht auf Port 9010 (statisch) und antwortet auf ForwardAuth-Anfragen von Traefik. Der Consul-Service `authentik-proxy` macht ihn für Traefik via `auth-routes.yml` erreichbar.

Der Token für die Authentik-API wird aus `kv/data/authentik-outpost` → `proxy_token` gelesen.

### LDAP Outpost (für Jellyfin)

Stellt einen LDAP-kompatiblen Endpunkt auf Port 3389 (statisch) bereit. Jellyfin authentifiziert sich gegen diesen Port, anstatt direkt OIDC zu nutzen. Der Token kommt aus `kv/data/authentik-outpost` → `ldap_token`.

Der LDAP Provider (`homelab-ldap`) ist für Performance optimiert:

- **Bind Mode:** `cached` -- nach dem ersten erfolgreichen Login wird das Ergebnis im Outpost-Memory gecacht. Nachfolgende Logins desselben Users brauchen <5ms statt ~2s
- **Search Mode:** `cached` -- alle User/Groups werden periodisch vom Authentik-Server geladen und im Outpost-RAM gehalten
- **MFA:** deaktiviert (der dedizierte `ldap-authentication-flow` hat keine MFA-Stage)
- **Bind Flow:** `ldap-authentication-flow` (nur Identification + Password + Login, kein MFA, keine Reputation)

::: warning Cache-Invalidierung
Nach einem Outpost-Neustart (z.B. Redeployment) ist der Bind-Cache leer. Der erste Login pro User durchläuft den vollen Authentik-Flow (~2s). Passwortänderungen werden erst nach Ablauf der Session im Cache wirksam.
:::

## Flows

| Flow | Zweck |
| :--- | :--- |
| Default Authentication | Login mit E-Mail/Passwort (Single-Page, inkl. MFA) |
| `ldap-authentication-flow` | Minimaler Flow nur für LDAP-Binds (Password + Login, kein MFA) |
| Default Invalidation | Logout (Session-Invalidierung) |

Die Flows sind über die Authentik-UI konfigurierbar. Der Authorization Flow (OIDC Consent) ist auf "implicit consent" gesetzt -- Benutzer werden nicht bei jedem OIDC-Login nach Erlaubnis gefragt.

### Login-Flow Anpassungen

Der Default Authentication Flow wurde für Passwortmanager-Kompatibilität optimiert:

- **Single-Page Login:** Die Password Stage ist direkt in der Identification Stage eingebunden (`password_stage` Feld), sodass E-Mail und Passwort auf einer Seite erscheinen
- **Nur E-Mail:** `user_fields` ist auf `["email"]` gesetzt (kein Username-Login)
- **Custom CSS:** Über die Brand-Einstellungen (`branding_custom_css`) wird das Login-Formular minimalistisch gestaltet -- Labels, Sprachauswahl, Footer und Pflichtfeld-Sternchen sind ausgeblendet, Placeholder-Texte per CSS-Trick auf "E-Mail" und "Passwort" vereinfacht
- **CSS-Backup:** `PRIVAT/infra/authentik-custom-css.txt`

## Integration mit Traefik

### ForwardAuth-Middleware

Traefik sendet jeden Request an den Proxy Outpost. Ist der Benutzer nicht eingeloggt, leitet der Outpost zum Login-Flow weiter. Nach erfolgreichem Login wird der ursprüngliche Request mit gesetzten `X-authentik-*` Headern durchgelassen.

Die Middleware-Chains `intern-auth@file` und `public-auth@file` binden die ForwardAuth-Middleware ein. Details: [Traefik Middleware Chains](../traefik/referenz.md)

### Callback-Route (auth-routes.yml, Priority 1000)

Die Datei `auth-routes.yml` definiert eine Traefik-Route mit hoher Priorität (1000) für den Authentik-Callback-Pfad (`/outpost.goauthentik.io/`). Diese Route muss höher priorisiert sein als die Service-Routen, damit Authentik den Login-Redirect abfangen kann, bevor Traefik den Request an den eigentlichen Service weiterleitet.

Authentik selbst ist hinter `login-ratelimit@file,crowdsec@file,secure-headers@file` -- die Login-Seite muss öffentlich erreichbar sein, da externe Clients (Tailscale, Mobilnetz) nach dem ForwardAuth-Redirect auf `auth.ackermannprivat.ch` landen. Eine IP-Allowlist würde diesen Redirect blockieren.

::: warning Keine IP-Allowlist auf der Authentik-Login-Route
`intern-noauth@file` blockiert alle nicht-privaten IPs. Da externe Clients nach dem ForwardAuth-Redirect auf die Authentik-Login-Seite weitergeleitet werden, wäre der Login von ausserhalb des lokalen Netzes nicht möglich. Die Absicherung erfolgt stattdessen über CrowdSec (IP-Blocking) und `secure-headers`.
:::

## OIDC Providers

Services mit nativer OIDC-Unterstützung werden direkt als Provider-Client in Authentik konfiguriert. Die App übernimmt den Login-Dialog selbst und tauscht Token mit Authentik aus. Die Traefik-Chain ist in diesen Fällen `intern-noauth@file`.

| Service | Methode | Traefik Chain | Besonderheiten |
| :--- | :--- | :--- | :--- |
| Grafana | Natives OIDC | `intern-noauth@file` | `GF_AUTH_OAUTH_ALLOW_INSECURE_EMAIL_LOOKUP=true` für Account-Linking |
| Gitea | Natives OIDC | `intern-noauth@file` | Auth-Source via `gitea admin auth update-oauth` konfiguriert |
| Open-WebUI | Natives OIDC | `intern-noauth@file` | `OAUTH_MERGE_ACCOUNTS_BY_EMAIL=true` für Account-Linking |
| Paperless | Natives OIDC | `intern-noauth@file` | OIDC via `allauth.socialaccount.providers.openid_connect` |
| Proxmox VE | Natives OIDC | -- (direkt :8006) | OpenID Realm `authentik`, ACME-Certs via Cloudflare DNS |
| Authentik selbst | -- | `login-ratelimit@file,crowdsec@file,secure-headers@file` | |
| Alle anderen | ForwardAuth via Proxy Outpost | `intern-auth@file` oder `public-auth@file` | |

### OIDC Provider-Konfiguration

Alle OIDC-Provider verwenden:
- **Signing Key:** Gemeinsamer Authentik-Schlüssel (kein `None`)
- **Sub Mode:** `user_email` (nicht `hashed_user_id`) -- damit Services den User per Email identifizieren
- **Invalidation Flow:** Default Invalidation Flow
- **Property Mappings:** `profile`, `openid`, `email`

### Proxmox SSO

Proxmox ist als OpenID-Realm direkt auf den PVE-Nodes konfiguriert (kein Traefik):

- **Realm:** `authentik` (Default-Realm)
- **Issuer URL:** `https://auth.ackermannprivat.ch/application/o/proxmox/`
- **Username Claim:** `email`
- **Autocreate:** aktiviert
- **Zugriff:** `https://pve00/01/02.ackermannprivat.ch:8006` (ACME-Certs via Cloudflare DNS-Challenge)
- **Admin-User:** `samuel@ackermannprivat.ch@authentik` mit Rolle `Administrator`

## Benutzerverwaltung

Authentik verwaltet Benutzer intern. Passwort-Änderungen und Gruppen-Management erfolgen über die Authentik-UI.

| Gruppe | Zugriff |
| :--- | :--- |
| `admin` | Voller Zugriff auf alle Services |
| `family` | Familien-Zugriff (Jellyfin, Jellyseerr etc.) |

## Performance-Tuning

Der Authentik-Server hat folgende Performance-Optimierungen:

- **CPU:** 2000 MHz (Server), 750 MHz (Worker) -- Flow-Execution ist CPU-bound
- **Gunicorn:** 3 Workers, 4 Threads (`AUTHENTIK_WEB__WORKERS=3`, `AUTHENTIK_WEB__THREADS=4`)
- **Worker:** 4 Threads (`AUTHENTIK_WORKER__THREADS=4`)
- **Cache-Timeouts:** 600s für Flows und Policies (`AUTHENTIK_CACHE__TIMEOUT=600`)
- **GeoIP:** deaktiviert (Pfade auf nicht-existierende Dateien gesetzt, spart Startup-Zeit und Event-Overhead)

PostgreSQL-seitig:

- **JIT:** deaktiviert (`ALTER SYSTEM SET jit = off`) -- JIT-Kompilierung schadet bei kleinen OLTP-Queries
- **Autovacuum:** aggressiver für `authentik_core_session`, `django_postgres_cache_cacheentry`, `django_channels_postgres_message` (vacuum_scale_factor=0.05)

::: info Kein Redis seit Authentik 2025.10
Authentik hat Redis in Version 2025.10 vollständig entfernt. Cache, Sessions, WebSockets und Task-Queue laufen über PostgreSQL. Die `AUTHENTIK_REDIS__*` Variablen existieren nicht mehr.
:::

## Bootstrap (Ersteinrichtung)

::: info Reihenfolge bei Erstdeploy
1. Vault-Secrets anlegen (`kv/authentik`: `secret_key`, `db_password`)
2. PostgreSQL-Datenbank und User erstellen
3. Nur Server und Worker deployen (Outpost-Tasks auskommentieren)
4. In der Authentik-UI: Outposts erstellen und Tokens kopieren
5. Tokens in Vault schreiben (`kv/authentik-outpost`: `proxy_token`, `ldap_token`)
6. Job erneut deployen -- alle vier Tasks starten
:::

## Verwandte Seiten

- [Traefik Middleware Chains](../traefik/referenz.md) -- ForwardAuth-Konfiguration und Chain-Übersicht
- [Traefik Reverse Proxy](../traefik/index.md) -- Reverse Proxy Architektur
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking als erste Middleware-Stufe
- [Security](../security/index.md) -- Sicherheitskonzept Übersicht
- [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) -- Abhängigkeits-Übersicht
