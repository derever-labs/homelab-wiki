---
title: Zeiterfassung
description: Selbstgehostete Zeiterfassung mit solidtime, Kimai und automatischer Geofence-Steuerung via n8n
tags:
  - service
  - automation
  - nomad
  - zeiterfassung
---

# Zeiterfassung

Selbstgehostete Zeiterfassung als Ersatz für Toggl Track. Zwei Tools parallel im Einsatz, solidtime als Haupttool.

## Übersicht

**solidtime** (Haupttool):

| Attribut | Wert |
|----------|------|
| URL | [time.ackermannprivat.ch](https://time.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/solidtime.nomad` |
| Datenbank | PostgreSQL `solidtime` (Shared Cluster) |
| Storage | Redis Sidecar (ephemeral, Cache + Sessions) |
| Auth | Authentik ForwardAuth (`intern-auth`) |
| API | Bearer Token (Passport JWT) |

**Kimai** (Backup):

| Attribut | Wert |
|----------|------|
| URL | [kimai.ackermannprivat.ch](https://kimai.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job (siehe Nomad-Jobs-Referenz) |
| Datenbank | MariaDB 11 (Sidecar-Container) |
| Storage | Linstor CSI (`kimai-data`) für MariaDB, NFS für data/plugins |
| Auth | Authentik ForwardAuth (`intern-auth`) |
| API | API-Key (`X-AUTH-TOKEN`) |

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: right

iPhone: iPhone {
  style.stroke-dash: 4
  PWA: solidtime PWA { style.border-radius: 8 }
  SC1: "iOS Shortcut: Ankunft Horw" { style.border-radius: 8 }
  SC2: "iOS Shortcut: Verlassen Horw" { style.border-radius: 8 }
}

Traefik: "Traefik" {
  style.stroke-dash: 4
  tooltip: "10.0.2.20"
  R1: "Router: time.* (intern-auth)" { style.border-radius: 8 }
  R2: "Router: time.*/api (kein OAuth)" { style.border-radius: 8 }
  R3: "Router: n8n.*/webhook (kein OAuth)" { style.border-radius: 8 }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  ST: "solidtime (app, scheduler, worker, gotenberg)" { style.border-radius: 8 }
  KI: "Kimai (kimai + mariadb)" { style.border-radius: 8 }
  N8N: n8n { style.border-radius: 8 }
  PG: PostgreSQL { shape: cylinder; style.border-radius: 8 }
}

iPhone.PWA -> Traefik.R1: HTTPS
iPhone.SC1 -> Traefik.R3: GET /webhook/arbeit-start
iPhone.SC2 -> Traefik.R3: GET /webhook/arbeit-stop
Traefik.R1 -> Nomad.ST: Authentik ForwardAuth
Traefik.R2 -> Nomad.ST
Traefik.R3 -> Nomad.N8N
Nomad.N8N -> Traefik.R2: API: Timer Start/Stop
Nomad.ST -> Nomad.PG
Nomad.KI -> Nomad.KI: MariaDB Sidecar { style.stroke-dash: 5 }
```

## Rolle im Stack

solidtime und Kimai sind Endnutzer-Services hinter Traefik, das die externe TLS-Terminierung und das Routing übernimmt. Die UIs sind über Authentik ForwardAuth (`intern-auth`) abgesichert, während die API-Pfade die App-eigene Token-Auth nutzen. Daten liegen im Shared PostgreSQL Cluster (solidtime) bzw. einem MariaDB-Sidecar (Kimai); Secrets kommen aus Vault. n8n liefert als Automations-Schicht die Geofence- und Git-Commit-Anbindung.

## Geofence-Automation

Automatisches Starten und Stoppen des solidtime-Timers basierend auf dem Standort (Geofencing via iOS).

### Ablauf

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: right

classes: {
  iphone: { style: { border-radius: 8; stroke: "#1a73e8" } }
  n8n: { style: { border-radius: 8; stroke: "#e8710a" } }
  solid: { style: { border-radius: 8; stroke: "#188038" } }
  phase: { style: { border-radius: 8; stroke-dash: 4 } }
}

start: Ankunft Horw -- Timer starten {
  class: phase
  direction: down
  hook: "iPhone GET\n/webhook/arbeit-start" { class: iphone }
  post: "n8n POST time-entries\nstart=now, end=null" { class: n8n }
  ack: "solidtime:\nTimer-ID" { class: solid }
  resp: "n8n Response:\nstatus=started" { class: n8n }
  hook -> post -> ack -> resp
}

stop: Verlassen Horw -- Timer stoppen {
  class: phase
  direction: down
  hook: "iPhone GET\n/webhook/arbeit-stop" { class: iphone }
  find: "n8n GET time-entries\n?active=true" { class: n8n }
  cur: "solidtime:\nlaufender Timer" { class: solid }
  close: "n8n PUT time-entries\nend=now" { class: n8n }
  ack: "solidtime:\ngestoppter Timer" { class: solid }
  resp: "n8n Response:\nstatus=stopped + duration" { class: n8n }
  hook -> find -> cur -> close -> ack -> resp
}

start -> stop
```

### Einrichtung iOS

Zwei iOS-Kurzbefehle-Automationen rufen beim Ankommen bzw. Verlassen des Standorts Horw die Webhook-URLs `arbeit-start` und `arbeit-stop` ab (siehe API-Zugriff-Tabelle). Beide laufen ohne Bestätigung sofort.

### n8n Workflows

Zwei n8n-Workflows (`workflow-arbeit-start.json`, `workflow-arbeit-stop.json`, im Repo unter `configs/n8n/`) empfangen die Webhooks und starten bzw. stoppen den solidtime-Timer über ein HTTP-Header-Auth-Credential mit dem solidtime-Bearer-Token.

## Git-Commit Tracking

Automatische Zeiterfassung für private Repos basierend auf Git-Commits. Jeder Commit erzeugt einen 1h-Zeitblock (30 Min vor, 30 Min nach). Überlappende Blöcke desselben Projekts werden zusammengefasst.

### Konfigurierte Repos

| Repo | solidtime Projekt | Client |
| :--- | :--- | :--- |
| Finanzen | Finanzen | Privat |
| Tieffurt | Tieffurt | Privat |
| Immo-Monitor | Immo-Monitor | Privat |

### Technische Details

- **Mechanismus:** Git `post-commit` Hook im jeweiligen Repo, der per `curl` den Webhook `/webhook/git-commit` mit `project_id` und `repo` aufruft
- **Ablauf:** n8n prüft die letzten solidtime-Einträge des Projekts; endet der jüngste Block weniger als 30 Min vor jetzt, wird er verlängert, sonst ein neuer 1h-Block angelegt
- **Projekttrennung:** Nur Blöcke des gleichen Projekts werden zusammengefasst -- paralleles Arbeiten an Finanzen und Tieffurt erzeugt separate Einträge

Ein neues Repo wird angebunden, indem in solidtime ein Projekt unter Client "Privat" angelegt und der `post-commit`-Hook mit dessen Projekt-ID nach Vorlage der bestehenden Hooks erstellt wird; der Webhook-Pfad ist in Traefik bereits freigeschaltet.

## API-Zugriff

Beide Tools haben dedizierte Traefik-Router für API-Pfade ohne OAuth2-Middleware. Die Apps authentifizieren selbst.

| Tool | API-Pfad | Auth-Methode |
| :--- | :--- | :--- |
| solidtime | `time.ackermannprivat.ch/api/*` | Bearer Token (JWT) |
| Kimai | `kimai.ackermannprivat.ch/api/*` | `Authorization: Bearer <api-key>` |
| n8n Webhooks | `n8n.ackermannprivat.ch/webhook/{arbeit-start,arbeit-stop,git-commit,tieffurt-30min}` | Kein Auth (nur explizite Pfade) |

::: danger Sicherheitskonzept n8n Webhooks
n8n Webhooks haben **keine eigene Authentifizierung**. Die Sicherheit basiert auf zwei Ebenen:

1. **Traefik-Whitelist:** Nur explizit freigegebene Pfade sind extern erreichbar (`/webhook/arbeit-start`, `/webhook/arbeit-stop`, `/webhook/git-commit`, `/webhook/tieffurt-30min` und deren `-test` Varianten). Dieser Webhook-Router läuft ohne Auth-Middleware; alle anderen Pfade und die n8n-UI liegen hinter `intern-auth@file` (Authentik ForwardAuth).
2. **Obscurity:** Die Webhook-URLs sind nicht erratbar, aber auch kein echtes Secret.

Neue Webhooks müssen explizit in der Traefik-Rule im Nomad Job (`services/n8n.nomad`) freigeschaltet werden.
:::

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/solidtime` | `postgres_password`, `app_key`, `passport_private_key`, `passport_public_key` |
| `kv/data/kimai` | `mariadb_password`, `app_secret`, `admin_password` |

## Kimai Plugins

| Plugin | Beschreibung |
| :--- | :--- |
| KimaiMobileGPSInfoBundle | GPS-Standort-Aufzeichnung für Kimai Mobile App (nur Android) |

solidtime hat keine Plugins installiert und bietet kein GPS-Tracking (weder nativ noch via Plugin) -- die standortbasierte Erfassung erfolgt deshalb über die Geofence-Automation.

## Entscheidungslog

- **2026-03-18:** solidtime und Kimai deployed zum Vergleich. solidtime als Haupttool gewählt wegen moderner UI, PWA, und Toggl-Ähnlichkeit. Kimai bleibt als Backup.
- **2026-03-18:** Kimai Docker-Image unterstützt nur MySQL/MariaDB im Startup-Script. PostgreSQL ging nicht out-of-the-box, darum MariaDB-Sidecar statt Shared PostgreSQL Cluster.
- **2026-03-18:** Geofence-Automation via n8n Webhooks + iOS Shortcuts implementiert, da solidtime und Kimai kein natives iOS-Geofencing bieten.
- **2026-03-18:** Git-Commit Tracking für Finanzen und Tieffurt Repos. Ansatz: 1h-Blöcke pro Commit mit automatischer Zusammenfassung bei Überlappung. Bewusst einfach gehalten statt Editor-Plugin (Wakapi), da Commit-basiert ausreichend genau.
- **2026-03-20:** solidtime Storage von NFS auf Redis Sidecar (ephemeral) migriert -- kein persistenter Storage mehr nötig, Cache und Sessions laufen über Redis. Kimai MariaDB von NFS auf Linstor CSI (`kimai-data`) migriert für bessere Performance; NFS bleibt nur noch für data/plugins.

## Verwandte Seiten

- [n8n](../n8n/index.md) -- Automations-Plattform für die Geofence- und Git-Commit-Webhooks
- [Traefik Referenz](../traefik/referenz.md) -- Router, Middleware-Chains und ForwardAuth
- [Datenbanken](../_referenz/datenbanken.md) -- PostgreSQL- und MariaDB-Instanzen
- [Web-Interfaces](../_referenz/web-interfaces.md) -- URLs der erreichbaren Dienste
- [Credentials](../_referenz/credentials.md) -- Vault-Pfade und Secret-Konventionen
