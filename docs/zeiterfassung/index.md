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

## Übersicht

Selbstgehostete Zeiterfassung als Ersatz für Toggl Track. Zwei Tools parallel im Einsatz, solidtime als Haupttool.

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
| Deployment | Nomad Job `services/kimai.nomad` |
| Datenbank | MariaDB 11 (Sidecar-Container) |
| Storage | Linstor CSI (`kimai-data`) für MariaDB, NFS für data/plugins |
| Auth | Authentik ForwardAuth (`intern-auth`) |
| API | API-Key (`X-AUTH-TOKEN`) |

## Architektur

```d2
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
  PG: PostgreSQL 16 { shape: cylinder; style.border-radius: 8 }
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

direction: down

classes: {
  iphone: { style.fill: "#e8f0fe" }
  n8n: { style.fill: "#fff4e5" }
  solid: { style.fill: "#e6f4ea" }
}

start: Ankunft Horw -- Timer starten {
  hook: "iPhone GET /webhook/arbeit-start" { class: iphone }
  post: "n8n POST time-entries (start=now, end=null)" { class: n8n }
  ack: "solidtime antwortet mit Timer-ID" { class: solid }
  resp: "n8n meldet status: started zurück" { class: n8n }
  hook -> post -> ack -> resp
}

stop: Verlassen Horw -- Timer stoppen {
  hook: "iPhone GET /webhook/arbeit-stop" { class: iphone }
  find: "n8n GET time-entries?active=true" { class: n8n }
  cur: "solidtime liefert laufenden Timer" { class: solid }
  close: "n8n PUT time-entries/{id} (end=now)" { class: n8n }
  ack: "solidtime bestätigt gestoppten Timer" { class: solid }
  resp: "n8n meldet status: stopped + duration" { class: n8n }
  hook -> find -> cur -> close -> ack -> resp
}

start -> stop
```

### Einrichtung iOS

1. **Kurzbefehle-App** auf dem iPhone öffnen
2. **Automation** erstellen: "Wenn ich ankomme" → Standort Horw
3. **Aktion:** "URL abrufen" → `https://n8n.ackermannprivat.ch/webhook/arbeit-start`
4. Zweite Automation: "Wenn ich verlasse" → gleicher Standort
5. **Aktion:** "URL abrufen" → `https://n8n.ackermannprivat.ch/webhook/arbeit-stop`
6. "Sofort ausführen" aktivieren (ohne Bestätigung)

### n8n Workflows

Zwei Workflows in n8n importieren (Dateien im Repo unter `configs/n8n/`):

- `workflow-arbeit-start.json` -- Webhook empfängt GET-Request, startet solidtime-Timer
- `workflow-arbeit-stop.json` -- Webhook empfängt GET-Request, findet aktiven Timer, stoppt ihn

::: warning Credential einrichten
In n8n muss ein **HTTP Header Auth Credential** namens "solidtime API" erstellt werden:
- Header Name: `Authorization`
- Header Value: `Bearer <solidtime-api-token>`
:::

## Git-Commit Tracking

Automatische Zeiterfassung für private Repos basierend auf Git-Commits. Jeder Commit erzeugt einen 1h-Zeitblock (30 Min vor, 30 Min nach). Überlappende Blöcke desselben Projekts werden zusammengefasst.

### Konfigurierte Repos

| Repo | Pfad | solidtime Projekt | Client |
| :--- | :--- | :--- | :--- |
| Finanzen | `/Users/Shared/git/gitea/finanzen/` | Finanzen | Privat |
| Tieffurt | `/Users/Shared/git/gitea/tieffurt/` | Tieffurt | Privat |
| Immo-Monitor | `/Users/Shared/git/github/PRIVAT/immo-monitor/` | Immo-Monitor | Privat |

### Ablauf

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

direction: down

classes: {
  git: { style.fill: "#e8f0fe" }
  n8n: { style.fill: "#fff4e5" }
  solid: { style.fill: "#e6f4ea" }
}

trigger: 1. Commit-Hook {
  hook: "Git post-commit GET /webhook/git-commit\n(project_id + repo)" { class: git }
}

fetch: 2. Bestehende Einträge prüfen {
  get: "n8n GET /time-entries (letzte 5)" { class: n8n }
  list: "solidtime liefert Einträge" { class: solid }
  check: "n8n prüft: gleicher Projekt-Eintrag, Ende nach jetzt-30min?" { class: n8n }
  get -> list -> check
}

write: 3. Eintrag verlängern oder neu anlegen {
  put: "n8n PUT time-entries/ID (end=jetzt+30min)\noder POST neuer 1h-Block" { class: n8n }
  ack: "solidtime bestätigt" { class: solid }
  ok: "n8n meldet OK zurück an Git-Hook" { class: n8n }
  put -> ack -> ok
}

trigger -> fetch -> write
```

### Technische Details

- **Mechanismus:** Git `post-commit` Hook in `.git/hooks/post-commit`
- **Hook-Inhalt:** `curl -s "https://n8n.ackermannprivat.ch/webhook/git-commit?project_id=...&repo=..." &`
- **Zusammenfassung:** Commits innerhalb von 30 Min nach dem Ende des letzten Blocks verlängern diesen, statt einen neuen zu erstellen
- **Projekttrennung:** Nur Blöcke des gleichen Projekts werden zusammengefasst -- paralleles Arbeiten an Finanzen und Tieffurt erzeugt separate Einträge

::: tip Neues Repo hinzufügen
1. solidtime: Neues Projekt unter Client "Privat" erstellen, Projekt-ID notieren
2. Git Hook: `.git/hooks/post-commit` mit der Projekt-ID erstellen (siehe bestehende Hooks als Vorlage)
3. Traefik: Keine Anpassung nötig (`/webhook/git-commit` ist bereits freigeschaltet)
:::

## API-Zugriff

Beide Tools haben dedizierte Traefik-Router für API-Pfade ohne OAuth2-Middleware. Die Apps authentifizieren selbst.

| Tool | API-Pfad | Auth-Methode |
| :--- | :--- | :--- |
| solidtime | `time.ackermannprivat.ch/api/*` | Bearer Token (JWT) |
| Kimai | `kimai.ackermannprivat.ch/api/*` | `Authorization: Bearer <api-key>` |
| n8n Webhooks | `n8n.ackermannprivat.ch/webhook/{arbeit-start,arbeit-stop,git-commit}` | Kein Auth (nur explizite Pfade) |

::: danger Sicherheitskonzept n8n Webhooks
n8n Webhooks haben **keine eigene Authentifizierung**. Die Sicherheit basiert auf zwei Ebenen:

1. **Traefik-Whitelist:** Nur explizit freigegebene Pfade sind extern erreichbar (`/webhook/arbeit-start`, `/webhook/arbeit-stop`, `/webhook/git-commit` und deren `-test` Varianten). Alle anderen Webhooks und die n8n-UI bleiben hinter `intern-noauth@file` (IP-Allowlist).
2. **Obscurity:** Die Webhook-URLs sind nicht erratbar, aber auch kein echtes Secret.

Neue Webhooks müssen explizit in der Traefik-Rule im Nomad Job (`services/n8n.nomad`) freigeschaltet werden.
:::

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/solidtime` | `postgres_password`, `app_key`, `passport_private_key`, `passport_public_key` |
| `kv/data/kimai` | `mariadb_password`, `app_secret`, `admin_password` |

## solidtime Plugins

Keine Plugins installiert. GPS-Tracking ist nicht verfügbar (weder nativ noch via Plugin).

## Kimai Plugins

| Plugin | Version | Beschreibung |
| :--- | :--- | :--- |
| KimaiMobileGPSInfoBundle | -- | GPS-Standort-Aufzeichnung für Kimai Mobile App (nur Android) |

## Entscheidungslog

- **2026-03-18:** solidtime und Kimai deployed zum Vergleich. solidtime als Haupttool gewählt wegen moderner UI, PWA, und Toggl-Ähnlichkeit. Kimai bleibt als Backup.
- **2026-03-18:** Kimai Docker-Image unterstützt nur MySQL/MariaDB im Startup-Script. PostgreSQL ging nicht out-of-the-box, darum MariaDB-Sidecar statt Shared PostgreSQL Cluster.
- **2026-03-18:** Geofence-Automation via n8n Webhooks + iOS Shortcuts implementiert, da solidtime und Kimai kein natives iOS-Geofencing bieten.
- **2026-03-18:** Git-Commit Tracking für Finanzen und Tieffurt Repos. Ansatz: 1h-Blöcke pro Commit mit automatischer Zusammenfassung bei Überlappung. Bewusst einfach gehalten statt Editor-Plugin (Wakapi), da Commit-basiert ausreichend genau.
- **2026-03-20:** solidtime Storage von NFS auf Redis Sidecar (ephemeral) migriert -- kein persistenter Storage mehr nötig, Cache und Sessions laufen über Redis. Kimai MariaDB von NFS auf Linstor CSI (`kimai-data`) migriert für bessere Performance; NFS bleibt nur noch für data/plugins.
