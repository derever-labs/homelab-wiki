---
title: DbGate
description: Web-basiertes Database Management Tool für den PostgreSQL Shared Cluster
tags:
  - service
  - core
  - database
  - nomad
---

# DbGate

DbGate ist ein leichtgewichtiger Database Manager, der im Browser läuft. Er bietet SQL-Editor, Schema-Browser und Datenexport für den zentralen PostgreSQL Cluster.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [dbgate.ackermannprivat.ch](https://dbgate.ackermannprivat.ch) |
| Deployment | Nomad Job `databases/dbgate.nomad` |
| Auth | `intern-auth@file` (Authentik ForwardAuth) |
| Storage | NFS `/nfs/docker/dbgate/data` |

## Architektur

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
}

direction: right

User: Admin User { class: node }
Traefik: "Traefik\nintern-auth" { class: node }
DbGate: "DbGate\n(host network)" { class: node }
PG: "PostgreSQL\nShared Cluster" { shape: cylinder }
NFS: "NFS Storage" { shape: cylinder }

User -> Traefik: HTTPS
Traefik -> DbGate
DbGate -> PG: localhost:5432
DbGate -> NFS: Verbindungsdaten
```

## Datenbankzugriff

DbGate läuft im `host` Network Mode auf denselben Nodes wie PostgreSQL (`vm-nomad-client-05` / `vm-nomad-client-06`). Dadurch ist der PostgreSQL Cluster über `localhost:5432` erreichbar -- es wird kein externer Netzwerkzugriff auf die Datenbank exponiert.

::: tip Warum Host Network?
Der Host Network Mode vermeidet, dass PostgreSQL über das Netzwerk exponiert werden muss. DbGate greift direkt über `127.0.0.1:5432` zu -- gleich wie die anderen Services auf dem Node.
:::

## Persistenz

Verbindungskonfigurationen und gespeicherte Queries werden im Container unter `/root/.dbgate` persistiert (NFS-Mount, siehe Storage-Zeile in der Übersicht).

## Verwandte Seiten

- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster und Datenbankzuordnung
- [Backup-Strategie](../backup/index.md) -- PostgreSQL Backup via pg_dumpall
- [Traefik Reverse Proxy](../traefik/index.md) -- Ingress mit intern-auth Middleware
