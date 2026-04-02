---
title: Tandoor Recipes
description: Selbstgehostete Rezeptverwaltung mit PostgreSQL-Backend
tags:
  - service
  - productivity
  - nomad
---

# Tandoor Recipes

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [tandoor.ackermannprivat.ch](https://tandoor.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/tandoor.nomad`) |
| **Storage** | NFS `/nfs/docker/tandoor/{staticfiles,mediafiles}` |
| **Datenbank** | PostgreSQL `djangodb` (Shared Cluster via `postgres.service.consul`) |
| **Auth** | `intern-auth@file` |

## Rolle im Stack

Tandoor ist eine Rezeptverwaltung zum Sammeln, Organisieren und Planen von Rezepten. Rezepte können aus dem Web importiert, mit Bildern versehen und in Einkaufslisten und Essenspläne überführt werden.

## Konfiguration

### Storage

Statische Dateien und Medien (Bilder) liegen auf NFS:

- `/nfs/docker/tandoor/staticfiles` -- CSS, JS und andere Static Assets
- `/nfs/docker/tandoor/mediafiles` -- Hochgeladene Rezeptbilder

Medien werden direkt von Gunicorn ausgeliefert (`GUNICORN_MEDIA=1`), ein separater Webserver ist nicht nötig.

### Datenbank

PostgreSQL-Datenbank `djangodb` mit Benutzer `djangouser` auf dem Shared Cluster. Zugriff über Consul DNS (`postgres.service.consul:5432`). Ein Prestart-Task wartet auf PostgreSQL-Verfügbarkeit.

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/tandoor` | `secret_key`, `postgres_password` |

## Abhängigkeiten

- **PostgreSQL** -- Shared Cluster (`postgres.service.consul`)
- **Traefik** -- HTTPS-Routing und Authentik ForwardAuth Middleware
- **Authentik** -- ForwardAuth-Provider (über `intern-auth`)
- **NFS** -- Datenpersistenz für Medien und Static Files

## Verwandte Seiten

- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Medien und Static Files
