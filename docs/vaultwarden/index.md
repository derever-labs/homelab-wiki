---
title: Vaultwarden
description: Selbstgehosteter Passwort-Manager (Bitwarden API kompatibel) mit SQLite und Litestream-Replikation
tags:
  - service
  - security
  - nomad
---

# Vaultwarden

## Übersicht

| Attribut | Wert |
| :--- | :--- |
| **Status** | Produktion |
| **URL** | [p.ackermannprivat.ch](https://p.ackermannprivat.ch) |
| **Deployment** | Nomad Job (`services/vaultwarden.nomad`) |
| **Storage** | NFS `/nfs/docker/vaultwarden` |
| **Datenbank** | SQLite (`db.sqlite3`), repliziert via Litestream |
| **Auth** | `public-auth@file` |

## Rolle im Stack

Vaultwarden ist der zentrale Passwort-Manager im Homelab. Als leichtgewichtige, in Rust geschriebene Reimplementierung der Bitwarden-Server-API ist er vollständig kompatibel mit den offiziellen Bitwarden-Clients (Desktop, Mobile, Browser-Extension). Alle Passwörter, TOTP-Secrets und sichere Notizen werden hier verwaltet.

## Architektur

Vaultwarden nutzt SQLite als Datenbank -- kein PostgreSQL-Shared-Cluster. Die Datenbank wird via Litestream kontinuierlich auf das NAS repliziert, was eine Point-in-Time-Recovery ermöglicht.

```d2
direction: right

Clients: Clients {
  style.stroke-dash: 4
  BRW: Browser Extension
  APP: Bitwarden App (iOS/Android/Desktop)
}

Traefik: Traefik (10.0.2.20) {
  style.stroke-dash: 4
  R1: Router: p.* (public-auth)
}

Nomad: Nomad Cluster {
  style.stroke-dash: 4
  VW: Vaultwarden
}

Storage: Storage {
  style.stroke-dash: 4
  NFS: NFS { tooltip: "/nfs/docker/vaultwarden" }
}

Clients.BRW -> Traefik.R1: HTTPS
Clients.APP -> Traefik.R1: HTTPS
Traefik.R1 -> Nomad.VW
Nomad.VW -> Storage.NFS
```

## Konfiguration

### Datenbank und Replikation

Vaultwarden speichert alle Daten in einer SQLite-Datei (`db.sqlite3`). Litestream repliziert diese Datei kontinuierlich auf das NAS, sodass bei einem Ausfall der letzte Stand wiederhergestellt werden kann.

### Sicherheit

- Traefik schützt den Zugang mit `public-auth@file` (CrowdSec + Authentik ForwardAuth)
- Die Kommunikation erfolgt ausschliesslich verschlüsselt via HTTPS
- Registrierung neuer Benutzer ist deaktiviert

## Backup

- **Litestream:** Kontinuierliche SQLite-Replikation auf das NAS
- **NFS-Verzeichnis:** `/nfs/docker/vaultwarden` wird zusätzlich durch die allgemeine [Backup-Strategie](../backup/index.md) abgedeckt
- Tägliche Snapshots des gesamten Verzeichnisses empfohlen als zusätzliche Absicherung

## Verwandte Seiten

- [Backup-Strategie](../backup/index.md) -- Übergeordnetes Backup-Konzept
- [Traefik Middlewares](../traefik/referenz.md) -- Auth-Chain-Konfiguration
- [NAS-Speicher](../nas-storage/index.md) -- Litestream-Replikationsziel
