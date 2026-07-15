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
direction: right

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
  container: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
  db: {
    shape: cylinder
  }
}

iPhone: "iPhone" {
  class: container
  PWA: "solidtime PWA" { class: node }
  SC: "iOS-Shortcuts\n(Geofence Horw)" { class: node }
}

Browser: "Browser" { class: node }
Git: "Git-Repos lokal\n(post-commit-Hook)" { class: node }

Traefik: "Traefik" {
  class: container
  R1: "time.*\n(intern-auth)" { class: node }
  R2: "time.*/api\n(ohne OAuth)" { class: node }
  R3: "n8n.*/webhook\n(ohne OAuth)" { class: node }
  R4: "kimai.*\n(intern-auth)" { class: node }
}

Nomad: "Nomad-Cluster" {
  class: container
  ST: "solidtime" { class: node }
  N8N: "n8n" { class: node }
  Kimai: "Kimai" {
    class: container
    APP: "kimai" { class: node }
    DB: "MariaDB\n(Sidecar)" { class: db }
    APP -> DB
  }
  PG: "PostgreSQL\nShared Cluster" { class: db }
}

iPhone.PWA -> Traefik.R1: HTTPS
iPhone.SC -> Traefik.R3: "arbeit-start / arbeit-stop"
Git -> Traefik.R3: git-commit
Browser -> Traefik.R4: HTTPS
Traefik.R1 -> Nomad.ST
Traefik.R2 -> Nomad.ST
Traefik.R3 -> Nomad.N8N
Traefik.R4 -> Nomad.Kimai.APP
Nomad.N8N -> Traefik.R2: "solidtime-API\n(Timer und Zeitblöcke)"
Nomad.ST -> Nomad.PG
```

## Rolle im Stack

solidtime und Kimai sind Endnutzer-Services hinter Traefik, das die externe TLS-Terminierung und das Routing übernimmt. Die UIs sind über Authentik ForwardAuth (`intern-auth`) abgesichert, während die API-Pfade die App-eigene Token-Auth nutzen. Daten liegen im Shared PostgreSQL Cluster (solidtime) bzw. einem MariaDB-Sidecar (Kimai); Secrets kommen aus Vault. n8n liefert als Automations-Schicht die Geofence- und Git-Commit-Anbindung.

## Geofence-Automation

Automatisches Starten und Stoppen des solidtime-Timers basierend auf dem Standort (Geofencing via iOS).

### Ablauf

```d2
shape: sequence_diagram

iphone: iPhone
n8n: n8n
st: solidtime

Timer starten (Ankunft Horw): {
  iphone -> n8n: "GET /webhook/arbeit-start"
  n8n -> st: "POST time-entries (start=now, end=null)"
  st -> n8n: Timer-ID
  n8n -> iphone: status=started
}

Timer stoppen (Verlassen Horw): {
  iphone -> n8n: "GET /webhook/arbeit-stop"
  n8n -> st: "GET time-entries?active=true"
  st -> n8n: laufender Timer
  n8n -> st: "PUT time-entries (end=now)"
  n8n -> iphone: status=stopped + duration
}
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
