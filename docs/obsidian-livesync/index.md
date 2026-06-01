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
| URL | [obsidian-sync.ackermannprivat.ch](https://obsidian-sync.ackermannprivat.ch) \| Siehe [Web-Interfaces](../_referenz/web-interfaces.md) |
| Deployment | Nomad Job `services/obsidian-livesync.nomad` |
| Storage | Linstor CSI (`obsidian-livesync-data`) |
| Auth | `intern-noauth@file` + CouchDB Basic Auth |

## Rolle im Stack

Ein CouchDB-Server synchronisiert Obsidian-Vaults in Echtzeit zwischen mehreren Geräten (Desktop, Mobile). Die Synchronisation läuft über das CouchDB-Replikationsprotokoll.

## Architektur

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
}

direction: right

Clients: {
  style.stroke-dash: 4
  MAC: "Obsidian\n(macOS)" { class: node }
  IOS: "Obsidian\n(iOS)" { class: node }
}

Traefik: Traefik {
  style.stroke-dash: 4
  tooltip: 10.0.2.20
  R1: "Router: obsidian-sync.*\nintern-noauth + CORS" { class: node }
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  CDB: "CouchDB\n(Port 5984)" { class: node }
}

Storage: {
  style.stroke-dash: 4
  LINSTOR: "Linstor CSI\nobsidian-livesync-data" { shape: cylinder; class: node }
}

Clients.MAC -> Traefik.R1: HTTPS + Basic Auth
Clients.IOS -> Traefik.R1: HTTPS + Basic Auth
Traefik.R1 -> Nomad.CDB
Nomad.CDB -> Storage.LINSTOR
```

## Konfiguration

### Storage

CouchDB-Daten liegen auf einem replizierten Linstor-CSI-Volume (`obsidian-livesync-data`) mit DRBD-Replikation. CouchDB verwendet die eingebauten Defaults -- eine separate `local.ini` wird nicht eingebunden.

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

- [Traefik Middlewares](../traefik/referenz.md) -- CORS-Middleware und IP-Whitelist
- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [Linstor CSI](../linstor-storage/index.md) -- Replizierter Block-Storage (DRBD)
