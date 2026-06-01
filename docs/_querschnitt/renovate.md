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

Renovate Self-Hosted scannt täglich alle Repositories der GitHub-Organisation `derever-labs` nach veralteten Dependencies und erstellt Pull Requests für verfügbare Updates. Neben Docker-Images in Nomad-Dateien erkennt Renovate auch npm, Dockerfile, pip, GitHub Actions und weitere Dependency-Typen automatisch.

## Warum

Bis April 2026 lief Watchtower als Update-Mechanismus. Es hat Container direkt aktualisiert -- ohne Review, ohne Rollback-Möglichkeit, ohne Audit-Trail. Das war besonders bei stateful Services (Datenbanken, Authentik) riskant. Renovate löst dieses Problem durch kontrollierte Updates via Pull Requests mit differenziertem Auto-Merge und ist seit 2026-04-14 der alleinige Update-Mechanismus -- Watchtower wurde vollständig zurückgebaut.

## Authentifizierung (GitHub App)

Renovate authentifiziert sich seit Mai 2026 über eine **GitHub App** (`renovate-derever-labs`), nicht mehr über einen Personal Access Token. Auslöser: der alte Fine-grained PAT verlor still den Repository-Zugriff (0 Repos, HTTP 404) und legte Renovate sieben Wochen lahm, ohne dass es auffiel. PATs sind die brüchige Klasse -- sie laufen ab, verlieren beim nachträglichen Editieren ihren Repo-Scope und hängen an einem persönlichen Konto statt an der Organisation.

Self-hosted Renovate kann App-Authentifizierung nicht nativ (Renovate-Issue #8196). Darum mintet ein vorgelagerter `token-mint`-Task pro Lauf ein einstündiges Installation-Token aus App-ID und Private-Key und legt es im geteilten Alloc-Verzeichnis für den Renovate-Task ab. Das einzige langlebige Geheimnis ist der App-Private-Key, der nie abläuft. Der Backlog-Watchdog nutzt dieselbe App und denselben Mint-Mechanismus.

## Funktionsweise

1. Der Job läuft täglich um 05:00 Uhr als periodischer Nomad Batch-Job
2. Renovate scannt alle `.nomad` und `.nomad.hcl` Dateien im Repository nach Docker-Image-Referenzen
3. Für jedes veraltete Image wird ein Branch und Pull Request erstellt
4. Je nach Update-Typ wird automatisch gemerged oder manuelles Review erwartet

### Image-Erkennung

Renovate verwendet drei Custom Regex Manager, um verschiedene Image-Formate in Nomad-Dateien zu erkennen:

- **Standard Docker Images:** `image = "name:tag"` -- wird direkt gegen die jeweilige Registry aufgelöst
- **Docker Hub Mirrors:** `zot.service.consul:5000/org/image:tag` -- wird gegen Docker Hub aufgelöst
- **GHCR Mirrors:** `zot.service.consul:5000/ghcr.io/org/image:tag` -- wird gegen GitHub Container Registry aufgelöst

### Auto-Merge-Regeln

- **Patch-Updates** (z.B. 1.2.3 → 1.2.4): Automatisch gemerged
- **Digest-Updates** (Layer-Rebuilds ohne Tag-Änderung): Automatisch gemerged
- **Vulnerability-Alerts** (CVE-Updates, GitHub/OSV-getrieben): Automatisch gemerged, Label `security`. Diese Regel überschreibt `matchUpdateTypes`, greift also auch bei Minor- oder Major-Sprüngen wenn eine CVE der Anlass ist.
- **Minor-Updates** (z.B. 1.2 → 1.3): Pull Request mit Label `minor-update`, manuelles Review
- **Major-Updates** (z.B. 1.x → 2.x): Pull Request mit Label `major-update`, kein Auto-Merge

Kombiniert mit der schlanken CD-Pipeline-Blocklist bedeutet das: Patches, Digests und Security-Fixes landen nach Merge automatisch im Cluster (Merge = Review-Gate). Siehe [github-runner/referenz.md](../github-runner/referenz.md#blocklist).

::: warning Kein CI-Gate -- ignoreTests
Die `derever-labs`-Repositories haben keine CI-Status-Checks. Renovate würde per Default vor jedem Auto-Merge auf grüne Checks warten und ohne Checks niemals mergen. Darum ist `ignoreTests` für die automergenden Regeln gesetzt -- der Merge entscheidet sich allein über Update-Typ und Stateful-Blocklist, ohne Test-Gate. Das ist bewusst: Patches, Digests und Security-Fixes sind risikoarm, das Review-Gate ist der Merge selbst.
:::

### Stateful-Blocklist

Folgende Packages werden nie automatisch gemerged, auch nicht bei Patch/Digest oder Vulnerability-Alerts: `postgres`, `redis`, `mariadb`, `mongo`, `couchdb`, `influxdb`, `authentik`, `ldap`, `keycloak`, `gitea`, `vaultwarden`, `nextcloud`, `n8nio/n8n`. Diese PRs erhalten das Label `stateful`. Grund: Breaking-Changes via Patch-Level-Tags sind bei stateful Services real (Schema-Migrationen, n8nio/n8n ist ein bekannter Fall).

## Dependency Dashboard

Renovate erstellt in jedem gescannten Repository ein GitHub Issue als Dependency Dashboard. Dieses Issue zeigt eine Übersicht aller erkannten Dependencies, offenen PRs und blockierten Updates.

## Voraussetzungen

- **Vault Secret** `kv/renovate`: GitHub-App-Credentials -- `app_id`, `app_installation_id` und der base64-kodierte Private-Key `app_private_key_b64`. Renovate und der Backlog-Watchdog minten daraus pro Lauf ein Installation-Token.
- **Vault Secret** `kv/uptime-kuma`: Push-URL für Erfolgs-Monitoring (`renovate_push`)
- **NFS-Volume:** `/nfs/renovate-cache` für den Renovate-Cache (beschleunigt wiederholte Scans)
- **Node Constraint:** `vm-nomad-client-0[456]` (NFS-Zugang erforderlich)

## Monitoring

Zwei Pfade ergänzen sich:

- **Job-Health** -- Nach erfolgreichem Abschluss sendet Renovate einen Push an Uptime Kuma. Der Push-Monitor hat ein Heartbeat-Intervall von 25 Stunden, sodass ein einzelner fehlgeschlagener Lauf noch keinen Alarm auslöst. Bleibt der Push länger aus, alarmiert Uptime Kuma -- damit ist nur der "Renovate läuft nicht" Fall abgedeckt.
- **Backlog-Health** -- Ein zweiter Batch-Job `renovate-backlog-watchdog` läuft täglich um 06:00 (1h nach Renovate). Er nutzt dieselbe GitHub App (eigener `token-mint`-Task) und zählt offene PRs des App-Bots `app/renovate-derever-labs`, die älter als 7 Tage sind, und schickt einen Alert an Keep (`/alerts/event/keep`, Source `github`, Fingerprint `renovate-backlog-derever-labs`). Severity-Schwellen: ab 10 PRs `warning`, ab 25 `high`, ab 50 `critical`. Unter 10 PRs sendet er `resolved`, womit Keep den Alert schliesst. Damit wird nicht nur Job-Tot, sondern auch ein wachsender Review-Backlog sichtbar.

## Job-Datei

- `nomad-jobs/batch-jobs/renovate.nomad` -- Renovate selbst
- `nomad-jobs/batch-jobs/renovate-backlog-watchdog.nomad` -- Backlog-Watchdog (Keep)

## Verwandte Seiten

- [Batch Jobs](./batch-jobs.md) -- Gesamtübersicht aller periodischen Jobs
- [Nomad Jobs](../_referenz/nomad-jobs.md) -- Verzeichnisstruktur und Konventionen
- [Monitoring Stack](../monitoring/index.md) -- Uptime Kuma Push-Monitore
