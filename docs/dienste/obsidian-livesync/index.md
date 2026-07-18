---
title: Obsidian LiveSync
description: Selbstgehosteter Obsidian Sync Server mit CouchDB-Backend
tags:
  - service
  - productivity
  - nomad
  - obsidian
---

# Obsidian LiveSync

Obsidian LiveSync ersetzt den kostenpflichtigen Obsidian Sync Service durch eine selbstgehostete CouchDB-basierte Alternative.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [obsidian-sync.ackermannprivat.ch](https://obsidian-sync.ackermannprivat.ch) \| Siehe [Web-Interfaces](../../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/obsidian-livesync.nomad` |
| Storage | Linstor CSI (`obsidian-livesync-data`) |
| Auth | `intern-noauth@file` + CouchDB Basic Auth |

## Rolle im Stack

Ein CouchDB-Server synchronisiert Obsidian-Vaults in Echtzeit zwischen mehreren Geräten (Desktop, Mobile). Die Synchronisation läuft über das CouchDB-Replikationsprotokoll.

## Architektur

```d2
direction: right

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
}

Mac: "Obsidian\n(macOS)" { class: node }
iOS: "Obsidian\n(iOS)" { class: node }
Traefik: "Traefik: obsidian-sync.*\n(intern-noauth + CORS)" { class: node }
CDB: "CouchDB\n(Nomad Job)" { class: node }
Vol: "Linstor CSI\nobsidian-livesync-data" { shape: cylinder }

Mac -> Traefik: "HTTPS + Basic Auth"
iOS -> Traefik: "HTTPS + Basic Auth"
Traefik -> CDB
CDB -> Vol
```

## Konfiguration

### Storage

CouchDB-Daten liegen auf einem replizierten Linstor-CSI-Volume (`obsidian-livesync-data`) mit DRBD-Replikation. Der Job bindet zusätzlich zur image-generierten `docker.ini` eine eigene Konfigurationsdatei `zz-obsidian-livesync.ini` in `/opt/couchdb/etc/local.d/` ein. Sie setzt `single_node = true` (legt die System-Datenbanken `_users`/`_replicator`/`_global_changes` beim Start an), `require_valid_user = true`, `require_valid_user_except_for_up = true` (hält `/_up` ohne Auth erreichbar, damit der Consul-Health-Check ohne Credential auskommt) und ein `max_document_size` von 50 MB. Details: `services/obsidian-livesync.nomad`.

Der Job ist auf `vm-nomad-client-05` / `vm-nomad-client-06` eingeschränkt (Constraint), da nur diese Nodes Linstor-Storage bereitstellen.

### CORS

Für die Kommunikation zwischen Obsidian-Clients und CouchDB sind spezielle CORS-Header nötig. Diese werden über die Traefik-Middleware `obsidian-cors` gesetzt. Erlaubte Origins sind die Obsidian-App-Schemes `app://obsidian.md`, `capacitor://localhost` und `http://localhost`; die übrigen Werte (Methoden, Credentials) stehen in `services/obsidian-livesync.nomad`.

Doppelte Absicherung: Traefik schützt den Zugang mit `intern-noauth@file` (IP-Whitelist), CouchDB authentifiziert zusätzlich mit Basic Auth (Benutzer `obsidian`).

### Vault Secrets

| Pfad | Keys |
| :--- | :--- |
| `kv/data/obsidian-livesync` | `couchdb_password` |

::: warning Nur interner Zugriff
Der Service ist bewusst nur intern erreichbar (`intern-noauth@file`). Obsidian-Clients müssen sich im lokalen Netzwerk oder über VPN befinden.
:::

## Verwandte Seiten

- [Traefik Middlewares](../../edge/traefik/referenz.md) -- CORS-Middleware und IP-Whitelist
- [Backup-Strategie](../../storage/backup/index.md) -- Übergeordnetes Backup-Konzept
- [Linstor CSI](../../storage/linstor/index.md) -- Replizierter Block-Storage (DRBD)
