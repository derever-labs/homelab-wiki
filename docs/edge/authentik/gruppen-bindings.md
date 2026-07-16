---
title: Authentik Gruppen und Bindings
description: Benutzergruppen, Group-Binding-Strategie, Tier-Mapping und Blueprint-Quelle
tags:
  - identity
  - authentik
  - referenz
---

# Authentik Gruppen und Bindings

Authentik verwaltet Benutzer intern. Passwort-Änderungen und Gruppen-Management erfolgen über die Authentik-UI oder via User-Portal / Recovery-Flow. Übergeordnete Rolle und Architektur stehen in [Authentik (Übersicht)](./index.md), Flows und Policies in [Authentik Referenz](./referenz.md).

## Gruppen

| Gruppe | Zugriff | Bemerkung |
| :--- | :--- | :--- |
| `authentik Admins` | Admin-UI + System-Admin (nicht automatisch alle Apps) | Superuser-Flag via Gruppe, MFA erzwungen. Bypassed Policy-Bindings NICHT |
| `admin` | Alle 45 Apps (admin-Tier + inherits via Multi-Binding auch family/guest-Tier) | MFA erzwungen |
| `family` | family-Tier (immo-monitor) + guest-Tier (jellyseerr) | Kein MFA, darf LDAP-Bind für Jellyfin |
| `guest` | guest-Tier (jellyseerr) | — |
| `ldap-searchers` | LDAP-Suche für Jellyfin-Bind-User (`svc-jellyfin-ldap`) | Rolle `ldap-searcher` |

Admin-Accounts:

- `akadmin` -- primärer Admin. In `authentik Admins` UND `admin`. Credentials in 1Password unter "Authentik HOME" (inkl. Live-OTP-Feld)
- `akadmin-breakglass` -- Lifeline-Account, nur in `authentik Admins`. Getrennte Credentials in 1Password unter "Authentik Breakglass (akadmin-breakglass)". Hat keinen direkten App-Zugang, dient als Admin-UI-Fallback. Nutzung: siehe [Recovery](./recovery.md)

## Group-Binding-Strategie

Alle 45 Applications sind explizit einer der drei Tiers (`admin`, `family`, `guest`) zugeordnet. Autoritative Zuordnung und Apply-Mechanik liegen deklarativ im Ordner [`authentik-blueprints/`](https://github.com/derever-labs/infra/tree/main/authentik-blueprints) -- siehe Abschnitt [Blueprint-Quelle](#blueprint-quelle).

Kernregeln:

- **`policy_engine_mode = any`** auf jeder App (OR-Logik: User darf rein sobald eine gebundene Gruppe passt)
- **Multi-Binding pro Tier-Übergang.** Authentik vererbt Gruppen-Mitgliedschaft über das `parent`-Feld NICHT transitiv (empirisch bestätigt per `check_access`-Endpoint am 2026-04-14). Deshalb bekommen niederschwellig berechtigte Apps mehrere Bindings:

  - **guest-Tier** (Apps, die jeder authentifizierte User sehen soll): Bindings auf `admin` (order 0), `family` (order 1), `guest` (order 2)
  - **family-Tier**: Bindings auf `admin` (order 0), `family` (order 1)
  - **admin-Tier**: Binding nur auf `admin` (order 0)

- **Keine Negate-Flags.** Negate-Interaktion mit `policy_engine_mode=any` ist bekannt paradox (Issues #9627, #17692 im Authentik-Repo)
- **`parent`-Feld bleibt leer.** Da Vererbung nicht wirkt, bringt es nichts ausser UI-Kosmetik

Superuser-Verhalten: Mitglieder von `authentik Admins` (is_superuser=True) umgehen Policy-Bindings NICHT. Der `superuser_full_list=true`-Flag zeigt Superusern die App-Liste vollständig in der Admin-UI, die tatsächliche Authorization läuft aber über das Binding. akadmin muss deshalb in `admin` bleiben, sonst verliert er nach Rollout den App-Zugang.

## Tier-Mapping

- **guest-Tier:** `jellyseerr` (jeder authentifizierte User)
- **family-Tier:** `immo-monitor`
- **admin-Tier:** alle übrigen Apps (Core/OIDC, Dashboards, Observability, Storage/DB, Media-Stack, Office, Utilities, Download-Tools)

Die autoritative, vollständige App-zu-Tier-Zuordnung ist der Blueprint `authentik-blueprints/30-apps-admin-tier.yaml` (admin-Tier) bzw. `10-`/`20-apps-*-tier.yaml` -- jede neue App wird dort eingetragen.

## Blueprint-Quelle

Die Tier-Zuordnung und Gruppen-Bindings werden über Authentik-Blueprints verwaltet (deklarative YAML im Git-Repo):

- **Pfad:** `authentik-blueprints/` im Infra-Repo (Subfolder, kein Submodule)
- **Files:** `00-groups.yaml` (Gruppen), `10-apps-guest-tier.yaml`, `20-apps-family-tier.yaml`, `30-apps-admin-tier.yaml`
- **Einbindung:** Der `authentik.nomad`-Worker-Task liest die YAMLs beim Deploy via HCL2 `file()` und mountet den Ordner read-only nach `/blueprints/homelab/` im Container. Der Authentik-Reconciler entdeckt und appliziert sie automatisch (Labels `blueprints.goauthentik.io/system: true` + `instantiate: true`)
- **Kein Git-Sync-Sidecar, kein Deploy-Key, kein PAT.** Apply erfolgt über den `nomad job run` des Identity-Jobs
- **Validierung lokal:** über die `ak blueprint validate`-Subcommand im Authentik-Server-Image (siehe `authentik-blueprints/README.md`)
- **Readme im Repo:** siehe `authentik-blueprints/README.md` für Tier-Logik-Details und App-Aufnahme-Workflow

Den vollständigen Änderungs- und Rollback-Workflow (PR, CODEOWNERS-Review, Apply-Reihenfolge) beschreibt [Authentik Betrieb](./betrieb.md#blueprint-workflow).

## Verwandte Seiten

- [Authentik Übersicht](./index.md) -- Architektur und Stack-Einbindung
- [Authentik Referenz](./referenz.md) -- Flows, Policies, OIDC-Provider
- [Authentik Recovery und Breakglass](./recovery.md) -- Recovery-Layer, Breakglass, Rollback
- [Authentik Betrieb](./betrieb.md) -- Blueprint-Workflow, Alerting, Performance
