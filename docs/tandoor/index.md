---
title: Tandoor Recipes
description: Selbstgehostete Rezeptverwaltung mit PostgreSQL-Backend
tags:
  - service
  - productivity
  - nomad
---

# Tandoor Recipes

Tandoor ist die selbstgehostete Rezeptverwaltung zum Sammeln, Organisieren und Planen von Rezepten. Rezepte können aus dem Web importiert, mit Bildern versehen und in Einkaufslisten und Essenspläne überführt werden.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [tandoor.ackermannprivat.ch](https://tandoor.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/tandoor.nomad` |
| Storage | Linstor CSI -- Volumes `tandoor-static` + `tandoor-media` (ext4, 2 Replicas, `rg-replicated`) |
| Secrets | Vault `kv/data/tandoor` (inkl. OIDC-Client) |
| Auth | UI öffentlich hinter Authentik-OIDC-SSO (Gruppen `family` + `admin`), API via OAuth2-Token |
| Erreichbarkeit | Öffentlich erreichbar (verteilte Familie); `/admin` bleibt intern, MFA erzwungen |

## Anmeldung (SSO via Authentik-OIDC)

Die Anmeldung läuft als echtes Single-Sign-On über Authentik-OIDC (django-allauth). Die UI ist **öffentlich erreichbar** (Familienmitglieder in verschiedenen Haushalten), das Auth-Gate ist Tandoors eigener OIDC-Flow: Die Login-Seite zeigt nur den Button *Einloggen mit Authentik* (`HIDE_LOGIN_FORM=1`); ein Klick leitet ohne Zwischenseite (`SOCIALACCOUNT_LOGIN_ON_GET=1`) direkt zu Authentik.

- **Zugriffsgruppen:** Application `tandoor-sso` ist an die Authentik-Gruppen `family` (Familienmitglieder) und `admin` (Samuel) gebunden. Nur Mitglieder dieser Gruppen können sich einloggen. Client-Credentials in Vault `kv/data/tandoor` (`oidc_client_id/secret/server_url`).
- **MFA:** Der Authentik-Login-Flow erzwingt einen zweiten Faktor (`default-authentication-mfa-validation` mit `not_configured_action = configure`) -- wer noch keinen Authenticator hat, muss beim ersten Login TOTP/WebAuthn einrichten.
- **Auto-Provisioning:** Neue OIDC-User joinen automatisch den Familien-Space als `user` (`SOCIAL_DEFAULT_ACCESS=1` + `SOCIAL_DEFAULT_GROUP=user`). Sicher, weil nur `family`/`admin` durch das Gate kommen.
- **User-Verknüpfung:** Accounts werden per E-Mail mit der Authentik-Identität verbunden (`SOCIALACCOUNT_EMAIL_AUTHENTICATION` + `AUTO_CONNECT`). Voraussetzung ist der `email_verified`-Claim als `true` -- dafür existiert ein dediziertes Scope-Mapping.
- **UI-Router:** Traefik-Middlewares `crowdsec` + `secure-headers` + `error-pages` + `login-ratelimit` (öffentlich, kein IP-Allowlist mehr). Die `secure-headers`-CSP erlaubt `form-action` zusätzlich zu `auth.ackermannprivat.ch`, sonst blockiert der Browser den OIDC-Redirect.
- **Admin-Router:** `/admin` läuft über einen eigenen Router (Priorität 200) mit `intern-noauth` -- der Django-Fallback-Login bleibt **nur intern/Tailscale** erreichbar und ist nicht öffentlich brute-force-bar.
- **Fallback:** Bei Authentik-Ausfall ist der Django-Admin-Login (`/admin/`, nur intern) der Notzugang.

## Multi-User: Spaces & Households

Tandoor trennt zwei Ebenen: der **Space** (`sam's Space`, id 1) hält die gemeinsame Rezeptsammlung -- alle Familienmitglieder sehen dieselben Rezepte, Zutaten und Kochbücher. **Households** (seit Tandoor 2.6) gruppieren Mitglieder *innerhalb* des Space: Essenspläne und Einkaufslisten sind pro Household getrennt (technisch über `UserSpace.household`, da `MealPlan`/`ShoppingListEntry` kein eigenes Household-FK haben -- die Sichtbarkeit läuft über die Household-Zugehörigkeit des Erstellers).

Eingerichtete Households:

- **Luzern** -- Samuel (+ Service-User `claude`); zugleich Default-Household für neu beitretende User
- **Daniel & Corinna** -- gemeinsamer Haushalt
- **Laura** -- eigener Haushalt
- **Nina** -- eigener Haushalt

::: tip Household-Zuordnung neuer Mitglieder
Neue Mitglieder landen via `SOCIAL_DEFAULT_ACCESS` zunächst im Default-Household *Luzern*. Ein Space-Admin verschiebt sie nach dem ersten Login in ihr Household (Admin-UI bzw. `UserSpace.household`). Erst danach sind ihre Essenspläne/Einkaufslisten korrekt vom Rest getrennt.
:::

## Onboarding neuer Familienmitglieder (Enrollment)

Für künftige Mitglieder existiert ein **invitation-basierter Self-Service-Enrollment-Flow** in Authentik (`family-enrollment`). Ohne gültige Einladung kommt niemand durch (kein offener Signup); der Flow erzwingt einen zweiten Faktor.

- **Flow:** Authentik-Flow `family-enrollment`, Stages in Reihenfolge: Invitation (Pflicht-Token) → Prompt (Benutzername/Name/E-Mail/Passwort) → User-Write (→ Gruppe `family`) → E-Mail-Verifikation → TOTP-Setup (Pflicht-2FA) → Login.
- **Passwort-Policy:** mind. 12 Zeichen, Gross-/Kleinbuchstaben + Zahl, Abgleich gegen *Have I Been Pwned* (`family-enroll-pw-policy`).
- **Einladen:** Pro Person eine Invitation in Authentik erstellen (Stage `family-enroll-invitation`, single-use). Der Link `https://auth.ackermannprivat.ch/if/flow/family-enrollment/?itoken=<token>` wird an die Person geschickt; nach Abschluss ist sie in `family` und kann sich bei Tandoor einloggen.
- **Danach:** Mitglied dem richtigen Household zuordnen (siehe oben).

## API-Zugang (Automation)

Tandoor bietet eine vollständige REST-API (Django REST Framework mit OAuth2). Für Automation existiert der Service-User `claude` (Gruppe `user`) in *sam's Space* mit einem OAuth2-Bearer-Token (Scope `read write`), abgelegt in 1Password (`Tandoor API`, Vault *PRIVAT Agent*).

Maschinen-Clients können den OIDC-Login nicht durchlaufen, nutzen also den Token. Der Router `tandoor-api` für `PathPrefix(/api)` ist **öffentlich** (Middlewares `crowdsec` + `secure-headers` + `api-ratelimit`, **ohne** Error-Pages, damit API-Fehler JSON bleiben) -- das ist nötig, weil die Vue-SPA `/api` clientseitig vom Browser der externen Nutzer aufruft. Der Schutz liegt bei Tandoor selbst: Session-Cookie für UI-Nutzer, OAuth2-Bearer-Token für Automation. Ohne gültige Authentifizierung antwortet Tandoor mit `403`.

- Endpoint: `https://tandoor.ackermannprivat.ch/api/`
- Schema: `GET /openapi/?format=json`
- Anlage von Menüs/Rezepten: `POST` auf `/api/recipe/`, `/api/meal-plan/`, `/api/meal-type/`, `/api/keyword/`, `/api/recipe-book/`

## Einkaufsliste-Sync mit Bring!

Einträge in Tandoors Einkaufsliste werden automatisch in die **Bring!**-App gespiegelt -- über Tandoors eingebauten *HomeAssistant-Connector* und die offizielle Bring!-Integration von Home Assistant (Lenzburg). Ein nativer Bring!-Connector existiert in Tandoor nicht; eine HA-Automation ist nicht nötig, weil Tandoor direkt in die Bring!-Liste pusht, die Home Assistant als Todo-Entität bereitstellt.

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
  ext: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
}

direction: right

TANDOOR: "Tandoor\nEinkaufsliste" { class: node }
CONN: "HomeAssistant-\nConnector" { class: node }
HA: "Home Assistant Lenzburg\n(todo.luzern)" { class: node }
BRING: "Bring!\nListe Luzern" { class: ext }

TANDOOR -> CONN: "Eintrag\nanlegen/loeschen"
CONN -> HA: "REST: todo.add_item /\ntodo.remove_item"
HA <-> BRING: "Bring!-Integration"
```

Tandoor ruft beim Anlegen oder Löschen eines Eintrags die HA-REST-API (`todo.add_item` / `todo.remove_item`) auf der Entität `todo.luzern` auf; Home Assistant spiegelt diese Liste über die Bring!-Integration in die Bring!-Liste *Luzern*.

- **Connector:** `ConnectorConfig` *Bring (HA Lenzburg)* in *sam's Space* -- HA-URL (muss auf `/api/` enden, sonst `404`), `todo_entity=todo.luzern`. Der HA Long-Lived Access Token liegt in 1Password (`HA Token Tandoor Bring`).
- **Synchronisiert:** Anlegen und Löschen. Reine Änderungen eines bestehenden Eintrags werden vom Connector nicht gespiegelt; Mengenangaben erscheinen in Bring! als `Name (2)`.

::: warning Connector-Cache
Der Connector cacht seine Konfiguration pro Space im Gunicorn-Prozess. Wird die `ConnectorConfig` direkt in der Datenbank geändert statt über die Tandoor-UI, muss der Tandoor-Task neu gestartet werden, damit die Änderung greift.
:::

::: warning Bring-Sync ist space-weit, nicht pro Household
Der Connector reagiert auf **alle** Einkaufslisten-Einträge im Space, unabhängig vom Household, und pusht sie in die eine Bring!-Liste *Luzern*. Solange nur Samuels Haushalt (Luzern) die Einkaufsliste aktiv nutzt, ist das korrekt. Sobald andere Haushalte Einträge anlegen, landen auch diese in der Luzern-Bring!-Liste -- eine per-Household-Trennung des Bring-Syncs ist mit dem aktuellen Connector-Modell nicht möglich. Bewusst so belassen (Bring nur für Luzern).
:::

## Verwandte Seiten

- [Datenbanken](../_referenz/datenbanken.md) -- SSOT für DB-Name `djangodb`, Benutzer und Vault-Pfad
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [Linstor-Storage](../linstor-storage/index.md) -- CSI-Volumes für Medien und Static Files (replizierter DRBD-Storage)
