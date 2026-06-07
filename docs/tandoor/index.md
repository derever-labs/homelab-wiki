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
| Secrets | Vault `kv/data/tandoor` |
| Auth | UI via Authentik (`intern-auth@file`), API via OAuth2-Token (siehe unten) |

## API-Zugang (Automation)

Tandoor bietet eine vollständige REST-API (Django REST Framework mit OAuth2). Für Automation existiert der Service-User `claude` (Gruppe `user`) in *sam's Space* mit einem OAuth2-Bearer-Token (Scope `read write`), abgelegt in 1Password (`Tandoor API`, Vault *PRIVAT Agent*).

Da die UI hinter Authentik liegt, würde ein reiner Token-Request am Forward-Auth-Outpost scheitern. Der Job definiert deshalb einen zweiten Traefik-Router `tandoor-api` für `PathPrefix(/api)` **ohne** Authentik, beschränkt per `ClientIP` auf interne und Tailscale-Quellen. Externe Anfragen an `/api` fallen auf den UI-Router (Authentik) zurück; ohne gültigen Token antwortet Tandoor mit `403`.

- Endpoint: `https://tandoor.ackermannprivat.ch/api/`
- Schema: `GET /openapi/?format=json`
- Anlage von Menüs/Rezepten: `POST` auf `/api/recipe/`, `/api/meal-plan/`, `/api/meal-type/`, `/api/keyword/`, `/api/recipe-book/`

## Verwandte Seiten

- [Datenbanken](../_referenz/datenbanken.md) -- SSOT für DB-Name `djangodb`, Benutzer und Vault-Pfad
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [Linstor-Storage](../linstor-storage/index.md) -- CSI-Volumes für Medien und Static Files (replizierter DRBD-Storage)
