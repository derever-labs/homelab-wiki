---
title: Keep
description: Incident-Hub und Alert-Routing für das Homelab
tags:
  - service
  - monitoring
  - alerting
  - keep
---

# Keep

Keep ist der zentrale Incident-Hub im Homelab. Alle Alert-Quellen (Gatus, Grafana, Uptime Kuma, Authentik, Sonarr, Radarr, Prowlarr, CheckMK, Notifiarr, Immo-Scraper) schicken ihre Events an einen Endpoint statt jede Quelle einzeln mit Telegram zu verdrahten. Keep korreliert, dedupliziert und routet anschliessend in die passenden Forum-Topics des Telegram-Channels `Homelab Alerts`.

## Zweck

- **Single Point of Routing** -- Alle Alerting-Quellen treffen sich auf `https://keep.ackermannprivat.ch/alerts/event/<source>`. Änderungen an Bot oder Topics passieren in Keep, nicht in jeder Quelle.
- **Deduplizierung** -- Wiederkehrende Alerts mit gleichem Fingerprint lösen nur eine Telegram-Nachricht aus, weitere identische werden bis zum Status-Wechsel oder Resolve unterdrückt.
- **Severity-Eskalation** -- Standard-Alerts gehen über `batch-Bot` in Forum-Topics; `critical | high | page` eskaliert zusätzlich an `vip-Bot` in den 1:1-Chat für sofortige Sichtbarkeit.
- **Incident-Management (seit 2026-05-19)** -- Alerts werden automatisch zu Incidents korreliert. Service-Topology mit 10 Hauptservices + Catch-all-Rule (per source+host, 5min-Window) gruppiert eingehende Alerts. UI-Sicht "Was brennt jetzt": `https://keep.ackermannprivat.ch/incidents?status=Open`. Lifecycle: Open -> Acknowledged -> Resolved (manuelles Ack in Keep-UI).

## "Was brennt jetzt"-Dashboard

[`https://keep.ackermannprivat.ch/incidents?status=Open`](https://keep.ackermannprivat.ch/incidents?status=Open) -- Faceted-Filter zeigt alle offenen Incidents mit Severity, Source, Service, Assignee. Erste Anlaufstelle bei Alarm. Aus Telegram-Notification per Klick auf den Master-Template-Link erreichbar.

Service-Topology (10 Services): [`/topology`](https://keep.ackermannprivat.ch/topology) -- wiki, jellyfin, keep, postgres, vault, nomad, consul, traefik, monitoring, pihole. Bootstrap-Script: `nomad-jobs/monitoring/keep-bootstrap/`.

Correlation-Rules: [`/rules`](https://keep.ackermannprivat.ch/rules) -- aktuell 1 Catch-all-Rule. Service-Topology-Correlation läuft als Hintergrund-Processor (`KEEP_TOPOLOGY_PROCESSOR=true` Env-Var).

## Konfiguration

- **URL** -- [keep.ackermannprivat.ch](https://keep.ackermannprivat.ch)
- **Consul-Service** -- `keep` (Frontend), `keep-backend` (API + Webhook-Endpoint)
- **Auth UI** -- Authentik ForwardAuth (`authentik-app@file`)
- **Auth Webhooks** -- `chain-no-auth@file` auf `/alerts/event/*`, damit Quellen ohne Token pushen können
- **Database** -- PostgreSQL (`postgres.service.consul`, DB `keep`)
- **Cache** -- Redis-Sidecar, ephemeral
- **Storage** -- Linstor CSI-Volume `keep-data` für Backend-State (Provider-Secrets als `SECRET_MANAGER_TYPE=FILE`)
- **Job** -- `nomad-jobs/monitoring/keep.nomad`
- **Tokens** -- 1P `Monitoring Telegram Bots` (default + vip + batch Bot)

## Drei Eingangs-Pfade zu Keep

Quellen erreichen Keep auf einem von drei Wegen, je nachdem ob sie eigenes Alerting mitbringen oder nur Rohdaten liefern. Alle drei münden im selben Hub und durchlaufen anschliessend dieselbe Routing- und Dedup-Logik.

::: info 1. Direct-Webhook
Die Quelle hat eigenes Alerting und postet direkt an `keep.ackermannprivat.ch/alerts/event/<source>`. Kein Storage dazwischen. Beispiele: Grafana Unified Alerting, CheckMK Notifications, Authentik Events, Gatus, Sonarr/Radarr/Prowlarr/Notifiarr, Immo-Scraper.
:::

::: info 2. Log-basiert über Loki
Die Quelle liefert nur Logs, keine fertigen Alerts. Alloy nimmt sie auf, schreibt nach Loki, und Grafana definiert LogQL-Alert-Rules. Wenn die Rule feuert, postet Grafana den Webhook nach Keep. Beispiel: Failed SSH Logins, Traefik 5xx Spike, Vault Permission Denied.
:::

::: info 3. Metrik-basiert über InfluxDB
Telegraf scraped (SNMP, Prometheus, Exec), schreibt Zeitreihen nach InfluxDB. Grafana hat darauf Flux-Alert-Rules. Beispiel: LVM Thin Pool > 85%, DRBD Disconnected, SNMP-Target down.
:::

Faustregel für neue Quellen: hat sie einen Webhook-/Notifications-Mechanismus, immer Pfad 1. Liefert sie nur Logs (Syslog, Stdout), Pfad 2. Liefert sie nur Metriken (SNMP, Prometheus-Scrape, Exec), Pfad 3. Schwellwerte und Alert-Logik liegen in Pfad 2 und 3 ausschliesslich in Grafana -- die Quelle weiss nichts davon.

## Routing-Workflows

Sechs Source-Cluster, jeweils ein Workflow im Repo unter `nomad-jobs/monitoring/keep-workflows/`. Severity entscheidet pro Workflow über den Bot, Source über den Topic.

::: info Source -> Topic
- **monitoring** (Topic 3) -- gatus, kuma, uptime, grafana, checkmk, prometheus, telegraf, loki, test, keep
- **security** (Topic 4) -- authentik, crowdsec, security
- **ci-cd** (Topic 5) -- gitea, github, runner, ci
- **backup** (Topic 6) -- borg, restic, duplicati, backup, pbs
- **downloader** (Topic 7) -- sonarr, radarr, sabnzbd, prowlarr, jellyseerr, downloader, notifiarr, lazylibrarian
- **immo** (Topic 8) -- immo, scraper, immoscraper
:::

::: info Severity -> Bot
- **Default (alle Severitäten)** -- `telegram-homelab-batch` (Bot `batch_ackermann_bot`) schreibt in den entsprechenden Forum-Topic des Channels `Homelab Alerts` (chat-id `-1003971798942`)
- **critical | high | page** -- zusätzlich `telegram-homelab-vip` (Bot `top_uptime_ackermann_bot`) in den 1:1-Chat (chat-id `813893907`) für sofortige Sichtbarkeit
:::

Conditional Bot-Wahl erfolgt per `if:`-Statement in den Workflow-Actions. Keep wählt für einen Alert nur den ersten passenden Workflow (First-Match), die Severity-Logik liegt deshalb in **jedem** Source-Workflow doppelt vor.

## Deduplizierung

Default-Rule (Provider-Type `keep`) plus optional source-spezifische Rules. Fingerprint-Felder: `fingerprint`, `name`, `source`. Wiederholte Alerts mit gleichem Fingerprint lösen nur eine Telegram-Nachricht aus.

## Reload nach DB-Reset

Workflows sind als YAML versioniert und werden nach einem Keep-Reset per Multipart-Upload zurückgespielt. Pfad-Details und das Wieder-Aufspielen-Skript sind im README des Workflow-Verzeichnisses dokumentiert.

## Verwandte Dokumentation

- [Monitoring](index.md) -- Stack-Übersicht und Datenflüsse
- [Telegram-Bots](telegram-bots.md) -- Bot- und Channel-Inventar
- [Gatus](../gatus/index.md) -- Alert-Quelle (Direct-Webhook)
- [CheckMK](../checkmk/index.md) -- Alert-Quelle (Direct-Webhook)
- DCLab-Pendant: HSLU IT-Wiki `monitoring/ops/keep.md`
