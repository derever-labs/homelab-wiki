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
| Storage | NFS `/nfs/docker/tandoor/{staticfiles,mediafiles}` |
| Secrets | Vault `kv/data/tandoor` |
| Auth | `intern-auth@file` |

## Verwandte Seiten

- [Datenbanken](../_referenz/datenbanken.md) -- SSOT für DB-Name `djangodb`, Benutzer und Vault-Pfad
- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Medien und Static Files
