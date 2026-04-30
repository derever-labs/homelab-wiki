---
title: Keep
description: Incident-Hub und Alert-Routing fuer das Homelab
tags:
  - service
  - monitoring
  - alerting
  - keep
---

# Keep

Keep ist der zentrale Incident-Hub im Homelab. Alle Alert-Quellen (Gatus, Grafana, Uptime Kuma, Authentik, Sonarr, Radarr, Prowlarr, CheckMK, Notifiarr, Immo-Scraper) schicken ihre Events an einen Endpoint statt jede Quelle einzeln mit Telegram zu verdrahten. Keep korreliert, dedupliziert und routet anschliessend in die passenden Forum-Topics des Telegram-Channels `Homelab Alerts`.

## Zweck

- **Single Point of Routing** -- Alle Alerting-Quellen treffen sich auf `https://keep.ackermannprivat.ch/alerts/event/<source>`. Aenderungen an Bot oder Topics passieren in Keep, nicht in jeder Quelle.
- **Deduplizierung** -- Wiederkehrende Alerts mit gleichem Fingerprint loesen nur eine Telegram-Nachricht aus, weitere identische werden bis zum Status-Wechsel oder Resolve unterdrueckt.
- **Severity-Eskalation** -- Standard-Alerts gehen ueber `batch-Bot` in Forum-Topics; `critical | high | page` eskaliert zusaetzlich an `vip-Bot` in den 1:1-Chat fuer sofortige Sichtbarkeit.

## Konfiguration

- **URL** -- [keep.ackermannprivat.ch](https://keep.ackermannprivat.ch)
- **Consul-Service** -- `keep` (Frontend), `keep-backend` (API + Webhook-Endpoint)
- **Auth UI** -- Authentik ForwardAuth (`authentik-app@file`)
- **Auth Webhooks** -- `chain-no-auth@file` auf `/alerts/event/*`, damit Quellen ohne Token pushen koennen
- **Database** -- PostgreSQL (`postgres.service.consul`, DB `keep`)
- **Cache** -- Redis-Sidecar, ephemeral
- **Storage** -- Linstor CSI-Volume `keep-data` fuer Backend-State (Provider-Secrets als `SECRET_MANAGER_TYPE=FILE`)
- **Job** -- `nomad-jobs/monitoring/keep.nomad`
- **Tokens** -- 1P `Monitoring Telegram Bots` (default + vip + batch Bot)

## Drei Eingangs-Pfade zu Keep

Quellen erreichen Keep auf einem von drei Wegen, je nachdem ob sie eigenes Alerting mitbringen oder nur Rohdaten liefern. Alle drei muenden im selben Hub und durchlaufen anschliessend dieselbe Routing- und Dedup-Logik.

::: info 1. Direct-Webhook
Die Quelle hat eigenes Alerting und postet direkt an `keep.ackermannprivat.ch/alerts/event/<source>`. Kein Storage dazwischen. Beispiele: Grafana Unified Alerting, CheckMK Notifications, Authentik Events, Gatus, Sonarr/Radarr/Prowlarr/Notifiarr, Immo-Scraper.
:::

::: info 2. Log-basiert ueber Loki
Die Quelle liefert nur Logs, keine fertigen Alerts. Alloy nimmt sie auf, schreibt nach Loki, und Grafana definiert LogQL-Alert-Rules. Wenn die Rule feuert, postet Grafana den Webhook nach Keep. Beispiel: Failed SSH Logins, Traefik 5xx Spike, Vault Permission Denied.
:::

::: info 3. Metrik-basiert ueber InfluxDB
Telegraf scraped (SNMP, Prometheus, Exec), schreibt Zeitreihen nach InfluxDB. Grafana hat darauf Flux-Alert-Rules. Beispiel: LVM Thin Pool > 85%, DRBD Disconnected, SNMP-Target down.
:::

Faustregel fuer neue Quellen: hat sie einen Webhook-/Notifications-Mechanismus, immer Pfad 1. Liefert sie nur Logs (Syslog, Stdout), Pfad 2. Liefert sie nur Metriken (SNMP, Prometheus-Scrape, Exec), Pfad 3. Schwellwerte und Alert-Logik liegen in Pfad 2 und 3 ausschliesslich in Grafana -- die Quelle weiss nichts davon.

## Routing-Workflows

Sechs Source-Cluster, jeweils ein Workflow im Repo unter `nomad-jobs/monitoring/keep-workflows/`. Severity entscheidet pro Workflow ueber den Bot, Source ueber den Topic.

::: info Source -> Topic
- **monitoring** (Topic 3) -- gatus, kuma, uptime, grafana, checkmk, prometheus, telegraf, loki, test, keep
- **security** (Topic 4) -- authentik, crowdsec, security
- **ci-cd** (Topic 5) -- gitea, github, runner, ci
- **backup** (Topic 6) -- borg, restic, duplicati, backup, pbs
- **downloader** (Topic 7) -- sonarr, radarr, sabnzbd, prowlarr, jellyseerr, downloader, notifiarr, lazylibrarian
- **immo** (Topic 8) -- immo, scraper, immoscraper
:::

::: info Severity -> Bot
- **Default (alle Severitaeten)** -- `telegram-homelab-batch` (Bot `batch_ackermann_bot`) schreibt in den entsprechenden Forum-Topic des Channels `Homelab Alerts` (chat-id `-1003971798942`)
- **critical | high | page** -- zusaetzlich `telegram-homelab-vip` (Bot `top_uptime_ackermann_bot`) in den 1:1-Chat (chat-id `813893907`) fuer sofortige Sichtbarkeit
:::

Conditional Bot-Wahl erfolgt per `if:`-Statement in den Workflow-Actions. Keep waehlt fuer einen Alert nur den ersten passenden Workflow (First-Match), die Severity-Logik liegt deshalb in **jedem** Source-Workflow doppelt vor.

## Deduplizierung

Default-Rule (Provider-Type `keep`) plus optional source-spezifische Rules. Fingerprint-Felder: `fingerprint`, `name`, `source`. Wiederholte Alerts mit gleichem Fingerprint loesen nur eine Telegram-Nachricht aus.

## Reload nach DB-Reset

Workflows sind als YAML versioniert und werden nach einem Keep-Reset per Multipart-Upload zurueckgespielt. Pfad-Details und das Wieder-Aufspielen-Skript sind im README des Workflow-Verzeichnisses dokumentiert.

## Verwandte Dokumentation

- [Monitoring](index.md) -- Stack-Uebersicht und Datenfluesse
- [Telegram-Bots](telegram-bots.md) -- Bot- und Channel-Inventar
- [Gatus](../gatus/index.md) -- Alert-Quelle (Direct-Webhook)
- [CheckMK](../checkmk/index.md) -- Alert-Quelle (Direct-Webhook)
- DCLab-Pendant: HSLU IT-Wiki `monitoring/ops/keep.md`
