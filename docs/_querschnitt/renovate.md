---
title: Renovate
description: Automatische Docker-Image-Updates via GitHub Pull Requests
tags:
  - querschnitt
  - automation
  - nomad
  - batch
---

# Renovate

Renovate Self-Hosted scannt täglich alle Repositories im `derever`-Account nach veralteten Dependencies und erstellt Pull Requests für verfügbare Updates. Neben Docker-Images in Nomad-Dateien erkennt Renovate auch npm, Dockerfile, pip, GitHub Actions und weitere Dependency-Typen automatisch.

## Warum

Watchtower hat Container direkt aktualisiert -- ohne Review, ohne Rollback-Möglichkeit, ohne Audit-Trail. Das war besonders bei stateful Services (Datenbanken, Authentik) riskant. Renovate löst dieses Problem durch kontrollierte Updates via Pull Requests mit differenziertem Auto-Merge.

::: info Watchtower deaktiviert
`watchtower.nomad` ist auf `count = 0` gesetzt und wird nicht mehr ausgeführt. Renovate ist der alleinige Update-Mechanismus.
:::

## Funktionsweise

1. Der Job läuft täglich um 05:00 Uhr als periodischer Nomad Batch-Job
2. Renovate scannt alle `.nomad` und `.nomad.hcl` Dateien im Repository nach Docker-Image-Referenzen
3. Für jedes veraltete Image wird ein Branch und Pull Request erstellt
4. Je nach Update-Typ wird automatisch gemerged oder manuelles Review erwartet

### Image-Erkennung

Renovate verwendet drei Custom Regex Manager, um verschiedene Image-Formate in Nomad-Dateien zu erkennen:

- **Standard Docker Images:** `image = "name:tag"` -- wird direkt gegen die jeweilige Registry aufgelöst
- **Docker Hub Mirrors:** `localhost:5000/org/image:tag` -- wird gegen Docker Hub aufgelöst
- **GHCR Mirrors:** `localhost:5000/ghcr.io/org/image:tag` -- wird gegen GitHub Container Registry aufgelöst

### Auto-Merge-Regeln

- **Patch-Updates** (z.B. 1.2.3 → 1.2.4): Automatisch gemerged
- **Minor-Updates** (z.B. 1.2 → 1.3): Pull Request, manuelles Review
- **Major-Updates** (z.B. 1.x → 2.x): Pull Request mit Label `major-update`, kein Auto-Merge

### Stateful-Blocklist

Folgende Packages werden nie automatisch gemerged, unabhängig vom Update-Typ: `postgres`, `redis`, `mariadb`, `mongo`, `couchdb`, `influxdb`, `authentik`, `ldap`, `keycloak`, `gitea`, `vaultwarden`, `nextcloud`. Diese PRs erhalten das Label `stateful`.

## Dependency Dashboard

Renovate erstellt in jedem gescannten Repository ein GitHub Issue als Dependency Dashboard. Dieses Issue zeigt eine Übersicht aller erkannten Dependencies, offenen PRs und blockierten Updates.

## Voraussetzungen

- **Vault Secret** `kv/renovate`: GitHub Fine-grained PAT mit Scope Contents, Issues, Pull Requests (R/W) auf alle Repositories im `derever`-Account
- **Vault Secret** `kv/uptime-kuma`: Push-URL für Erfolgs-Monitoring (`renovate_push`)
- **NFS-Volume:** `/nfs/renovate-cache` für den Renovate-Cache (beschleunigt wiederholte Scans)
- **Node Constraint:** `vm-nomad-client-0[456]` (NFS-Zugang erforderlich)

## Monitoring

Nach erfolgreichem Abschluss sendet der Job einen Push an Uptime Kuma. Der Push-Monitor hat ein Heartbeat-Intervall von 25 Stunden, sodass ein einzelner fehlgeschlagener Lauf noch keinen Alarm auslöst.

## Job-Datei

`nomad-jobs/batch-jobs/renovate.nomad`

## Verwandte Dokumentation

- [Batch Jobs](./batch-jobs.md) -- Gesamtübersicht aller periodischen Jobs
- [Nomad Jobs](../_referenz/nomad-jobs.md) -- Verzeichnisstruktur und Konventionen
- [Monitoring Stack](../monitoring/index.md) -- Uptime Kuma Push-Monitore
