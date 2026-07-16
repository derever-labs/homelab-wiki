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
| Storage | Linstor CSI `dbgate-data` (`/root/.dbgate`) |

## Architektur

```d2
direction: right

classes: {
  node: {
    style: {
      border-radius: 8
    }
  }
  container: {
    style: {
      border-radius: 8
      stroke-dash: 4
    }
  }
}

Admin: "Admin" { class: node }
Traefik: "Traefik\n(intern-auth)" { class: node }

Node: "PostgreSQL-Node (client-05/06)" {
  class: container
  DbGate: "DbGate\n(host network)" { class: node }
  PG: "PostgreSQL\nShared Cluster" { shape: cylinder }
  DbGate -> PG: "localhost:5432"
}

Vol: "Linstor CSI\ndbgate-data" { shape: cylinder }

Admin -> Traefik: HTTPS
Traefik -> Node.DbGate: HTTP
Node.DbGate -> Vol: "Verbindungsprofile + Queries"
```

## Datenbankzugriff

DbGate läuft im `host` Network Mode auf denselben Nodes wie PostgreSQL (`vm-nomad-client-05` / `vm-nomad-client-06`). Dadurch ist der PostgreSQL Cluster über `localhost:5432` erreichbar.

::: tip Warum Host Network?
Der Host Network Mode vermeidet, dass PostgreSQL über das Netzwerk exponiert werden muss. DbGate greift direkt über `127.0.0.1:5432` zu -- gleich wie die anderen Services auf dem Node.
:::

## Persistenz

Verbindungskonfigurationen und gespeicherte Queries werden im Container unter `/root/.dbgate` persistiert (Linstor-CSI-Volume, siehe Storage-Zeile in der Übersicht).

## Verwandte Seiten

- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster und Datenbankzuordnung
- [Backup-Strategie](../storage/backup/index.md) -- PostgreSQL Backup via pg_dumpall
- [Traefik Reverse Proxy](../edge/traefik/index.md) -- Ingress mit intern-auth Middleware
