---
title: Telegram Bots
description: Bot- und Channel-Inventar fuer den Output-Channel von Keep
tags:
  - monitoring
  - alerting
  - telegram
  - notification
---

# Telegram Bots

Telegram ist der primaere Output-Channel der [Keep](keep.md)-Routing-Pipeline. Alle Alert-Quellen melden an Keep, und Keep verteilt nach Source/Severity an einen der drei Bots in den entsprechenden Channel und Forum-Topic.

## Rolle im Stack

Telegram ist **kein** dedizierter Service im Cluster -- es wird ueber die Bot-API von `api.telegram.org` angesprochen. Im Regelbetrieb gibt es genau einen einzigen Pfad: **Quelle -> Keep -> Bot -> Channel/Topic**. Direkte Bot-Aufrufe aus Services existieren nur noch fuer Apprise-Integrationen ueber den Telegram-Relay (siehe unten).

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
  agent: { style: { border-radius: 8, stroke-dash: 2 } }
  container: { style: { border-radius: 8, stroke-dash: 4 } }
  sink: { shape: hexagon, style: { border-radius: 8 } }
}

keep: Keep\nIncident-Hub { class: svc }

bots: Telegram-Bots {
  class: container
  batch: batch-Bot\nbatch_ackermann_bot {
    class: agent
    tooltip: "Standard-Schiene; postet in Forum-Topics"
  }
  vip: vip-Bot\ntop_uptime_ackermann_bot {
    class: agent
    tooltip: "Critical-Eskalation; postet im 1:1-Chat"
  }
  default: default-Bot\nuptime_ackermann_bot {
    class: agent
    tooltip: "Legacy fuer ad-hoc; nicht im Keep-Routing"
  }
}

forum: Homelab Alerts (Forum-Channel) {
  class: container
  monitoring: Topic 3 monitoring { class: sink }
  security: Topic 4 security { class: sink }
  cicd: Topic 5 ci-cd { class: sink }
  backup: Topic 6 backup { class: sink }
  downloader: Topic 7 downloader { class: sink }
  immo: Topic 8 immo { class: sink }
}

vipchat: 1:1 Chat\n(Samuel) { class: sink }

keep -> bots.batch: "Standard-Severitaeten"
keep -> bots.vip: "critical / high / page"
bots.batch -> forum.monitoring
bots.batch -> forum.security
bots.batch -> forum.cicd
bots.batch -> forum.backup
bots.batch -> forum.downloader
bots.batch -> forum.immo
bots.vip -> vipchat
```

## Drei Bots

- **batch** -- `batch_ackermann_bot`. Standard-Schiene fuer alle Severitaeten. Postet in den Forum-Channel `Homelab Alerts` (chat-id `-1003971798942`) und sortiert per `message_thread_id` in das passende Topic. Hohe Frequenz erwartbar.
- **vip** -- `top_uptime_ackermann_bot`. Eskalations-Schiene fuer `critical | high | page`. Postet zusaetzlich zur batch-Nachricht im 1:1-Chat (chat-id `813893907`) fuer sofortige Sichtbarkeit unabhaengig vom Channel-Notification-Setting. Pro Tag idealerweise null Nachrichten -- jede eingehende ist ernst.
- **default** -- `uptime_ackermann_bot`. Legacy-Bot fuer Direct-Pushes aus Skripten oder ad-hoc Notifications. **Nicht** Teil der Keep-Routing-Workflows. Wird vom Telegram-Relay (Apprise-Bridge) genutzt.

Alle drei Bots sind als Provider in Keep installiert (`telegram-homelab-batch`, `telegram-homelab-vip`, `telegram-homelab-default`); aktiv im Routing sind nur batch und vip.

## Forum-Topics

Source-Cluster -> Topic-Mapping liegt in den [Keep-Workflows](keep.md#routing-workflows):

| Topic-ID | Name | Quellen |
| :--- | :--- | :--- |
| 3 | monitoring | gatus, kuma, uptime, grafana, checkmk, prometheus, telegraf, loki, test, keep |
| 4 | security | authentik, crowdsec, security |
| 5 | ci-cd | gitea, github, runner, ci |
| 6 | backup | borg, restic, duplicati, backup, pbs |
| 7 | downloader | sonarr, radarr, sabnzbd, prowlarr, jellyseerr, downloader, notifiarr, lazylibrarian |
| 8 | immo | immo, scraper, immoscraper |

## Telegram-Relay (Apprise-Bridge)

Der Telegram-Relay (`nomad-jobs/services/telegram-relay.nomad`) ist ein kleiner HTTP-Endpoint `POST /notify`, der Apprise-`json://` Payloads entgegennimmt und ueber den default-Bot weiterleitet. Er existiert noch fuer Skripte und Tools die Apprise reden, aber nicht direkt zu Keep. Im Regelbetrieb soll alles ueber Keep laufen -- der Relay ist die letzte Bridge fuer Legacy-Anbindungen.

- **Endpoint** -- `http://telegram-relay.service.consul:PORT/notify`
- **Body** -- mindestens `text`, optional `title` (wird vorangestellt). Apprise-`message`-Feld wird als Fallback fuer `text` akzeptiert.
- **Bot** -- nutzt den default-Bot, postet in den 1:1-Chat von Samuel.

Wenn ein Tool sowohl Webhooks als auch Apprise kann, **immer Webhook nach Keep** bevorzugen, nicht den Relay.

## Secrets

Bot-Tokens und Chat-IDs liegen in 1Password unter dem Item `Monitoring Telegram Bots` im Privat-Vault:

- `default_bot_token`, `default_chat_id`
- `vip_bot_token`, `vip_chat_id`
- `batch_bot_token`, `batch_chat_id`, `batch_topics` (JSON-Map mit Topic-ID-Lookup)

Der Vault-Pfad `kv/data/telegram` und `kv/data/telegram-relay` enthaelt nur die Tokens, die der Telegram-Relay-Job zur Laufzeit braucht.

## Neue Quelle anbinden

Drei Muster, abhaengig vom Service:

1. **Service hat Webhook-Mechanismus** (Grafana, Gatus, Authentik, Sonarr/Radarr/Prowlarr, CheckMK, Notifiarr) -- Webhook auf `https://keep.ackermannprivat.ch/alerts/event/<source>`. Source-Name bestimmt Topic-Routing in Keep. Severity im Body bestimmt Bot.
2. **Service liefert nur Logs** (UniFi Syslog, App-Stdout) -- Alloy nimmt auf, Loki speichert, Grafana hat LogQL-Alert-Rule, Rule postet als Webhook nach Keep.
3. **Service liefert nur Metriken** (SNMP, Prometheus-Scrape, Exec) -- Telegraf scraped, InfluxDB speichert, Grafana hat Flux-Alert-Rule, Rule postet als Webhook nach Keep.

Direkter Telegram-Bot-Aufruf aus dem Service (alter Stil) ist **nicht** mehr der gewuenschte Pfad. Der Telegram-Relay bleibt nur fuer Apprise-Tools, die nichts anderes koennen.

## Verwandte Seiten

- [Keep](keep.md) -- Hub fuer Routing, Severity-Eskalation und Dedup
- [Monitoring](index.md) -- Stack-Uebersicht und Datenfluesse
- [Notifiarr](../notifiarr/index.md) -- Media-Stack-Benachrichtigungen (Webhook nach Keep)
- [Authentik Alerting](../authentik/betrieb.md) -- Security-Event-Pipeline
- [Vault](../vault/index.md) -- Secret-Storage fuer Bot-Tokens
