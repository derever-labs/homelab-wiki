---
title: Uptime Kuma
description: Internes Verfügbarkeits-Monitoring für alle Services ausserhalb der Kern-Infrastruktur, plus Push-Monitore für Batch-Jobs
tags:
  - service
  - monitoring
  - nomad
---

# Uptime Kuma

Uptime Kuma überwacht alle Services, die **nicht** zur Kern-Infrastruktur gehören (Media, Productivity, AI, IoT, Dashboards etc.) sowie Push-Monitore für Batch-Jobs. Die Kern-Infrastruktur liegt bei [Gatus](../gatus/index.md) -- die beiden Tools decken sich bewusst nicht.

## Übersicht

| Attribut | Wert |
|----------|------|
| URL | [uptime.ackermannprivat.ch](https://uptime.ackermannprivat.ch) |
| Deployment | Nomad Job `monitoring/uptime-kuma.nomad` |
| Storage | Live-DB in zentraler MariaDB (`mariadb.service.consul`, Datenbank `uptime_kuma`, siehe [Datenbanken](../_referenz/datenbanken.md)); Uploads/Screenshots auf Linstor CSI Volume `uptime-kuma-data-r2` |
| Auth | `intern-auth@file` (Authentik ForwardAuth, Gruppe `admin`); Kuma-Eigen-Login deaktiviert (`disableAuth=true`, seit 2026-06-08 -- Authentik ist die alleinige Schutzschicht); Push-Pfad `/api/push/` via `intern-noauth@file` ohne Auth |
| Secrets | DB-Passwort aus Vault `kv/data/shared/mariadb` (`uptime_kuma_password`); Prometheus-Metrics-API-Key in 1Password `PRIVAT Agent / Monitoring Uptime Kuma` |

## Rolle im Stack

Uptime Kuma ist das **Flächen-Monitoring**. Es deckt alle Services ab, die für den End-User spürbar sind. Batch-Jobs (Backups, Scheduled Tasks) senden zusätzlich Heartbeats an Kuma-Push-Monitore -- damit lässt sich "Hat der Job heute morgen gelaufen?" ohne Log-Parsing beantworten. Die Kern-Infrastruktur dagegen liegt bei [Gatus](../gatus/index.md), das jeden Endpoint sofort alarmiert.

Alle Monitore alarmieren via Single-Notifier "Keep" mit Default Enabled (siehe [Alerting](#alerting)). Die Severity-Klasse ergibt sich aus dem Monitor selbst (Down = `critical`); das Topic-Routing entscheidet Keep.

::: warning Keine Überlappung
Ein Service liegt entweder in Gatus **oder** in Uptime Kuma, nie in beiden. Wird ein Service kritisch genug für sofortige Alerts, wandert er von Kuma nach Gatus. Duplikate im Wiki (`uptime-kuma/` und `gatus/`) sind explizit nicht erwünscht -- wer einen Service sucht, verlinkt zur System-Seite.
:::

## Push-Monitore (Batch Jobs)

Batch-Jobs senden nach erfolgreichem Lauf einen HTTP GET an `https://uptime.ackermannprivat.ch/api/push/<token>`. Der `intern-noauth@file`-Middleware-Bypass auf dem Pfad-Prefix `/api/push/` umgeht Authentik, damit Jobs ohne OIDC-Handshake pushen können.

Aktuell bekannte Push-Monitore:

- **Keepalived T-01 / T-02** -- Heartbeat aus dem Traefik-HA-Keepalived-Notify-Script
- **Linstor Backup Monitor** -- Tägliche S3-Backup-Kontrolle, siehe [Monitoring Stack](../monitoring/index.md#backup-monitoring)
- **PostgreSQL Backup** -- Tägliches pg_dumpall auf NFS, siehe [Monitoring Stack](../monitoring/index.md#backup-monitoring)
- **InfluxDB Downsampling-Tasks** -- 6 Flux-Tasks mit Heartbeat pro Task, siehe [Monitoring Stack](../monitoring/index.md#influxdb-downsampling-tasks)

## Kern-Infra-Mindestabdeckung

Zusätzlich zu den App-Monitoren führt Uptime Kuma eine Kopie der Gatus-Kern-Infrastruktur-Prüfungen als **unabhängige zweite Meinung**. Die kanonische Quelle der Kern-Check-Liste ist das Gatus-Nomad-Template (siehe [Gatus](../gatus/index.md)); Kuma-Monitore sind mit dem Tag `Infrastruktur` (tag_id=1) gruppiert.

### Nomad / Consul / Vault Stack

Server- und Client-VMs werden getrennt gemonitort -- die Server-VMs `vm-nomad-server-04/05/06` sind die Control-Plane (kleine VMs auf pve00-02), die Client-VMs `vm-nomad-client-04/05/06` sind die Worker-Nodes mit Linstor-CSI-Storage (IPs siehe [Hosts und IPs](../_referenz/hosts-und-ips.md)).

- `Consul Server API 04/05/06` -- `/v1/status/leader` auf Consul der drei Server-VMs (Port 8500)
- `Vault Server Health 04/05/06` -- `/v1/sys/health?standbyok=true&perfstandbyok=true` auf Vault der Server-VMs (Port 8200)
- `Nomad Server API 04/05/06` -- `/v1/status/leader` auf den Server-VMs (Port 4646, TLS)
- `Nomad Client API 04/05/06` -- `/v1/agent/health` auf den Client-VMs (Port 4646, TLS)
- `Nomad Token -- vm-nomad-server-04/05/06` -- Push-Monitor vom Server-Agent
- `Nomad Token -- vm-nomad-client-04/05/06` -- Push-Monitor vom Client-Agent

::: warning Kuma-CRUD nur per Direkt-SQL
Kuma v2 bietet keinen Admin-API-Endpunkt für Monitor-Create/Update. Das UI arbeitet über Socket.IO mit Session-Cookie. Bulk-Änderungen (z.B. Nachziehen wenn Gatus eine Kernliste umbaut) laufen per MariaDB-`INSERT`/`UPDATE` gegen die Datenbank `uptime_kuma` (`mariadb.service.consul`), anschliessend `docker restart` des Kuma-Containers für Cache-Reload. Vor Bulk-Änderungen `mariadb-dump` der Tabellen `monitor`, `monitor_tag`, `tag` als Backup nach `/app/data/`.
:::

## Alerting

Uptime Kuma nutzt **genau einen** Webhook-Notifier "Keep" mit aktivem `Default Enabled`. Damit hängt der Notifier automatisch an jedem neuen wie bestehenden Monitor; ein Coverage-Gap pro Monitor entsteht nicht.

- **Notifier-Name** -- Keep
- **Provider-Type** -- Webhook
- **URL** -- `https://keep.ackermannprivat.ch/alerts/event/uptime-kuma`
- **HTTP-Method** -- POST mit JSON-Payload
- **Default Enabled** -- aktiviert

Severity-Klasse, Topic-Wahl und Bot-Routing entscheidet Keep (siehe [Keep](../monitoring/keep.md)). Discord, Email oder andere Notifier in Uptime Kuma sind nicht Teil der Architektur und werden nicht angelegt.

::: info Redundanz Gatus + Uptime Kuma
Beide Tools senden via Keep (Gatus über `telegram-relay` mit Webhook-Backend, Kuma über den `Keep`-Notifier). Fällt eines der Tools aus, alarmiert das andere weiter über den gleichen Keep-Hub -- ein Single-Point-of-Failure im Alerting wird so vermieden.
:::

## Entscheidungslog

- **Gatus als zusätzliche Status-Seite**, Uptime Kuma bleibt für Flächenabdeckung + Push-Monitore. Gründe: Gatus ist config-basiert (GitOps), Uptime Kuma ist click-driven und eignet sich besser für Experimente und kurzfristige Monitore.
- **Kein zentraler Alert-Kanal**, die Redundanz zwischen Gatus und Kuma ist Feature. Ein Ausfall eines Tools kaschiert keine Kern-Probleme.
- **Metrics-Endpoint mit API-Key**, nicht per Authentik -- dadurch kann der API-Key für Read-only-Scraper unabhängig rotiert werden.

## Verwandte Seiten

- [Gatus](../gatus/index.md) -- Kern-Infra-Status-Seite, alarmiert sofort
- [Monitoring Stack](../monitoring/index.md) -- Grafana, Loki, InfluxDB, Alloy
- [Telegram-Bots](../monitoring/telegram-bots.md) -- Telegram-Relay-Architektur
- [Backup-Strategie](../backup/index.md) -- Push-Monitore für Backup-Jobs
- [Traefik Referenz](../traefik/referenz.md) -- `intern-auth` und `intern-noauth`-Middleware-Chains
