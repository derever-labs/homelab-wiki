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
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: right

Zugriff: Zugriff {
  class: container

  User: Benutzer {
    class: node
    tooltip: "Interner oder externer Zugriff auf geschuetzte Services"
  }
}

Traefik: Traefik HA {
  class: container

  TR: Reverse Proxy {
    class: node
    tooltip: "VIP 10.0.2.20 | Empfaengt alle eingehenden Requests"
  }
  FWD: ForwardAuth Middleware {
    class: node
    tooltip: "intern-auth / public-auth | Prueft ob Session gueltig ist"
  }
}

Authentik: Authentik (Nomad Job) {
  class: container

  AK: Authentik Server {
    class: node
    tooltip: "Web UI, API, Login-Flows, Event-Pipeline"
  }
  WRK: Authentik Worker {
    class: node
    tooltip: "Background-Tasks: Zertifikate, E-Mail, Events"
  }
  PROXY: Proxy Outpost {
    class: node
    tooltip: "ForwardAuth Backend fuer Traefik-Integration"
  }
  LDAP_OUT: LDAP Outpost {
    class: node
    tooltip: "LDAPS Port 636 fuer Jellyfin-Authentifizierung"
  }
}

Backend: Backend-Services {
  class: container

  SVC: ForwardAuth-Services {
    class: node
    tooltip: "Grafana, Nomad UI, Consul UI etc. -- geschuetzt via Middleware-Chain"
  }
  OIDC: OIDC-Services {
    class: node
    tooltip: "Grafana, Gitea, Proxmox -- native OIDC-Integration"
  }
  JELLY: Jellyfin {
    class: node
    tooltip: "Medienserver -- LDAP-Authentifizierung"
  }
}

PG: PostgreSQL {
  class: node
  shape: cylinder
  tooltip: "postgres.service.consul | Datenbank authentik"
}

SMTP: SMTP Relay {
  class: node
  shape: cylinder
  tooltip: "smtp.service.consul | Recovery-Mails und Benachrichtigungen"
}

TG: Telegram Relay {
  class: node
  tooltip: "telegram-relay.service.consul | Security Alerts"
}

Zugriff.User -> Traefik.TR: HTTPS Request {
  style.stroke: "#2563eb"
}
Traefik.TR -> Traefik.FWD: Middleware-Chain {
  style.stroke: "#6b7280"
}
Traefik.FWD -> Authentik.PROXY: ForwardAuth Check {
  style.stroke: "#7c3aed"
  tooltip: "Traefik fragt Proxy Outpost ob Session gueltig ist"
}
Authentik.PROXY -> Authentik.AK: Session validieren {
  style.stroke: "#7c3aed"
}
Authentik.AK -> Authentik.WRK: Background Tasks {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}
Authentik.AK -> PG: Datenbank {
  style.stroke: "#854d0e"
  tooltip: "User-Daten, Flows, Policies, Sessions"
}
Traefik.FWD -> Backend.SVC: Zugriff erlaubt {
  style.stroke: "#16a34a"
  tooltip: "ForwardAuth erfolgreich, Request wird an Backend weitergeleitet"
}
Backend.OIDC -> Authentik.AK: OIDC Discovery {
  style.stroke: "#7c3aed"
  style.stroke-dash: 3
  tooltip: "Services holen Token via OpenID Connect"
}
Backend.JELLY -> Authentik.LDAP_OUT: LDAP Bind {
  style.stroke: "#7c3aed"
  style.stroke-dash: 3
  tooltip: "Jellyfin authentifiziert User via LDAP"
}
Authentik.WRK -> SMTP: Recovery Mail {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}
Authentik.WRK -> TG: Security Alerts {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
  tooltip: "login_failed, policy_exception, suspicious_request etc."
}
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
