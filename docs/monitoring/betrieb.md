---
title: Monitoring Betrieb
description: Betrieb des Monitoring Stacks -- Grafana-Admin, Alert-Silencing, Backup-Monitoring und Wartung
tags:
  - service
  - monitoring
  - betrieb
---

# Monitoring Betrieb

Betriebs-Prozeduren des Monitoring Stacks: Admin-Zugang zur Grafana-HTTP-API, das Silencing von Alerts, das Backup-Monitoring und die laufende Wartung. Architektur und Alert-Routing stehen im [Monitoring Stack](./index.md), die Referenz-Tabellen in der [Monitoring Referenz](./referenz.md).

## Admin-Zugang zur Grafana-HTTP-API

Interner Admin-Zugang (ohne Authentik-ForwardAuth) läuft über einen Grafana Service Account mit Bearer-Token:

- 1P-Item `Grafana API Claude` (Vault `PRIVAT Agent`) -- SA-Name `claude-automation`, Admin-Rolle, ewiges Token
- Aufruf-Pfad: SSH-Tunnel auf einen Nomad-Client, Target ist `grafana.service.consul` mit dynamischem Nomad-Port aus dem Consul-Catalog
- Authentik-Kette entfällt, solange der Tunnel direkt auf die Container-Adresse zielt

Für GitOps-Deploys (Dashboards) existiert weiterhin der separate SA `gitops-dashboards`, dessen Token über Vault gezogen wird -- siehe [Deployment](./index.md#deployment).

## Alerts silencen

Silences werden über die Alertmanager-API gesetzt, nicht über die UI -- so bleibt die Silence-Historie im Git-Workflow nachvollziehbar und Silences sind scriptbar.

- Endpoint: `POST /api/alertmanager/grafana/api/v2/silences`
- Matcher nach `alertname` (mit `isRegex` für Pattern), Laufzeit per `startsAt`/`endsAt`, Grund ins `comment`-Feld mit ClickUp-Task-Referenz
- Silence-ID in den ClickUp-Task schreiben, damit das Entfernen nach Fix zurückverfolgbar ist

::: info Silence-Policy
Silences müssen einen ClickUp-Task referenzieren und eine Laufzeit (14--30 Tage) haben. Ohne Laufzeit-Limit verlieren sich Silences im Noise. Wenn ein Silence ausläuft bevor die Ursache gefixt ist, erzeugt der erneute Alert den Druck, den Fix zu priorisieren.
:::

## Backup-Monitoring

### Linstor Backup Monitor
Ein separates Script (`/usr/local/bin/linstor-backup-monitor.sh`) prüft um 06:00 Uhr den Status der S3-Backups und meldet via Uptime Kuma Push.

### PostgreSQL Backup
Der Nomad Batch-Job `postgres-backup` führt täglich ein `pg_dumpall` durch und sichert auf NFS (`/nfs/backup/postgres/`). Status wird via Uptime Kuma Push gemeldet.

## Wartung

### Grafana Dashboards
Dashboards sind als JSON unter `nomad-jobs/monitoring/grafana-dashboards/` im Git versioniert. Jeder Merge auf `main` triggert den Workflow `deploy-grafana-dashboards.yml`, der nur die geänderten Dashboards via API nach Grafana pusht. Rollbacks laufen über `git revert` -- der Workflow pushed die vorherige Version zurück. Manuelle UI-Änderungen gehen bis zum nächsten API-Push -- für dauerhafte Änderungen muss das JSON ins Git.

::: tip Initial-Upload / force-all
Der Workflow kennt einen `workflow_dispatch` mit Flag `force_all`, der alle Dashboards (ausser `_backup`/`_research`) einmal durchpusht. Wird nach grösseren Refactorings oder bei Neueinrichtung einer Grafana-Instanz genutzt.
:::

### InfluxDB Downsampling-Tasks
6 Flux-Tasks in der InfluxDB-UI aggregieren Rohdaten in 1y- und 5y-Buckets (`telegraf`, `proxmox`, `homeassistant`). Source-of-Truth ist `nomad-jobs/monitoring/influxdb-tasks/` -- das README dort dokumentiert Task-IDs, Zeitpläne und den Import-Pfad in die UI. Jeder Task sendet einen Heartbeat an einen Uptime-Kuma Push-Monitor, sodass ein Task-Ausfall innert ~1h auffällt.

## Verwandte Seiten

- [Monitoring Stack](./index.md) -- Übersicht, Architektur und Alert-Routing
- [Monitoring Referenz](./referenz.md) -- Alert-Regeln, Log-Quellen und Log-Levels
- [Uptime Kuma](../uptime-kuma/index.md) -- Synthetic-Monitoring und Push-Monitore
- [Backup-Strategie](../backup/index.md) -- Backup-Monitoring via Uptime Kuma Push
