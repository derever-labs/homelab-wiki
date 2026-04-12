---
title: Zugangsdaten
description: Speicherorte von Zugangsdaten und Tokens
tags:
  - referenz
  - security
  - credentials
---

# Zugangsdaten

::: danger Keine Passwörter im Wiki
Diese Seite listet NUR die Speicherorte von Zugangsdaten. Keine Passwörter oder Tokens im Wiki.
:::

## Vault KV Secrets

Alle Service-Secrets liegen in Vault unter dem KV v2 Mount. Nomad Jobs authentifizieren sich über Workload Identity (JWT) und erhalten Secrets zur Laufzeit.

| Service | Vault-Pfad | Inhalt |
| :--- | :--- | :--- |
| PostgreSQL | `kv/data/postgres` | Superuser-Passwort |
| Radarr | `kv/data/radarr` | DB-Credentials |
| Sonarr | `kv/data/sonarr` | DB-Credentials |
| Prowlarr | `kv/data/prowlarr` | DB-Credentials |
| Jellyseerr | `kv/data/jellyseerr` | DB-Credentials |
| JellyStat | `kv/data/jellystat` | DB-Credentials |
| Paperless | `kv/data/paperless` | DB-Credentials, Secret Key |
| Gitea | `kv/data/gitea` | DB-Credentials |
| Tandoor | `kv/data/tandoor` | DB-Credentials, Secret Key |
| solidtime | `kv/data/solidtime` | DB-Credentials |
| n8n | `kv/data/n8n` | DB-Credentials, Encryption Key |
| Metabase | `kv/data/metabase` | DB-Credentials |

Vollständige Service-Datenbank-Zuordnung: [Datenbanken](./datenbanken.md)

## Token-Dateien

| Token | Speicherort | Verwendung |
| :--- | :--- | :--- |
| Consul Management Token | `infra/.consul-token` | Vollzugriff auf Consul API |
| Nomad Management Token | `infra/.nomad-token` | Vollzugriff auf Nomad API / UI |
| Vault Unseal Keys | `/etc/vault.d/unseal-keys` (auf Server-Nodes) | Automatisches Entsiegeln nach Reboot |

## 1Password

| Service | Vault | Item | Inhalt |
| :--- | :--- | :--- | :--- |
| UniFi | PRIVAT Agent | Ubiquiti Unifi Konto Ackermann | UI.com SSO + SSH-Passwort (UDM Pro) |

## Vault Authentifizierung

| Methode | Beschreibung |
| :--- | :--- |
| Root Token | Initialer Admin-Zugang (nur für Notfälle) |
| Workload Identity (JWT) | Nomad Jobs authentifizieren sich automatisch über `jwt-nomad` Auth Method |

## Verwandte Seiten

- [Vault](../vault/) -- Vault-Architektur und Konfiguration
- [Datenbanken](./datenbanken.md) -- Vollständige DB-Service-Zuordnung mit Vault-Pfaden
