---
title: Notifiarr
description: Notification Aggregator fuer den Media Stack
tags:
  - service
  - productivity
  - nomad
  - media
---

# Notifiarr

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [notifiarr.ackermannprivat.ch](https://notifiarr.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/notifiarr.nomad`) |
| **Storage** | NFS `/nfs/docker/notifiarr/config` |
| **Datenbank** | Keine (BoltDB/Konfigurationsdateien) |
| **Auth** | `admin-chain-v2@file` (UI), `intern-chain@file` (API) |

## Rolle im Stack

Notifiarr aggregiert Benachrichtigungen aus dem Media Stack (Radarr, Sonarr, etc.) und leitet sie gebündelt an Discord, Telegram oder andere Kanäle weiter. Zusätzlich synchronisiert Notifiarr Konfigurationen wie Quality Profiles und Custom Formats über die Arr-Apps hinweg mit dem Notifiarr-Cloud-Service.

## Konfiguration

### Storage

Die Konfiguration und BoltDB-Daten liegen auf NFS unter `/nfs/docker/notifiarr/config`. Es wird kein SQL-Datenbank-Backend verwendet.

### API-Routing

Notifiarr hat zwei Traefik-Router:

- **UI-Router** (`notifiarr`) -- Geschützt mit `admin-chain-v2@file` für Browser-Zugriff
- **API-Router** (`notifiarr-api`) -- Geschützt mit `intern-chain@file`, erfordert gültigen API-Key als Header (`X-Api-Key`) oder Query-Parameter. Wird von Arr-Apps für Callbacks verwendet.

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/notifiarr` | `ui_password` |

### System-Zugriff

Der Container mountet `/var/run/utmp` und `/etc/machine-id` vom Host für System-Monitoring-Funktionen (Disk, CPU, Memory Reports).

## Abhängigkeiten

- **Traefik** -- HTTPS-Routing und Middleware
- **Keycloak** -- OAuth2-Provider (über `admin-chain-v2`)
- **NFS** -- Konfigurationspersistenz
- **Arr-Apps** -- Radarr, Sonarr und weitere Media-Services senden Events an Notifiarr

## Verwandte Seiten

- [Arr-Stack](../arr-stack/index.md) -- Sonarr, Radarr und weitere Media-Services
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [NAS-Speicher](../nas-storage/index.md) -- NFS-Storage für Konfiguration
