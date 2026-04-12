---
title: Authentik
description: Identity Provider für SSO, ForwardAuth und OIDC im Homelab
tags:
  - identity
  - security
  - authentik
---

# Authentik

Authentik ist der zentrale Identity Provider des Homelabs. Alle Services, die eine Authentifizierung benötigen, delegieren diese entweder via ForwardAuth (Traefik-Integration) oder über OIDC (native App-Integration) an Authentik.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [auth.ackermannprivat.ch](https://auth.ackermannprivat.ch) |
| Deployment | Nomad Job [`identity/authentik.nomad`](https://gitea.ackermannprivat.ch/PRIVAT/infra/src/branch/main/nomad-jobs/identity/authentik.nomad) |
| Auth | Eigenständig (kein ForwardAuth auf der Login-Seite selbst) |
| Storage | PostgreSQL (`postgres.service.consul`, Datenbank `authentik`) |
| Secrets | Vault (`kv/data/authentik`, `kv/data/authentik-outpost`) |

Diese Seite deckt Rolle, Architektur und Komponenten ab. Details zu Flows, Policies, OIDC-Providern und UI-Anpassungen stehen in [Referenz](./referenz.md). Betriebs-Konzepte wie Recovery-Layer, Breakglass-Account und Alerting in [Betrieb](./betrieb.md).

## Rolle im Stack

Authentik ist der zentrale Identity Provider des Homelabs. Er ersetzt die frühere Kombination aus Keycloak und oauth2-proxy. Alle Services, die eine Authentifizierung benötigen, delegieren diese entweder via ForwardAuth (Traefik-Integration) oder über OIDC (native App-Integration) an Authentik.

Neben dem reinen Login übernimmt Authentik im Homelab auch Passwort-Recovery per Mail, Multi-Faktor-Erzwingung für Admin-Accounts, Passwordless-Login mit Passkeys und einen dedizierten LDAP-Kanal für Jellyfin.

## Architektur

```d2
direction: right

Zugriff: Zugriff von aussen {
  style.stroke-dash: 4
  User: Benutzer
}

Traefik: Traefik (VIP) {
  style.stroke-dash: 4
  TR: Reverse Proxy
  FWD: ForwardAuth Middleware (intern-auth / public-auth)
}

Authentik: Authentik (Nomad Job) {
  style.stroke-dash: 4
  AK: Authentik Server { tooltip: "Web UI, API, Flows" }
  WRK: Authentik Worker { tooltip: "Events, Mail, Tasks" }
  PROXY: Proxy Outpost { tooltip: "ForwardAuth Backend" }
  LDAP_OUT: LDAP Outpost { tooltip: "LDAPS für Jellyfin" }
}

Backend: Backend-Services {
  style.stroke-dash: 4
  SVC: Geschuetzte Services (ForwardAuth)
  OIDC: OIDC-Services (Grafana, Gitea, Proxmox, ...)
  JELLY: Jellyfin
}

TG: Telegram Relay {
  style.stroke-dash: 4
  REL: telegram-relay.service.consul
}

PG: PostgreSQL (postgres.service.consul) { shape: cylinder }
SMTP: SMTP Relay (smtp.service.consul) { shape: cylinder }

Zugriff.User -> Traefik.TR
Traefik.TR -> Traefik.FWD
Traefik.FWD -> Authentik.PROXY: ForwardAuth Check { style.stroke-dash: 5 }
Authentik.PROXY -> Authentik.AK
Authentik.AK -> Authentik.WRK
Authentik.AK -> PG
Traefik.FWD -> Backend.SVC: Zugriff erlaubt
Backend.OIDC -> Authentik.AK: OIDC Discovery { style.stroke-dash: 5 }
Backend.JELLY -> Authentik.LDAP_OUT: LDAP Bind { style.stroke-dash: 5 }
Authentik.WRK -> SMTP: Recovery Mail { style.stroke-dash: 5 }
Authentik.WRK -> TG.REL: Security Alerts { style.stroke-dash: 5 }
```

## Komponenten

Der Nomad Job `authentik` läuft als einzelne Gruppe mit vier Tasks auf `vm-nomad-client-05` oder `vm-nomad-client-06` (Affinity auf client-06).

| Task | Image | Zweck |
| :--- | :--- | :--- |
| `server` | `ghcr.io/goauthentik/server` | Hauptprozess, API, Login-Flows, Event-Pipeline |
| `worker` | `ghcr.io/goauthentik/server` | Background-Tasks (Zertifikate, E-Mail, Events) |
| `proxy` | `ghcr.io/goauthentik/proxy` | Proxy Outpost für Traefik ForwardAuth |
| `ldap` | `ghcr.io/goauthentik/ldap` | LDAP Outpost für Jellyfin |

Die Proxy- und LDAP-Outposts sind mit festen Ports registriert, damit Traefik bzw. Jellyfin einen stabilen Endpoint haben. Ressourcen, Constraints und Env-Vars stehen direkt im Nomad-Job.

## Integration mit Traefik

- **ForwardAuth-Middleware** -- jeder Request an geschützte Services wird über den Proxy Outpost geprüft. Ohne Login leitet der Outpost zum Authentik-Flow weiter
- **Callback-Route** `auth-routes.yml` (Priority 1000) fängt den Authentik-Callback-Pfad ab, bevor Traefik den Request an den eigentlichen Service routet
- **Middleware-Chain** auf der Login-Seite selbst: `login-ratelimit@file,crowdsec@file,secure-headers@file` -- keine IP-Allowlist, sonst scheitert externer Zugriff nach ForwardAuth-Redirect

::: warning Keine IP-Allowlist auf der Authentik-Login-Route
`intern-noauth@file` würde alle nicht-privaten IPs blockieren. Da externe Clients nach dem ForwardAuth-Redirect auf die Authentik-Login-Seite weitergeleitet werden, wäre der Login von ausserhalb des lokalen Netzes nicht möglich. Die Absicherung erfolgt stattdessen über CrowdSec (IP-Blocking), die Authentik Reputation Policy (Username- und IP-basiert) und `secure-headers`.
:::

## Sicherheit auf einen Blick

- **MFA-Zwang für Admins** -- Mitglieder von `admin` und `authentik Admins` sowie alle Superuser müssen TOTP oder Passkey registrieren. Non-Admins loggen weiterhin nur mit Passwort ein
- **Password Policy** -- mindestens 12 Zeichen, zxcvbn-Score ≥ 3, gebunden an alle Password-Write-Stages
- **Reputation Policy** -- Threshold −3 auf Username und IP, gebunden an Password-Stages (Auth + LDAP) sowie an Recovery-Identification und MFA-Validate
- **Recovery-Flow** aktiv mit Link auf der Login-Seite, Mail via globalem SMTP
- **Passwordless-Flow** (WebAuthn, `user_verification=required`, `resident_key=required`)
- **Alerting** via Telegram-Relay für `login_failed`, `policy_exception`, `suspicious_request`, `password_set`, `configuration_error`

Details und Mechanik: siehe [Referenz](./referenz.md) -- Betriebs-Konzepte (Recovery-Layer, Breakglass, Rollback) siehe [Betrieb](./betrieb.md).

## Verwandte Seiten

- [Authentik Referenz](./referenz.md) -- Flows, Policies, OIDC-Provider, CSS
- [Authentik Betrieb](./betrieb.md) -- Recovery, Breakglass, Alerting-Kette
- [Telegram Bots](../monitoring/telegram-bots.md) -- Alert-Transport via Relay
- [Traefik Middleware Chains](../traefik/referenz.md) -- ForwardAuth und Rate-Limits
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking als erste Middleware-Stufe
- [Security](../security/index.md) -- Sicherheitskonzept Übersicht
- [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) -- Abhängigkeits-Übersicht
