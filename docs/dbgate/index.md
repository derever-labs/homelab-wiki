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

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [dbgate.ackermannprivat.ch](https://dbgate.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`databases/dbgate.nomad`) |
| **Auth** | Authentik ForwardAuth (`intern-auth`) |
| **Image** | `dbgate/dbgate:alpine` (via lokale Registry) |
| **Storage** | NFS `/nfs/docker/dbgate/data` |

## Architektur

DbGate ist ein leichtgewichtiger Database Manager, der im Browser läuft. Er bietet SQL-Editor, Schema-Browser und Datenexport für den zentralen PostgreSQL Cluster.

```mermaid
flowchart LR
    User:::entry["Admin User"]
    User -->|HTTPS| Traefik:::svc["Traefik<br/>intern-auth"]
    Traefik --> DbGate:::svc["DbGate<br/>(host network)"]
    DbGate -->|"localhost:5432"| PG:::db["PostgreSQL<br/>Shared Cluster"]
    DbGate -->|"Verbindungsdaten"| NFS:::db["NFS<br/>/nfs/docker/dbgate/data"]

    classDef entry fill:#fefce8,stroke:#eab308,stroke-width:1.5px,color:#1e293b
    classDef svc fill:#ecfdf5,stroke:#10b981,stroke-width:1.5px,color:#1e293b
    classDef db fill:#eff6ff,stroke:#3b82f6,stroke-width:1.5px,color:#1e293b
```

## Datenbankzugriff

DbGate läuft im `host` Network Mode auf denselben Nodes wie PostgreSQL (`vm-nomad-client-05` / `vm-nomad-client-06`). Dadurch ist der PostgreSQL Cluster über `localhost:5432` erreichbar -- es wird kein externer Netzwerkzugriff auf die Datenbank exponiert.

::: tip Warum Host Network?
Der Host Network Mode vermeidet, dass PostgreSQL über das Netzwerk exponiert werden muss. DbGate greift direkt über `127.0.0.1:5432` zu -- gleich wie die anderen Services auf dem Node.
:::

## Persistenz

Verbindungskonfigurationen und gespeicherte Queries werden unter `/root/.dbgate` im Container gespeichert, das auf NFS gemappt ist (`/nfs/docker/dbgate/data`). Dadurch bleiben die Einstellungen bei Container-Neustarts erhalten.

## Ressourcen

| Ressource | Wert |
| :--- | :--- |
| CPU | 256 MHz |
| Memory | 256 MB (max 512 MB) |

## Verwandte Seiten

- [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Shared Cluster und Datenbankzuordnung
- [Backup-Strategie](../backup/index.md) -- PostgreSQL Backup via pg_dumpall
- [Traefik Reverse Proxy](../traefik/index.md) -- Ingress mit intern-auth Middleware
