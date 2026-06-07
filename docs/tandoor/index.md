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
| Auth | UI via Authentik-OIDC-SSO (allauth), API via OAuth2-Token (siehe unten) |

## Anmeldung (SSO via Authentik-OIDC)

Die Anmeldung läuft als echtes Single-Sign-On über Authentik-OIDC (django-allauth) -- kein vorgelagerter Forward-Auth mehr. Die Tandoor-Login-Seite zeigt nur den Button *Einloggen mit Authentik* (`HIDE_LOGIN_FORM=1`); ein Klick leitet ohne Zwischenseite (`SOCIALACCOUNT_LOGIN_ON_GET=1`) direkt zu Authentik.

- **Authentik-Seite:** OAuth2/OIDC-Provider `tandoor-oidc` + Application `tandoor-sso`, Zugriff via Gruppe `admin`. Client-Credentials in Vault `kv/data/tandoor` (`oidc_client_id/secret/server_url`).
- **User-Verknüpfung:** Bestehende Tandoor-Accounts werden per E-Mail mit der Authentik-Identität verbunden (`SOCIALACCOUNT_EMAIL_AUTHENTICATION` + `AUTO_CONNECT`). Voraussetzung ist, dass Authentik den `email_verified`-Claim als `true` liefert -- dafür existiert ein dediziertes Scope-Mapping (das globale Default liefert `false`).
- **UI-Router:** Traefik-Middlewares `secure-headers` + `error-pages` + `intern-noauth` (interne IP-Allowlist), kein Authentik-Forward-Auth. Die `secure-headers`-CSP erlaubt `form-action` zusätzlich zu `auth.ackermannprivat.ch`, sonst blockiert Chrome den OIDC-Redirect.
- **Fallback:** Bei Authentik-Ausfall ist der Django-Admin-Login (`/admin/`) der Notzugang (Superuser-Passwort).

## API-Zugang (Automation)

Tandoor bietet eine vollständige REST-API (Django REST Framework mit OAuth2). Für Automation existiert der Service-User `claude` (Gruppe `user`) in *sam's Space* mit einem OAuth2-Bearer-Token (Scope `read write`), abgelegt in 1Password (`Tandoor API`, Vault *PRIVAT Agent*).

Maschinen-Clients können den OIDC-Login nicht durchlaufen, nutzen also den Token. Der Job definiert dafür den Router `tandoor-api` für `PathPrefix(/api)` mit der Chain `intern-api@file` (interne IP-Allowlist, **ohne** Error-Pages, damit API-Fehler JSON bleiben). Auth ist der OAuth2-Token; ohne gültigen Token antwortet Tandoor mit `403`.

- Endpoint: `https://tandoor.ackermannprivat.ch/api/`
- Schema: `GET /openapi/?format=json`
- Anlage von Menüs/Rezepten: `POST` auf `/api/recipe/`, `/api/meal-plan/`, `/api/meal-type/`, `/api/keyword/`, `/api/recipe-book/`

## Verwandte Seiten

- [Datenbanken](../_referenz/datenbanken.md) -- SSOT für DB-Name `djangodb`, Benutzer und Vault-Pfad
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [Linstor-Storage](../linstor-storage/index.md) -- CSI-Volumes für Medien und Static Files (replizierter DRBD-Storage)
