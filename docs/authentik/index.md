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

Diese Seite deckt Rolle, Architektur und Komponenten ab. Details zu Flows, Policies, OIDC-Providern und UI-Anpassungen stehen in [Referenz](./referenz.md), Gruppen, Bindings und Tier-Mapping in [Gruppen und Bindings](./gruppen-bindings.md). Recovery-Layer und Breakglass-Account in [Recovery und Breakglass](./recovery.md), weitere Betriebs-Konzepte und Alerting in [Betrieb](./betrieb.md).

## Rolle im Stack

Er ersetzt die frühere Kombination aus Keycloak und oauth2-proxy.

Neben dem reinen Login übernimmt Authentik im Homelab auch Passwort-Recovery per Mail, Multi-Faktor-Erzwingung für Admin-Accounts, Passwordless-Login mit Passkeys via WebAuthn Conditional UI (Autofill) und einen dedizierten LDAP-Kanal für Jellyfin.

## Architektur

**Leitfragen:** Über welche drei Wege authentifizieren Services gegen Authentik (ForwardAuth, OIDC, LDAP)? Welche Kanten hängen an Traefik, und was fällt mit Traefik aus?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: right

User: Benutzer {
  class: node
  tooltip: "Browser -- intern und extern; jeder Web-Zugriff läuft über Traefik"
}

Traefik: Traefik {
  class: node
  tooltip: "HA-Paar hinter VIP -- Router aus Consul-Tags, ForwardAuth-Middleware authentik-forward-auth, Callback-Route Priorität 1000"
}

Authentik: Authentik-Job (4 Tasks) {
  class: container

  AK: Server {
    class: node
    tooltip: "Login-Flows, Policy Engine, OIDC-Provider, API -- Consul-Service authentik"
  }
  WRK: Worker {
    class: node
    tooltip: "Background-Tasks, Notification-Mails, Blueprint-Reconcile -- kein eigener Port"
  }
  PROXY: Proxy-Outpost {
    class: node
    tooltip: "authentik-proxy.service.consul:9010 -- prüft Sessions lokal gegen Session-Files in /dev/shm"
  }
  LDAP: LDAP-Outpost {
    class: node
    tooltip: "authentik-ldap.service.consul:3389 -- Bind- und Search-Cache im RAM"
  }
}

Apps: Backend-Services {
  class: container

  FA: ForwardAuth-Apps {
    class: node
    tooltip: "Nomad UI, Consul UI, yt-dlp etc. -- Chains intern-auth und public-auth"
  }
  OIDC: OIDC-Apps {
    class: node
    tooltip: "Grafana, Gitea, Paperless, n8n, Open-WebUI, Proxmox -- App zeigt eigenen Login"
  }
  JF: Jellyfin {
    class: node
    tooltip: "watch.ackermannprivat.ch -- kein ForwardAuth, prüft Logins selbst via LDAP"
  }
}

PG: PostgreSQL {
  class: node
  shape: cylinder
  tooltip: "postgres.service.consul -- Datenbank authentik"
}

SMTP: SMTP-Relay {
  class: node
  tooltip: "smtp.service.consul Port 25"
}

TG: Telegram-Relay {
  class: node
  tooltip: "telegram-relay.service.consul -- Bot-Token lebt im Relay, nicht in der Authentik-DB"
}

User -> Traefik: "HTTPS --\nApp-Aufrufe und Login" { style.stroke: "#2563eb" }

Traefik -> Authentik.PROXY: "ForwardAuth-Subrequest\npro Request -- 200 oder 302" { style.stroke: "#7c3aed" }
Traefik -> Authentik.AK: "Login-Flows, API,\nOIDC-Endpoints" { style.stroke: "#7c3aed" }
Traefik -> Apps.FA: "nach Outpost-200 -- mit\nX-authentik-Headern" { style.stroke: "#16a34a" }
Traefik -> Apps.OIDC: "Login macht die App\nselbst via OIDC" { style.stroke: "#16a34a" }
Traefik -> Apps.JF: "ohne ForwardAuth\n(public-noauth)" { style.stroke: "#16a34a" }

Apps.OIDC -> Traefik: "Backchannel -- Token\nund Userinfo (OIDC)" { style.stroke: "#7c3aed" }
Apps.JF -> Authentik.LDAP: "LDAP Simple Bind :3389\nbei jedem Jellyfin-Login" { style.stroke: "#7c3aed" }

Authentik.LDAP -> Traefik: "Flow-Execute bei Cache-Miss\nvia auth.ackermannprivat.ch" { style.stroke: "#ea580c" }
Authentik.LDAP -> Traefik: "Kontrollkanal --\ngleicher Weg" {
  style.stroke: "#ea580c"
  style.stroke-dash: 3
}

Authentik.PROXY -> Authentik.AK: "Kontrollkanal und Code-Exchange --\ndirekt via Node-IP" {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}

Authentik.AK -> PG: "SQL -- User, Flows, Sessions,\nTask-Queue (kein Redis)" { style.stroke: "#854d0e" }
Authentik.WRK -> PG: "SQL -- Task-Queue,\nBlueprint-Reconcile" {
  style.stroke: "#854d0e"
  style.stroke-dash: 3
}
Authentik.WRK -> SMTP: "alle Mails via SMTP --\nFlow und Notification" {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}
Authentik.WRK -> TG: "Webhook --\nSecurity-Events" {
  style.stroke: "#6b7280"
  style.stroke-dash: 3
}
```

**Lesehilfe:**

1. Alles läuft über Traefik: Benutzer-Logins, der OIDC-Backchannel und sogar der Kontrollkanal des LDAP-Outposts. Einzig der Proxy-Outpost spricht den Server direkt über die Node-IP an ([Komponenten](#komponenten)).
2. ForwardAuth: Traefik fragt bei jedem Request den Proxy-Outpost. Die Antwort ist 200 mit Identitäts-Headern oder 302 zur Login-Seite. Die vollständige Kette zeigt der [Login-Ablauf ohne Session](#login-ablauf-ohne-session).
3. OIDC-Apps zeigen ihren eigenen Login und tauschen Code gegen Token über auth.ackermannprivat.ch ([OIDC Providers](./referenz.md#oidc-providers)).
4. Jellyfin prüft Logins selbst per LDAP Simple Bind gegen den LDAP-Outpost ([LDAP im Homelab](../ldap/index.md)).
5. Der LDAP-Outpost erreicht den Server nur über Traefik. Ist Traefik down, funktionieren nur noch gecachte Jellyfin-Logins, Erstlogins scheitern ([LDAP Authentication Flow](./referenz.md#ldap-authentication-flow)).
6. Ist der Proxy-Outpost nicht erreichbar, liefert ForwardAuth einen 500 und Traefik zeigt die Wartungsseite ([Traefik-Referenz](../traefik/referenz.md#authentik-forwardauth)).
7. PostgreSQL trägt alles: User, Flows, Sessions und seit dem Redis-Aus auch die Task-Queue. Ohne PG steht Authentik ([Performance-Konzept](./betrieb.md#performance-konzept)).
8. Alle Mails verschickt der Worker über den SMTP-Relay. Flow-Mails (Recovery) rendert der Server und übergibt sie via Task-Queue. Security-Events gehen als Webhook an den Telegram-Relay ([Alerting und Events](./referenz.md#alerting-und-events)).

## Komponenten

Der Nomad Job `authentik` läuft als einzelne Gruppe mit vier Tasks auf `vm-nomad-client-05` oder `vm-nomad-client-06` (Affinity auf client-06).

| Task | Zweck |
| :--- | :--- |
| `server` | Hauptprozess, API, Login-Flows, Event-Pipeline |
| `worker` | Background-Tasks (Zertifikate, E-Mail, Events) |
| `proxy` | Proxy Outpost für Traefik ForwardAuth |
| `ldap` | LDAP Outpost für Jellyfin |

Die Proxy- und LDAP-Outposts sind mit festen Ports registriert, damit Traefik bzw. Jellyfin einen stabilen Endpoint haben. Ressourcen, Constraints und Env-Vars stehen direkt im Nomad-Job.

## Integration mit Traefik

- **ForwardAuth-Middleware** -- jeder Request an geschützte Services wird über den Proxy Outpost geprüft. Ohne Login leitet der Outpost zum Authentik-Flow weiter
- **Callback-Route** `auth-routes.yml` (Priority 1000) fängt den Authentik-Callback-Pfad ab, bevor Traefik den Request an den eigentlichen Service routet
- **Middleware-Chain** auf der Login-Seite selbst: `login-ratelimit@file,crowdsec@file,secure-headers@file` -- keine IP-Allowlist, sonst scheitert externer Zugriff nach ForwardAuth-Redirect

### Login-Ablauf ohne Session

**Leitfragen:** Was passiert bei einem Request auf einen ForwardAuth-Service ohne Session? Wer setzt wann das Session-Cookie, und wo wird es danach geprüft?

```d2
shape: sequence_diagram

browser: Browser
traefik: Traefik
outpost: Proxy-Outpost
server: Authentik-Server
app: "App (z.B. Nomad UI)"

browser -> traefik: "1. GET app.ackermannprivat.ch\nohne gültiges Session-Cookie"
traefik -> outpost: "2. ForwardAuth-Subrequest\nGET /outpost.goauthentik.io/auth/traefik"
outpost -> browser: "3. 302 zur Login-Seite --\nim Outpost existiert kein Session-File"
browser -> server: "4. GET auth.ackermannprivat.ch -- Traefik-Router authentik:\nLogin-Flow mit E-Mail und Passwort oder Passkey, MFA für Admins"
server -> browser: "5. 302 zurück auf die App-Domain --\nPfad /outpost.goauthentik.io/callback mit Authorization-Code"
browser -> outpost: "6. GET Callback auf der App-Domain -- die Callback-Route\nPriorität 1000 fängt den Pfad ab, bevor die App ihn sieht"
outpost -> server: "7. Code-Exchange --\ndirekt via Node-IP, ohne Traefik"
outpost -> browser: "8. Set-Cookie und 302 auf die Original-URL --\nSession-File liegt jetzt in /dev/shm"
browser -> traefik: "9. GET Original-URL\nmit Session-Cookie"
traefik -> outpost: "10. ForwardAuth-Subrequest --\njetzt 200 mit X-authentik-Headern"
traefik -> app: "11. Request ans Backend -- mit Identitäts-Headern\nfür E-Mail, Gruppen und Username"
```

**Lesehilfe:**

1. Initiator ist immer der Browser. Traefik entscheidet nichts selbst, es fragt pro Request den Proxy-Outpost (Schritte 2 und 10, [Traefik-Referenz](../traefik/referenz.md#authentik-forwardauth)).
2. Entschieden wird im Outpost: Session-Files liegen in /dev/shm, der Authentik-Server ist nur beim eigentlichen Login beteiligt (Schritte 4 bis 7).
3. Die Callback-Route mit Priorität 1000 fängt /outpost.goauthentik.io/ auf jeder App-Domain ab, bevor die App den Request sieht (Schritt 6, [Traefik-Referenz](../traefik/referenz.md#authentik-callback)).
4. Ohne Session gibt es nie 401 oder 403, sondern immer den 302-Redirect zur Login-Seite (Schritt 3, [error-pages](../traefik/referenz.md#error-pages)).
5. Ausfall-Sicht: Outpost weg heisst ForwardAuth 500 und Wartungsseite. Server weg heisst keine neuen Logins, bestehende Sessions beantwortet der Outpost weiter mit 200 -- die Prüfung läuft rein lokal in /dev/shm, ohne Server-Roundtrip.
6. Nach Schritt 11 kennt das Backend die Identität nur über die X-authentik-Header ([Middleware Chains](../traefik/referenz.md#middleware-chains)).
7. Antworten laufen physisch ebenfalls über Traefik, das Diagramm kürzt die Rückwege (Schritte 3, 5 und 8) ab. Auch die Schritte 4 und 6 passieren Traefik, der Hop steht dort im Label.

::: warning Keine IP-Allowlist auf der Authentik-Login-Route
`intern-noauth@file` würde alle nicht-privaten IPs blockieren. Da externe Clients nach dem ForwardAuth-Redirect auf die Authentik-Login-Seite weitergeleitet werden, wäre der Login von ausserhalb des lokalen Netzes nicht möglich. Die Absicherung erfolgt stattdessen über CrowdSec (IP-Blocking), die Authentik Reputation Policy (Username- und IP-basiert) und `secure-headers`.
:::

## Sicherheit auf einen Blick

- **3-Tier-Zugriffskontrolle** -- `admin` (alles) > `family` (family-Tier + guest-Tier via Multi-Binding) > `guest` (guest-Tier). Jede App hat eine explizite Gruppen-Bindung. Ohne Bindung = offen (Authentik-Default fail-open) -- deshalb werden alle 45 Apps deklarativ via [Blueprints](./gruppen-bindings.md#blueprint-quelle) zugeordnet. Ein Drift-Audit-Job überwacht täglich, dass keine neue App ohne Binding auftaucht
- **MFA-Zwang für Admins** -- Mitglieder von `admin` und `authentik Admins` sowie alle Superuser müssen TOTP oder Passkey registrieren. Admins, die sich via Passkey einloggen, überspringen die MFA-Stage (Passkey zählt als Besitz + User-Verification). Non-Admins loggen weiterhin nur mit Passwort ein
- **Password Policy** -- mindestens 12 Zeichen, zxcvbn-Score ≥ 3, gebunden an alle Password-Write-Stages
- **Reputation Policy** -- Threshold −3 auf Username und IP, gebunden an Password-Stages (Auth + LDAP) sowie an Recovery-Identification und MFA-Validate
- **Recovery-Flow** aktiv mit Link auf der Login-Seite, Mail via globalem SMTP
- **Passwordless-Login** -- WebAuthn Conditional UI (Autofill) im normalen Login-Flow; dedizierter `passwordless-flow` als Fallback via direkter URL; `user_verification=required`, `resident_key=required`
- **Alerting** via Telegram-Relay für `login_failed`, `policy_exception`, `suspicious_request`, `password_set`, `configuration_error`

Details und Mechanik: siehe [Referenz](./referenz.md) -- Recovery-Layer, Breakglass und Rollback siehe [Recovery und Breakglass](./recovery.md).

## Verwandte Seiten

- [Authentik Referenz](./referenz.md) -- Flows, Policies, OIDC-Provider, CSS
- [Authentik Gruppen und Bindings](./gruppen-bindings.md) -- Gruppen, Bindings, Tier-Mapping
- [Authentik Recovery und Breakglass](./recovery.md) -- Recovery-Layer, Breakglass, Benutzer-Recovery-Flow
- [Authentik Betrieb](./betrieb.md) -- Alerting-Kette, Rotation, Performance
- [Telegram Bots](../monitoring/telegram-bots.md) -- Alert-Transport via Relay
- [Traefik Middleware Chains](../traefik/referenz.md) -- ForwardAuth und Rate-Limits
- [CrowdSec](../crowdsec/index.md) -- IP-Blocking als erste Middleware-Stufe
- [Security](../security/index.md) -- Sicherheitskonzept Übersicht
- [Service-Abhängigkeiten](../_querschnitt/service-abhaengigkeiten.md) -- Abhängigkeits-Übersicht
