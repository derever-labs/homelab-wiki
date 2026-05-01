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

Bis April 2026 lief Watchtower als Update-Mechanismus. Es hat Container direkt aktualisiert -- ohne Review, ohne Rollback-Möglichkeit, ohne Audit-Trail. Das war besonders bei stateful Services (Datenbanken, Authentik) riskant. Renovate löst dieses Problem durch kontrollierte Updates via Pull Requests mit differenziertem Auto-Merge und ist seit 2026-04-14 der alleinige Update-Mechanismus -- Watchtower wurde vollständig zurückgebaut.

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
- **Digest-Updates** (Layer-Rebuilds ohne Tag-Änderung): Automatisch gemerged
- **Vulnerability-Alerts** (CVE-Updates, GitHub/OSV-getrieben): Automatisch gemerged, Label `security`. Diese Regel überschreibt `matchUpdateTypes`, greift also auch bei Minor- oder Major-Sprüngen wenn eine CVE der Anlass ist.
- **Minor-Updates** (z.B. 1.2 → 1.3): Pull Request mit Label `minor-update`, manuelles Review
- **Major-Updates** (z.B. 1.x → 2.x): Pull Request mit Label `major-update`, kein Auto-Merge

Kombiniert mit der schlanken CD-Pipeline-Blocklist bedeutet das: Patches, Digests und Security-Fixes landen nach Merge automatisch im Cluster (Merge = Review-Gate). Siehe [github-runner/referenz.md](../github-runner/referenz.md#blocklist).

### Stateful-Blocklist

Folgende Packages werden nie automatisch gemerged, auch nicht bei Patch/Digest oder Vulnerability-Alerts: `postgres`, `redis`, `mariadb`, `mongo`, `couchdb`, `influxdb`, `authentik`, `ldap`, `keycloak`, `gitea`, `vaultwarden`, `nextcloud`, `n8nio/n8n`. Diese PRs erhalten das Label `stateful`. Grund: Breaking-Changes via Patch-Level-Tags sind bei stateful Services real (Schema-Migrationen, n8nio/n8n ist ein bekannter Fall).

## Dependency Dashboard

Renovate erstellt in jedem gescannten Repository ein GitHub Issue als Dependency Dashboard. Dieses Issue zeigt eine Übersicht aller erkannten Dependencies, offenen PRs und blockierten Updates.

## Voraussetzungen

- **Vault Secret** `kv/renovate`: GitHub Fine-grained PAT mit Scope Contents, Issues, Pull Requests (R/W) auf alle Repositories im `derever`-Account
- **Vault Secret** `kv/uptime-kuma`: Push-URL für Erfolgs-Monitoring (`renovate_push`)
- **NFS-Volume:** `/nfs/renovate-cache` für den Renovate-Cache (beschleunigt wiederholte Scans)
- **Node Constraint:** `vm-nomad-client-0[456]` (NFS-Zugang erforderlich)

## Monitoring

Zwei Pfade ergänzen sich:

- **Job-Health** -- Nach erfolgreichem Abschluss sendet Renovate einen Push an Uptime Kuma. Der Push-Monitor hat ein Heartbeat-Intervall von 25 Stunden, sodass ein einzelner fehlgeschlagener Lauf noch keinen Alarm auslöst. Bleibt der Push länger aus, alarmiert Uptime Kuma -- damit ist nur der "Renovate läuft nicht" Fall abgedeckt.
- **Backlog-Health** -- Ein zweiter Batch-Job `renovate-backlog-watchdog` läuft täglich um 06:00 (1h nach Renovate). Er zählt offene Renovate-PRs älter als 7 Tage und schickt einen Alert an Keep (`/alerts/event/keep`, Source `github`, Topic CI/CD). Severity-Schwellen: ab 10 PRs `warning`, ab 25 `high`, ab 50 `critical`. Unter 10 PRs sendet er `resolved`, womit Keep den Alert schliesst. Damit wird nicht nur Job-Tot, sondern auch ein wachsender Review-Backlog sichtbar.

## Job-Datei

- `nomad-jobs/batch-jobs/renovate.nomad` -- Renovate selbst
- `nomad-jobs/batch-jobs/renovate-backlog-watchdog.nomad` -- Backlog-Watchdog (Keep)

## Verwandte Seiten

- [Batch Jobs](./batch-jobs.md) -- Gesamtübersicht aller periodischen Jobs
- [Nomad Jobs](../_referenz/nomad-jobs.md) -- Verzeichnisstruktur und Konventionen
- [Monitoring Stack](../monitoring/index.md) -- Uptime Kuma Push-Monitore
