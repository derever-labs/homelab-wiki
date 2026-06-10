---
title: Telegram Bots
description: Bot- und Channel-Inventar für den Output-Channel von Keep
tags:
  - monitoring
  - alerting
  - telegram
  - notification
---

# Telegram Bots

Telegram ist der primäre Output-Channel der [Keep](keep.md)-Pipeline. Alle Alert-Quellen melden an Keep, Keep korreliert sie zu Incidents, und die Incident-Workflows posten über **einen einzigen Bot** (`batch`) nach Severity sortiert in eines von drei Forum-Topics des Channels `Homelab Alerts`. Stummschalten übernimmt Telegrams natives Per-Topic-Mute -- das gehört dem Empfänger, nicht der Routing-Logik.

## Rolle im Stack

Telegram ist **kein** dedizierter Service im Cluster -- es wird über die Bot-API von `api.telegram.org` angesprochen. Im Regelbetrieb gibt es genau einen Pfad: **Quelle -> Keep -> Incident -> batch-Bot -> Severity-Topic**. Direkte Bot-Aufrufe aus Services existieren nur noch für Apprise-Integrationen über den Telegram-Relay (siehe unten).

```d2
direction: right

vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  svc: { style: { border-radius: 8 } }
  agent: { style: { border-radius: 8; stroke-dash: 2 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  sink: { style: { border-radius: 8 } }
  idle: { style: { border-radius: 8; stroke-dash: 2; opacity: 0.5 } }
}

keep: Keep\nIncident-Engine { class: svc }

batch: batch-Bot\nbatch_ackermann_bot {
  class: agent
  tooltip: "Alleiniger Sender; Admin der Gruppe (can_manage_topics)"
}

vip: vip-Bot\ntop_uptime_ackermann_bot {
  class: idle
  tooltip: "Seit 2026-06-09 IDLE -- kein Workflow/Job sendet mehr"
}

forum: Homelab Alerts (Forum-Gruppe -1003971798942) {
  class: container
  krit: Kritisch (25009)\ncritical + high + fail-open { class: sink; tooltip: "Ack-Button, NIE muten" }
  warn: Warnung (25010)\nwarning { class: sink; tooltip: "eigener Mute-Schalter" }
  info: Info (25011)\ninfo + low { class: sink; tooltip: "default stumm-bar" }
}

keep -> batch: "Incident-Workflows\n(notify/escalate/ack/resolve)"
batch -> forum.krit: "severity not in\n[warning,info,low]"
batch -> forum.warn: "== warning"
batch -> forum.info: "in [info,low]"
```

## Severity-Topics statt VIP-DM (Cutover 2026-06-09)

Bis 2026-06-08 lief eine zweite Schiene: kritische Alerts gingen zusätzlich als 1:1-DM über den `vip`-Bot, und alle anderen in ein einziges Sammel-Topic (24554). Zwei Schmerzpunkte (Warnungen liessen sich nicht stummschalten ohne Critical mitzuverlieren; das Wichtige lag in einem separaten DM-Kanal) führten zum Cutover auf **drei Severity-Topics in der Gruppe**, alle über den batch-Bot:

| Topic-ID | Name | Severities | Verhalten |
| :--- | :--- | :--- | :--- |
| 25009 | Kritisch | `critical`, `high` + alles Unerwartete (fail-open) | laut, trägt Ack-Deep-Link-Button, **nie stummschalten** |
| 25010 | Warnung | `warning` | laut, eigener Per-Topic-Mute-Schalter |
| 25011 | Info | `info`, `low` | sichtbar, default stumm-bar |

Das **Kritisch-Gate ist bewusst fail-open** (`severity not in ['warning','info','low']`): es fängt `critical`/`high` UND jede unerwartete oder leere Severity (Grafana `labels.severity` ist ein Freitextfeld) -- nichts fällt lautlos durch. Stummschalten ist Telegram-nativer, gerätelokaler Per-Topic-Mute beim Empfänger; es steht nicht in Keep und ist nicht versioniert.

::: warning Restrisiko -- ein Token für alles
Seit dem Cutover sendet ausschliesslich der batch-Bot. Ein revozierter/abgelaufener batch-Token legt damit auch den Notfall-Kanal lahm. Die Erkennung bleibt über den Kuma-Push-Pfad bestehen, die Telegram-Zustellung hängt aber an diesem einen Token. Die ganze Gruppe darf deshalb **nie** gemutet werden -- nur das Info-Topic.
:::

## Drei Bots

- **batch** -- `batch_ackermann_bot`. Alleiniger Sender im Regelbetrieb. Admin der Gruppe `Homelab Alerts` (`can_manage_topics`), postet per `topic_id` (literaler Integer, nicht `message_thread_id`) in das Severity-Topic.
- **vip** -- `top_uptime_ackermann_bot`. Seit 2026-06-09 **idle** -- kein Workflow und kein Keep-unabhängiger Sender (Dead-Man-Switch, Kuma-Watchdogs) zielt noch auf ihn. Bewusst nicht deinstalliert, falls ein zweiter Token-Pfad künftig wieder gebraucht wird.
- **default** -- `uptime_ackermann_bot`. Legacy-Bot für Direct-Pushes aus Skripten. **Nicht** Teil des Keep-Routings. Wird vom Telegram-Relay (Apprise-Bridge) genutzt.

## Keep-unabhängige Sender (auch über batch -> Kritisch)

Drei Pfade alarmieren absichtlich an Keep vorbei, damit ein stiller Keep-Ausfall sichtbar wird -- alle drei posten seit dem Cutover über den batch-Bot ins Kritisch-Topic (25009):

- **Dead-Man-Switch** (`keep-heartbeat-watch.nomad`) -- alle 3 min Kuma-Heartbeat + Watch auf stale-firing Incidents; meldet Keep-interne Fehler direkt.
- **Kuma-Watchdog-Tier** -- drei Uptime-Kuma-Instanzen (in-cluster Monitor `keep-heartbeat`, `wd-home`, `wd-nana`) mit einem Custom-Template, das die Kuma-Standardmeldung um eine `Kuma-Watchdog`-Kennzeile und den Uptime-Link ergänzt, damit die Herkunft auf einen Blick klar ist.

Details siehe [Keep](keep.md#dead-man-switch-und-watchdog-tier).

## Telegram-Relay (Apprise-Bridge)

Der Telegram-Relay (`nomad-jobs/services/telegram-relay.nomad`) ist ein HTTP-Endpoint `POST /notify`, der Apprise-`json://`-Payloads über den default-Bot weiterleitet. Er existiert noch für Skripte und Tools, die Apprise reden, aber nicht direkt zu Keep.

- **Endpoint** -- `telegram-relay.service.consul/notify` (Port via Consul-SRV)
- **Body** -- mindestens `text`, optional `title`; Apprise-`message` als Fallback für `text`
- **Bot** -- default-Bot, postet in den 1:1-Chat
- **Routing-Konfig** -- `topics.json` in Vault `kv/shared/telegram-relay`; alle Kategorien zeigen auf die Severity-Topics (ci-cd/backup/downloader/immo -> Info 25011; security/monitoring -> Warnung 25010). Zuvor zeigten sechs Einträge auf tote Threads (stiller Verlust), bereinigt 2026-06-10.

Wenn ein Tool sowohl Webhooks als auch Apprise kann, **immer Webhook nach Keep** bevorzugen.

## Secrets

Bot-Tokens und Chat-IDs liegen in 1Password unter `Monitoring Telegram Bots` im Privat-Vault:

- `batch_bot_token`, `batch_chat_id` (`-1003971798942`)
- `vip_bot_token`, `vip_chat_id` (idle)
- `default_bot_token`, `default_chat_id`

Den batch-Token zieht Keep zur Laufzeit aus Vault `kv/keep` (`telegram_batch_token`); der Dead-Man-Switch und die Kuma-Watchdogs lesen denselben Token. Die Topic-IDs (25009/25010/25011) stehen literal in den Workflows bzw. der Watchdog-Konfiguration.

## Neue Quelle anbinden

Drei Muster, abhängig vom Service:

1. **Service hat Webhook-Mechanismus** (Grafana, Uptime Kuma, Authentik, Sonarr/Radarr/Prowlarr, CheckMK) -- Webhook auf `https://keep.ackermannprivat.ch/alerts/event/<source>`. Keep korreliert zu einem Incident; die Incident-Severity bestimmt das Topic.
2. **Service liefert nur Logs** -- Alloy nimmt auf, Loki speichert, Grafana hat LogQL-Alert-Rule, Rule postet als Webhook nach Keep.
3. **Service liefert nur Metriken** -- Telegraf scraped, InfluxDB speichert, Grafana hat InfluxQL-Alert-Rule, Rule postet als Webhook nach Keep.

Direkter Telegram-Bot-Aufruf aus dem Service (alter Stil) ist **nicht** mehr der gewünschte Pfad. Der Telegram-Relay bleibt nur für Apprise-Tools.

## Verwandte Seiten

- [Keep](keep.md) -- Hub für Korrelation, Incident-Workflows und Severity-Routing
- [Monitoring](index.md) -- Stack-Übersicht und Datenflüsse
- [Authentik Alerting](../authentik/betrieb.md) -- Security-Event-Pipeline
- [Vault](../vault/index.md) -- Secret-Storage für Bot-Tokens
