---
title: Batch Jobs
description: Übersicht aller periodischen Nomad Jobs für Wartung, Backup, Monitoring und Updates
tags:
  - runbook
  - nomad
  - batch
  - wartung
---

# Batch Jobs

Konsolidierte Übersicht aller periodischen Nomad Jobs. Die Job-Dateien liegen im Repository unter `nomad-jobs/batch-jobs/` und `nomad-jobs/monitoring/`.

## Zeitplan

```d2
direction: right

t01: 01:00 { style.border-radius: 8 }
t03: 03:00 { style.border-radius: 8 }
t0330: 03:30 { style.border-radius: 8 }
t04: 04:00 { style.border-radius: 8 }
t05: 05:00 { style.border-radius: 8 }
t06: 06:00 { style.border-radius: 8 }

Bereinigung: Bereinigung {
  style.stroke-dash: 4
  dp: docker_prune { style.border-radius: 8; tooltip: "Docker System Prune -a --volumes" }
  dc: daily_cleanup { style.border-radius: 8; tooltip: "APT, Journal, Caches, /tmp" }
}

Backup: Backup {
  style.stroke-dash: 4
  ns: nomad-snapshot { style.border-radius: 8; tooltip: "Nomad Raft Snapshot → NFS GFS" }
  cs: consul-snapshot { style.border-radius: 8; tooltip: "Consul Raft Snapshot → NFS GFS" }
  vb: vault-backup { style.border-radius: 8; tooltip: "Vault Raft Snapshot → NFS GFS" }
  pb: postgres-backup { style.border-radius: 8; tooltip: "pg_dumpall → NFS GFS 7d/4w/3m" }
  ib: influxdb-backup { style.border-radius: 8; tooltip: "influx backup → NFS GFS" }
}

Neustart: Neustart {
  style.stroke-dash: 4
  rj: daily_restart_jellyfin { style.border-radius: 8 }
  rv: renovate { style.border-radius: 8; tooltip: "Docker Image Updates via GitHub PRs" }
}

Container: Container {
  style.stroke-dash: 4
  cr: daily_container_restart { style.border-radius: 8 }
}

t0130: 01:30 { style.border-radius: 8 }
t0145: 01:45 { style.border-radius: 8 }
t02: 02:00 { style.border-radius: 8 }

t01 -> Bereinigung.dp
t0130 -> Backup.ns
t0145 -> Backup.cs
t02 -> Backup.vb
t03 -> Backup.pb
t0330 -> Backup.ib
t04 -> Neustart.rj
t05 -> Neustart.rv
t05 -> Bereinigung.dc
t06 -> Container.cr
```

## Job-Übersicht

### Wartung

| Job | Typ | Schedule | Zweck | Node Constraint | Besonderheiten |
|:----|:----|:---------|:------|:----------------|:---------------|
| `daily_cleanup` | sysbatch | Täglich 05:00 | APT-Bereinigung, Journal-Vacuum, Jellyfin-Caches, /tmp, Docker Prune | Alle Nodes (count=3, distinct_hosts) | raw_exec, Priorität 100 |
| `docker_prune` | sysbatch | Täglich 01:00 | Docker System Prune (Images, Volumes, Container) | Alle Nodes | raw_exec, aggressiv (`-a --volumes`) |

::: warning Überlappung daily_cleanup und docker_prune
`daily_cleanup` enthält ebenfalls `docker system prune -f --volumes`. `docker_prune` läuft zusätzlich mit `-a` (entfernt auch ungenutzte Images). Beide Jobs sind bewusst getrennt, da `docker_prune` aggressiver ist.
:::

### Neustart

| Job | Typ | Schedule | Zweck | Node Constraint | Besonderheiten |
|:----|:----|:---------|:------|:----------------|:---------------|
| `daily_container_restart` | sysbatch | Täglich 06:00 | Jellyfin via `nomad job restart` neustarten | Alle Nodes | raw_exec, Priorität 100 |
| `daily_restart_jellyfin` | batch | Täglich 04:00 | Jellyfin via Nomad HTTP API neustarten | Nur `vm-nomad-client-05` | exec, `curl POST /v1/job/jellyfin/restart` |

::: danger Duplikat: Jellyfin-Neustart
`daily_container_restart` und `daily_restart_jellyfin` starten beide Jellyfin täglich neu -- mit unterschiedlichen Methoden und Zeitpunkten. Zusätzlich startet `daily_reboot` um 04:00 alle Nodes neu, was Jellyfin ebenfalls betrifft. Diese Redundanz sollte konsolidiert werden.
:::

### Backup

| Job | Typ | Schedule | Zweck | Node Constraint | Besonderheiten |
|:----|:----|:---------|:------|:----------------|:---------------|
| `postgres-backup` | batch | Täglich 03:00 | pg_dumpall mit GFS-Rotation nach NFS | `vm-nomad-client-0[456]` (regexp) | Docker, Vault Secrets, Uptime Kuma Push, Retry 2x |
| `influxdb-backup` | batch | Täglich 03:30 | influx backup mit GFS-Rotation nach NFS | `vm-nomad-client-0[456]` (regexp) | Docker, Vault Secrets, Retry 2x |
| `consul-snapshot` | batch | Täglich 01:45 | Consul Raft Snapshot mit GFS-Rotation nach NFS | `vm-nomad-client-0[456]` (regexp) | Docker, Uptime Kuma Push |
| `nomad-snapshot` | batch | Täglich 01:30 | Nomad Raft Snapshot mit GFS-Rotation nach NFS | `vm-nomad-client-0[456]` (regexp) | Docker, Uptime Kuma Push |
| `vault-backup` | batch | Täglich 02:00 | Vault Raft Snapshot mit GFS-Rotation nach NFS | `vm-nomad-client-0[456]` (regexp) | Docker, Vault Secrets, Uptime Kuma Push |

Details zur Backup-Architektur und zum Restore-Konzept: [Backup-Strategie](../backup/index.md)

### Updates

| Job | Typ | Schedule | Zweck | Node Constraint | Besonderheiten |
|:----|:----|:---------|:------|:----------------|:---------------|
| `renovate` | batch | Täglich 05:00 | Kontrollierte Docker-Image-Updates via GitHub PRs | `vm-nomad-client-0[456]` (regexp) | Docker, Vault Secrets, NFS-Cache, Uptime Kuma Push |

::: info Renovate ersetzt Watchtower
Watchtower (`watchtower.nomad`, `count = 0`) ist deaktiviert. Renovate erstellt Pull Requests für veraltete Images statt sie direkt zu aktualisieren. Patch-Updates werden automatisch gemerged, Major-Updates und stateful Services (Datenbanken, Authentik) erfordern manuelles Review. Details: [Renovate](./renovate.md)
:::

## Reihenfolge und Abhängigkeiten

Die Jobs laufen unabhängig voneinander, aber die zeitliche Staffelung ist bewusst gewählt:

1. **01:00** -- `docker_prune`: Bereinigt Docker-Ressourcen
1. **01:30** -- `nomad-snapshot`: Nomad Raft Snapshot
1. **01:45** -- `consul-snapshot`: Consul Raft Snapshot
1. **02:00** -- `vault-backup`: Vault Raft Snapshot
2. **03:00** -- `postgres-backup`: Datenbank-Backup
3. **03:30** -- `influxdb-backup`: Metriken-Backup (nach PostgreSQL)
4. **04:00** -- `daily_restart_jellyfin`: Jellyfin-Neustart
4. **05:00** -- `renovate`: Docker-Image-Updates via PRs
5. **05:00** -- `daily_cleanup`: System-Bereinigung
6. **06:00** -- `daily_container_restart`: Jellyfin-Neustart (Duplikat, konsolidieren)

## Konsolidierungspotenzial

- **Jellyfin-Neustarts:** Zwei Jobs starten Jellyfin neu (`daily_container_restart`, `daily_restart_jellyfin`). Einer davon würde genügen.
- **Docker Prune:** Läuft sowohl in `docker_prune` als auch in `daily_cleanup`. Könnte in einem Job zusammengefasst werden.

## Verwandte Seiten

- [Backup-Strategie](../backup/index.md) -- PostgreSQL Backup Architektur und Restore-Konzept
- [Kontrolliertes Herunterfahren](./smart-shutdown.md) -- Drain-Prozess bei Wartungsarbeiten
- [Monitoring Stack](../monitoring/index.md) -- Uptime Kuma Push-Monitore für Backup-Status
- [Renovate](./renovate.md) -- Kontrollierte Docker-Image-Updates via GitHub PRs
- [Zot Container Registry](../docker-registry/index.md) -- Registry für gespiegelte Docker Images
