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

| Attribut | solidtime | Kimai |
| :--- | :--- | :--- |
| **Status** | Produktion (Haupttool) | Produktion (Backup) |
| **URL** | [time.ackermannprivat.ch](https://time.ackermannprivat.ch) | [kimai.ackermannprivat.ch](https://kimai.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/solidtime.nomad`) | Nomad Job (`services/kimai.nomad`) |
| **Datenbank** | PostgreSQL `solidtime` (Shared Cluster) | MariaDB 11 (Sidecar-Container) |
| **Storage** | Redis Sidecar (ephemeral, Cache + Sessions) | Linstor CSI (`kimai-data`) fuer MariaDB, NFS fuer data/plugins |
| **Mobile** | PWA (Homescreen) | Native App (iOS/Android, kostenpflichtig) |
| **Auth** | Authentik ForwardAuth (`intern-auth`) | Authentik ForwardAuth (`intern-auth`) |
| **API** | Bearer Token (Passport JWT) | API-Key (`X-AUTH-TOKEN`) |

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
shape: sequence_diagram

iPhone
n8n
solidtime

iPhone -> n8n: "GET /webhook/arbeit-start (Ankunft Horw)"
n8n -> solidtime: "POST /api/v1/.../time-entries (start=now, end=null)"
solidtime -> n8n: Timer-ID
n8n -> iPhone: "{status: started}"

iPhone -> n8n: "GET /webhook/arbeit-stop (Verlassen Horw)"
n8n -> solidtime: "GET /api/v1/.../time-entries?active=true"
solidtime -> n8n: Laufender Timer
n8n -> solidtime: "PUT /api/v1/.../time-entries/{id} (end=now)"
solidtime -> n8n: Gestoppter Timer
n8n -> iPhone: "{status: stopped, duration: ...}"
```

### Einrichtung iOS

1. **Kurzbefehle-App** auf dem iPhone oeffnen
2. **Automation** erstellen: "Wenn ich ankomme" → Standort Horw
3. **Aktion:** "URL abrufen" → `https://n8n.ackermannprivat.ch/webhook/arbeit-start`
4. Zweite Automation: "Wenn ich verlasse" → gleicher Standort
5. **Aktion:** "URL abrufen" → `https://n8n.ackermannprivat.ch/webhook/arbeit-stop`
6. "Sofort ausfuehren" aktivieren (ohne Bestaetigung)

### n8n Workflows

Zwei Workflows in n8n importieren (Dateien im Repo unter `configs/n8n/`):

- `workflow-arbeit-start.json` -- Webhook empfaengt GET-Request, startet solidtime-Timer
- `workflow-arbeit-stop.json` -- Webhook empfaengt GET-Request, findet aktiven Timer, stoppt ihn

::: warning Credential einrichten
In n8n muss ein **HTTP Header Auth Credential** namens "solidtime API" erstellt werden:
- Header Name: `Authorization`
- Header Value: `Bearer <solidtime-api-token>`
:::

## Git-Commit Tracking

Automatische Zeiterfassung fuer private Repos basierend auf Git-Commits. Jeder Commit erzeugt einen 1h-Zeitblock (30 Min vor, 30 Min nach). Ueberlappende Bloecke desselben Projekts werden zusammengefasst.

### Konfigurierte Repos

| Repo | Pfad | solidtime Projekt | Client |
| :--- | :--- | :--- | :--- |
| Finanzen | `/Users/Shared/git/gitea/finanzen/` | Finanzen | Privat |
| Tieffurt | `/Users/Shared/git/gitea/tieffurt/` | Tieffurt | Privat |
| Immo-Monitor | `/Users/Shared/git/github/PRIVAT/immo-monitor/` | Immo-Monitor | Privat |

### Ablauf

```d2
shape: sequence_diagram

"Git (lokal)"
n8n
solidtime

"Git (lokal)" -> n8n: "GET /webhook/git-commit?project_id=...&repo=Finanzen (git commit)"
n8n -> solidtime: GET /time-entries (letzte 5)
solidtime -> n8n: Bestehende Eintraege

group Eintrag mit gleichem Projekt, Ende >= jetzt-30min {
  n8n -> solidtime: "PUT /time-entries/{id} (end=jetzt+30min)"
  solidtime -> solidtime: Block verlaengert
}

group Kein ueberlappender Eintrag {
  n8n -> solidtime: "POST /time-entries (start=jetzt-30min, end=jetzt+30min)"
  solidtime -> solidtime: Neuer 1h-Block
}

n8n -> "Git (lokal)": OK
```

### Technische Details

- **Mechanismus:** Git `post-commit` Hook in `.git/hooks/post-commit`
- **Hook-Inhalt:** `curl -s "https://n8n.ackermannprivat.ch/webhook/git-commit?project_id=...&repo=..." &`
- **Zusammenfassung:** Commits innerhalb von 30 Min nach dem Ende des letzten Blocks verlaengern diesen, statt einen neuen zu erstellen
- **Projekttrennung:** Nur Bloecke des gleichen Projekts werden zusammengefasst -- paralleles Arbeiten an Finanzen und Tieffurt erzeugt separate Eintraege

::: tip Neues Repo hinzufuegen
1. solidtime: Neues Projekt unter Client "Privat" erstellen, Projekt-ID notieren
2. Git Hook: `.git/hooks/post-commit` mit der Projekt-ID erstellen (siehe bestehende Hooks als Vorlage)
3. Traefik: Kein Anpassung noetig (`/webhook/git-commit` ist bereits freigeschaltet)
:::

## API-Zugriff

Beide Tools haben dedizierte Traefik-Router fuer API-Pfade ohne OAuth2-Middleware. Die Apps authentifizieren selbst.

| Tool | API-Pfad | Auth-Methode |
| :--- | :--- | :--- |
| solidtime | `time.ackermannprivat.ch/api/*` | Bearer Token (JWT) |
| Kimai | `kimai.ackermannprivat.ch/api/*` | `Authorization: Bearer <api-key>` |
| n8n Webhooks | `n8n.ackermannprivat.ch/webhook/{arbeit-start,arbeit-stop,git-commit}` | Kein Auth (nur explizite Pfade) |

::: danger Sicherheitskonzept n8n Webhooks
n8n Webhooks haben **keine eigene Authentifizierung**. Die Sicherheit basiert auf zwei Ebenen:

1. **Traefik-Whitelist:** Nur explizit freigegebene Pfade sind extern erreichbar (`/webhook/arbeit-start`, `/webhook/arbeit-stop`, `/webhook/git-commit` und deren `-test` Varianten). Alle anderen Webhooks und die n8n-UI bleiben hinter `intern-noauth@file` (IP-Allowlist).
2. **Obscurity:** Die Webhook-URLs sind nicht erratbar, aber auch kein echtes Secret.

Neue Webhooks muessen explizit in der Traefik-Rule im Nomad Job (`services/n8n.nomad`) freigeschaltet werden.
:::

## Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/solidtime` | `postgres_password`, `app_key`, `passport_private_key`, `passport_public_key` |
| `kv/data/kimai` | `mariadb_password`, `app_secret`, `admin_password` |

## solidtime Plugins

Keine Plugins installiert. GPS-Tracking ist nicht verfuegbar (weder nativ noch via Plugin).

## Kimai Plugins

| Plugin | Version | Beschreibung |
| :--- | :--- | :--- |
| KimaiMobileGPSInfoBundle | 1.1.0 | GPS-Standort-Aufzeichnung fuer Kimai Mobile App (nur Android) |

## Entscheidungslog

- **2026-03-18:** solidtime und Kimai deployed zum Vergleich. solidtime als Haupttool gewaehlt wegen moderner UI, PWA, und Toggl-Aehnlichkeit. Kimai bleibt als Backup.
- **2026-03-18:** Kimai Docker-Image unterstuetzt nur MySQL/MariaDB im Startup-Script. PostgreSQL ging nicht out-of-the-box, darum MariaDB-Sidecar statt Shared PostgreSQL Cluster.
- **2026-03-18:** Geofence-Automation via n8n Webhooks + iOS Shortcuts implementiert, da solidtime und Kimai kein natives iOS-Geofencing bieten.
- **2026-03-18:** Git-Commit Tracking fuer Finanzen und Tieffurt Repos. Ansatz: 1h-Bloecke pro Commit mit automatischer Zusammenfassung bei Ueberlappung. Bewusst einfach gehalten statt Editor-Plugin (Wakapi), da Commit-basiert ausreichend genau.
- **2026-03-20:** solidtime Storage von NFS auf Redis Sidecar (ephemeral) migriert -- kein persistenter Storage mehr noetig, Cache und Sessions laufen ueber Redis. Kimai MariaDB von NFS auf Linstor CSI (`kimai-data`) migriert fuer bessere Performance; NFS bleibt nur noch fuer data/plugins.
