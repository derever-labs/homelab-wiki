---
title: Uptime Kuma
description: Internes Verfuegbarkeits-Monitoring fuer alle Services ausserhalb der Kern-Infrastruktur, plus Push-Monitore fuer Batch-Jobs
tags:
  - service
  - monitoring
  - nomad
---

# Uptime Kuma

Uptime Kuma ueberwacht alle Services, die **nicht** zur Kern-Infrastruktur gehoeren (Media, Productivity, AI, IoT, Dashboards etc.) sowie Push-Monitore fuer Batch-Jobs. Die Kern-Infrastruktur liegt bei [Gatus](../gatus/index.md) -- die beiden Tools decken sich bewusst nicht.

## Uebersicht

| Attribut | Wert |
|----------|------|
| URL | [uptime.ackermannprivat.ch](https://uptime.ackermannprivat.ch) |
| Deployment | Nomad Job `monitoring/uptime-kuma.nomad` |
| Persistente Daten | MariaDB `uptime_kuma` auf `10.0.2.125:3306` (Connection-Config in `/app/data/db-config.json` im Container) |
| Storage | Linstor CSI Volume `uptime-kuma-data` (nur fuer Logs und DB-Backup-Dumps, nicht fuer Live-DB) |
| Constraint | `vm-nomad-client-0[56]` (folgt dem Volume) |
| Auth | `intern-auth@file` (Authentik ForwardAuth) |
| Push-Endpoint | `/api/push/<token>` (via `intern-noauth`, ohne Auth) |
| Secrets | 1Password `PRIVAT Agent / Monitoring Uptime Kuma` (Prometheus-Metrics API-Key) |

## Rolle im Stack

Uptime Kuma ist das **Flaechen-Monitoring**. Es deckt alle Services ab, die fuer den End-User spuerbar sind. Batch-Jobs (Backups, Scheduled Tasks) senden zusaetzlich Heartbeats an Kuma-Push-Monitore -- damit laesst sich "Hat der Job heute morgen gelaufen?" ohne Log-Parsing beantworten.

Alle Monitore alarmieren via Single-Notifier "Keep" mit Default Enabled (siehe [Alerting](#alerting)). Die Severity-Klasse ergibt sich aus dem Monitor selbst (Down = `critical`); das Topic-Routing entscheidet Keep.

## Abgrenzung Gatus / Uptime Kuma

::: info Welches Tool ueberwacht was
- **Gatus** ([Details](../gatus/index.md)) -- Kern-Infrastruktur (Ingress, SSO, DNS, Nomad/Consul/Vault, Storage). Jeder Endpoint alarmiert sofort. ~19 Checks.
- **Uptime Kuma** -- Alles andere. Apps, Media, Productivity, AI, IoT, Remote, Dashboards. Plus Push-Monitore fuer Batch-Jobs. Alarmierung via Single-Notifier "Keep" mit Default Enabled (alle Monitore senden ueber denselben Notifier).
:::

::: warning Keine Ueberlappung
Ein Service liegt entweder in Gatus **oder** in Uptime Kuma, nie in beiden. Wird ein Service kritisch genug fuer sofortige Alerts, wandert er von Kuma nach Gatus. Duplikate im Wiki (`uptime-kuma/` und `gatus/`) sind explizit nicht erwuenscht -- wer einen Service sucht, verlinkt zur System-Seite.
:::

## Push-Monitore (Batch Jobs)

Batch-Jobs senden nach erfolgreichem Lauf einen HTTP GET an `https://uptime.ackermannprivat.ch/api/push/<token>`. Der `intern-noauth@file`-Middleware-Bypass auf dem Pfad-Prefix `/api/push/` umgeht Authentik, damit Jobs ohne OIDC-Handshake pushen koennen.

Aktuell bekannte Push-Monitore:

- **Keepalived T-01 / T-02** -- Heartbeat aus dem Traefik-HA-Keepalived-Notify-Script
- **Linstor Backup Monitor** -- Taegliche S3-Backup-Kontrolle, siehe [Monitoring Stack](../monitoring/index.md#backup-monitoring)
- **PostgreSQL Backup** -- Taegliches pg_dumpall auf NFS, siehe [Monitoring Stack](../monitoring/index.md#backup-monitoring)
- **InfluxDB Downsampling-Tasks** -- 6 Flux-Tasks mit Heartbeat pro Task, siehe [Monitoring Stack](../monitoring/index.md#influxdb-downsampling-tasks)

## Kern-Infra-Mindestabdeckung

Zusaetzlich zu den App-Monitoren fuehrt Uptime Kuma eine Kopie der Gatus-Kern-Infrastruktur-Pruefungen als **unabhaengige zweite Meinung**. Die kanonische Quelle der Kern-Check-Liste ist das Gatus-Nomad-Template (siehe [Gatus](../gatus/index.md)); Kuma-Monitore sind mit dem Tag `Infrastruktur` (tag_id=1) gruppiert.

### Nomad / Consul / Vault Stack

Server- und Client-VMs werden getrennt gemonitort -- Server-VMs (`.104/.105/.106`) sind die Control-Plane (kleine VMs auf pve00-02), Client-VMs (`.124/.125/.126`) sind die Worker-Nodes mit Linstor-CSI-Storage.

- `Consul Server API 04/05/06` -- `http://10.0.2.10x:8500/v1/status/leader`
- `Vault Server Health 04/05/06` -- `http://10.0.2.10x:8200/v1/sys/health?standbyok=true&perfstandbyok=true`
- `Nomad Server API 04/05/06` -- `https://10.0.2.10x:4646/v1/status/leader`
- `Nomad Client API 04/05/06` -- `https://10.0.2.12x:4646/v1/agent/health` (eingerichtet 2026-05-13, nach c04-OOM-Vorfall)
- `Nomad Token -- vm-nomad-server-04/05/06` -- Push-Monitor vom Server-Agent
- `Nomad Token -- vm-nomad-client-04/05/06` -- Push-Monitor vom Client-Agent

::: warning Kuma-CRUD nur per Direkt-SQL
Kuma v2 bietet keinen Admin-API-Endpunkt fuer Monitor-Create/Update. Das UI arbeitet ueber Socket.IO mit Session-Cookie. Bulk-Aenderungen (z.B. Nachziehen wenn Gatus eine Kernliste umbaut) laufen per MariaDB-`INSERT`/`UPDATE` gegen `uptime_kuma` auf `10.0.2.125:3306`, anschliessend `docker restart` des Kuma-Containers fuer Cache-Reload. Vor Bulk-Aenderungen `mariadb-dump` der Tabellen `monitor`, `monitor_tag`, `tag` als Backup nach `/app/data/`. Letzter Bulk-Insert: 2026-05-13 (3 Nomad-Client-API-Monitore + Rename der Server-Monitore zur Disambiguierung).
:::

## Alerting

Uptime Kuma nutzt **genau einen** Webhook-Notifier "Keep" mit aktivem `Default Enabled`. Damit haengt der Notifier automatisch an jedem neuen wie bestehenden Monitor; ein Coverage-Gap pro Monitor entsteht nicht.

- **Notifier-Name** -- Keep
- **Provider-Type** -- Webhook
- **URL** -- `https://keep.ackermannprivat.ch/alerts/event/uptime-kuma`
- **HTTP-Method** -- POST mit JSON-Payload
- **Default Enabled** -- aktiviert

Severity-Klasse, Topic-Wahl und Bot-Routing entscheidet Keep (siehe [Keep](../monitoring/keep.md)). Discord, Email oder andere Notifier in Uptime Kuma sind nicht Teil der Architektur und werden nicht angelegt.

::: info Redundanz Gatus + Uptime Kuma
Beide Tools schicken via Keep, nicht direkt an Telegram (Gatus ueber `telegram-relay` mit Webhook-Backend, Kuma ueber den `Keep`-Notifier). Die Redundanz bleibt erhalten: faellt Gatus oder Kuma einseitig aus, alarmiert das verbliebene Tool weiter ueber den gleichen Keep-Hub. Bei Kern-Infra-Ausfaellen koennen parallele Nachrichten aus beiden Quellen eingehen -- gewollt, weil Routing dann zweifach an denselben Topic landet und Single-Point-of-Failure im Alerting vermieden wird.
:::

## Entscheidungslog

- **Gatus als zusaetzliche Status-Seite**, Uptime Kuma bleibt fuer Flaechenabdeckung + Push-Monitore. Gruende: Gatus ist config-basiert (GitOps), Uptime Kuma ist click-driven und eignet sich besser fuer Experimente und kurzfristige Monitore.
- **Kein zentraler Alert-Kanal**, die Redundanz zwischen Gatus und Kuma ist Feature. Ein Ausfall eines Tools kaschiert keine Kern-Probleme.
- **Metrics-Endpoint mit API-Key**, nicht per Authentik -- dadurch kann der API-Key fuer Read-only-Scraper unabhaengig rotiert werden.

## Verwandte Seiten

- [Gatus](../gatus/index.md) -- Kern-Infra-Status-Seite, alarmiert sofort
- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, InfluxDB, Alloy
- [Telegram-Bots](../monitoring/telegram-bots.md) -- Telegram-Relay-Architektur
- [Backup-Strategie](../backup/index.md) -- Push-Monitore fuer Backup-Jobs
- [Traefik Referenz](../traefik/referenz.md) -- `intern-auth` und `intern-noauth`-Middleware-Chains
