---
title: Uptime Kuma
description: Internes Verfügbarkeits-Monitoring für alle Services ausserhalb der Kern-Infrastruktur, plus Push-Monitore für Batch-Jobs
tags:
  - service
  - monitoring
  - nomad
---

# Uptime Kuma

Uptime Kuma ist seit dem Gatus-Rückbau (2026-06-10) die **einzige** Synthetic-Monitoring-Schicht des Homelabs. Es überwacht sowohl die Kern-Infrastruktur (Ingress, SSO, DNS, Nomad/Consul/Vault, Storage) als auch alle übrigen Services (Media, Productivity, AI, IoT, Dashboards etc.) und führt zusätzlich Push-Monitore für Batch-Jobs.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [uptime.ackermannprivat.ch](https://uptime.ackermannprivat.ch) |
| Deployment | Nomad Job `monitoring/uptime-kuma.nomad` |
| Storage | Live-DB in zentraler MariaDB (`mariadb.service.consul`, Datenbank `uptime_kuma`, siehe [Datenbanken](../_referenz/datenbanken.md)); Uploads/Screenshots auf Linstor CSI Volume `uptime-kuma-data-r2` |
| Auth | `intern-auth@file` (Authentik ForwardAuth, Gruppe `admin`); Kuma-Eigen-Login deaktiviert (`disableAuth=true`, seit 2026-06-08 -- Authentik ist die alleinige Schutzschicht); Push-Pfad `/api/push/` via `intern-noauth@file` ohne Auth |
| Secrets | DB-Passwort aus Vault `kv/data/shared/mariadb` (`uptime_kuma_password`); Prometheus-Metrics-API-Key in 1Password `PRIVAT Agent / Monitoring Uptime Kuma` |

## Rolle im Stack

Uptime Kuma deckt die gesamte Synthetic-Überwachung ab: die Kern-Infrastruktur (jeder Endpoint alarmiert sofort), das **Flächen-Monitoring** aller End-User-spürbaren Services und die **Push-Monitore** für Batch-Jobs (Backups, Scheduled Tasks). Damit lässt sich "Hat der Job heute morgen gelaufen?" ohne Log-Parsing beantworten.

Alle Monitore alarmieren via Single-Notifier "Keep" mit Default Enabled (siehe [Alerting](#alerting)). Die Severity-Klasse ergibt sich aus dem Monitor selbst (Down = `critical`); das Topic-Routing entscheidet Keep.

Die Monitore sind in sieben thematische Gruppen organisiert (Plattform, Netz, Storage & Backup, Auth, Monitoring, Media, Apps & Tools); die Gruppierung ist in `nomad-jobs/monitoring/group-kuma-monitors.py` reproduzierbar abgelegt.

## Push-Monitore (Batch Jobs)

Batch-Jobs senden nach erfolgreichem Lauf einen HTTP GET an `https://uptime.ackermannprivat.ch/api/push/<token>`. Der `intern-noauth@file`-Middleware-Bypass auf dem Pfad-Prefix `/api/push/` umgeht Authentik, damit Jobs ohne OIDC-Handshake pushen können.

Aktuell bekannte Push-Monitore:

- **Keepalived T-01 / T-02** -- Heartbeat aus dem Traefik-HA-Keepalived-Notify-Script
- **Linstor Backup Monitor** -- Tägliche S3-Backup-Kontrolle, siehe [Monitoring Stack](../monitoring/index.md#backup-monitoring)
- **PostgreSQL Backup** -- Tägliches pg_dumpall auf NFS, siehe [Monitoring Stack](../monitoring/index.md#backup-monitoring)
- **InfluxDB Downsampling-Tasks** -- 6 Flux-Tasks mit Heartbeat pro Task, siehe [Monitoring Stack](../monitoring/index.md#influxdb-downsampling-tasks)

## Kern-Infra-Mindestabdeckung

Uptime Kuma überwacht die Kern-Infrastruktur direkt -- jeder Endpoint alarmiert sofort. Die Monitore liegen in den Gruppen `Plattform` (Nomad/Consul/Vault/Linstor), `Netz` (Pi-hole, Traefik, Keepalived), `Auth` (Authentik) und `Storage & Backup` (NAS-TCP, PBS, Linstor, Backup-Jobs).

### Nomad / Consul / Vault Stack

Server- und Client-VMs werden getrennt gemonitort -- die Server-VMs `vm-nomad-server-04/05/06` sind die Control-Plane (kleine VMs auf pve00-02), die Client-VMs `vm-nomad-client-04/05/06` sind die Worker-Nodes mit Linstor-CSI-Storage (IPs siehe [Hosts und IPs](../_referenz/hosts-und-ips.md)).

- `Consul Server API 04/05/06` -- `/v1/status/leader` auf Consul der drei Server-VMs (Port 8500)
- `Vault Server Health 04/05/06` -- `/v1/sys/health?standbyok=true&perfstandbyok=true` auf Vault der Server-VMs (Port 8200)
- `Nomad Server API 04/05/06` -- `/v1/status/leader` auf den Server-VMs (Port 4646, TLS)
- `Nomad Client API 04/05/06` -- `/v1/agent/health` auf den Client-VMs (Port 4646, TLS)
- `Nomad Token -- vm-nomad-server-04/05/06` -- Push-Monitor vom Server-Agent
- `Nomad Token -- vm-nomad-client-04/05/06` -- Push-Monitor vom Client-Agent

::: warning Kuma-CRUD nur per Direkt-SQL
Kuma v2 bietet keinen Admin-API-Endpunkt für Monitor-Create/Update. Das UI arbeitet über Socket.IO mit Session-Cookie. Skript-getriebene Änderungen laufen über die `uptime-kuma-api`-Lib (Socket.IO, siehe `group-kuma-monitors.py`); Bulk-Änderungen alternativ per MariaDB-`INSERT`/`UPDATE` gegen die Datenbank `uptime_kuma` (`mariadb.service.consul`), anschliessend `docker restart` des Kuma-Containers für Cache-Reload. Vor Bulk-Änderungen `mariadb-dump` der Tabellen `monitor`, `monitor_tag`, `tag` als Backup nach `/app/data/`.
:::

## Alerting

Uptime Kuma nutzt **genau einen** Webhook-Notifier "Keep" mit aktivem `Default Enabled`. Damit hängt der Notifier automatisch an jedem neuen wie bestehenden Monitor; ein Coverage-Gap pro Monitor entsteht nicht.

- **Notifier-Name** -- Keep
- **Provider-Type** -- Webhook
- **URL** -- `https://keep.ackermannprivat.ch/alerts/event/uptime-kuma`
- **HTTP-Method** -- POST mit JSON-Payload
- **Default Enabled** -- aktiviert

Severity-Klasse, Topic-Wahl und Bot-Routing entscheidet Keep (siehe [Keep](../monitoring/keep.md)). Discord, Email oder andere Notifier in Uptime Kuma sind nicht Teil der Architektur und werden nicht angelegt.

::: info Keep-unabhängiger Watchdog
Damit ein stiller Keep-Ausfall sichtbar bleibt, existiert zusätzlich die Notification "Keep-Watchdog (direkt, Keep-unabhängig)", die den Push-Monitor `keep-heartbeat` direkt nach Telegram alarmiert -- nicht über Keep. Details siehe [Keep](../monitoring/keep.md).
:::

## Entscheidungslog

- **Gatus zurückgebaut** (2026-06-10) -- die separate Gatus-Status-Seite entfiel; Uptime Kuma übernimmt die Kern-Infra-Checks direkt. Grund: Zwei Synthetic-Tools nebeneinander erzeugten doppelte Pflege und ein zweites Alert-Schema, ohne echten Redundanzgewinn (beide liefen auf demselben Cluster). Die Kern-Endpoints sind jetzt reproduzierbar in `group-kuma-monitors.py` gruppiert.
- **Metrics-Endpoint mit API-Key**, nicht per Authentik -- dadurch kann der API-Key für Read-only-Scraper unabhängig rotiert werden.

## Verwandte Seiten

- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, InfluxDB, Alloy
- [Telegram-Bots](../monitoring/telegram-bots.md) -- Telegram-Relay-Architektur
- [Backup-Strategie](../backup/index.md) -- Push-Monitore für Backup-Jobs
- [Traefik Referenz](../traefik/referenz.md) -- `intern-auth` und `intern-noauth`-Middleware-Chains
