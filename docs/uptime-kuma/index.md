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
| Storage | Linstor CSI Volume `uptime-kuma-data` |
| Constraint | `vm-nomad-client-0[56]` (folgt dem Volume) |
| Auth | `intern-auth@file` (Authentik ForwardAuth) |
| Push-Endpoint | `/api/push/<token>` (via `intern-noauth`, ohne Auth) |
| Secrets | 1Password `PRIVAT Agent / Monitoring Uptime Kuma` (Prometheus-Metrics API-Key) |

## Rolle im Stack

Uptime Kuma ist das **Flaechen-Monitoring**. Es deckt alle Services ab, die fuer den End-User spuerbar sind, aber beim Ausfall nicht sofort einen Telegram-Alert wert sind. Batch-Jobs (Backups, Scheduled Tasks) senden zusaetzlich Heartbeats an Kuma-Push-Monitore -- damit laesst sich "Hat der Job heute morgen gelaufen?" ohne Log-Parsing beantworten.

Die strikte Trennung zu Gatus: Gatus alarmiert sofort via Telegram, Kuma zeigt rot im Dashboard aber alarmiert nur bei den wenigen Services mit Benachrichtigungs-Konfig.

## Abgrenzung Gatus / Uptime Kuma

::: info Welches Tool ueberwacht was
- **Gatus** ([Details](../gatus/index.md)) -- Kern-Infrastruktur (Ingress, SSO, DNS, Nomad/Consul/Vault, Storage). Jeder Endpoint alarmiert sofort. ~19 Checks.
- **Uptime Kuma** -- Alles andere. Apps, Media, Productivity, AI, IoT, Remote, Dashboards. Plus Push-Monitore fuer Batch-Jobs. Alarmierung nur bei Bedarf pro Monitor.
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

::: warning Kuma-CRUD nur per Direkt-SQL
Kuma v2 bietet keinen Admin-API-Endpunkt fuer Monitor-Create/Update. Das UI arbeitet ueber Socket.IO mit Session-Cookie. Bulk-Aenderungen (z.B. Nachziehen wenn Gatus eine Kernliste umbaut) laufen per `sqlite3 /app/data/kuma.db` im Kuma-Container plus anschliessendem `docker restart` fuer Cache-Reload. Letzter Bulk-Insert: 2026-04-17, Backup unter `/app/data/kuma.db.bak-2026-04-17`.
:::

## Alerting

Uptime Kuma hat eine eigene Telegram-Notification-Konfiguration. Nicht jeder Monitor braucht einen Alert -- die Entscheidung haengt davon ab, wie kritisch ein stilles Ausfallen ist. Services deren Ausfall fuer 24h unbemerkt bleiben darf, laufen ohne Alert.

::: warning Kuma und Gatus senden beide an Telegram
Bei Kern-Infra-Ausfaellen koennen parallele Nachrichten aus Gatus (ueber `telegram-relay`) und Uptime Kuma eingehen. Beide Pfade sind gewollt -- sie bestaetigen sich gegenseitig und vermeiden Single-Point-of-Failure im Alerting.
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
