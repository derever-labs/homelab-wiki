---
title: Telegram Bots
description: Zentraler Benachrichtigungs-Kanal für Monitoring, Alerting und Security-Events
tags:
  - monitoring
  - alerting
  - telegram
  - notification
---

# Telegram Bots

Telegram ist der primäre Push-Notification-Kanal im Homelab. Alle kritischen Events (Monitoring-Ausfälle, Security-Alerts, Backup-Probleme) erreichen Samuel per Telegram auf dem Handy -- im Gegensatz zu E-Mail ist die Latenz niedrig und Alerts lassen sich nach Priorität auf unterschiedliche Chats aufteilen.

## Rolle im Stack

Telegram ist kein dedizierter Service im Cluster -- es wird direkt über die Bot-API von `api.telegram.org` angesprochen. Homelab-Services senden Nachrichten entweder **direkt** (wenn der Service Telegram nativ unterstützt) oder **über einen Relay** (wenn Tokens nicht in Klartext in Service-Konfigurationen landen sollen).

```d2
direction: right

Services: Homelab-Services {
  style.stroke-dash: 4
  Grafana: Grafana Alerting
  Kuma: Uptime Kuma
  Notifiarr: Notifiarr
  Authentik: Authentik
  Backup: Backup-Jobs
}

Relay: Telegram Relay (Nomad) {
  style.stroke-dash: 4
  RELAY: HTTP /notify Endpoint { tooltip: "Token + Chat-ID als Consul-Template aus Vault" }
}

Vault: Vault (kv/telegram) { shape: cylinder }

TG: Telegram Bot API {
  style.stroke-dash: 4
  BOT_DEFAULT: default Bot
  BOT_VIP: vip Bot
}

Services.Grafana -> TG.BOT_DEFAULT: Direct (Grafana Native Contact Point)
Services.Kuma -> TG.BOT_DEFAULT: Direct
Services.Notifiarr -> TG.BOT_DEFAULT: Direct
Services.Authentik -> Relay.RELAY: Webhook (intern-only)
Services.Backup -> Relay.RELAY: Webhook (intern-only)
Relay.RELAY -> TG.BOT_VIP
Vault -> Relay.RELAY: Consul-Template { style.stroke-dash: 5 }
Vault -> Services.Grafana: Consul-Template { style.stroke-dash: 5 }
```

## Zwei Bot-Kanäle

Zur Aufteilung nach Priorität gibt es zwei separate Telegram-Bots mit eigenen Chats:

- **default** -- allgemeiner Monitoring-Kanal. Häufige Nachrichten: Uptime-Kuma-Status, Backup-Logs, Notifiarr-Meldungen aus dem Media-Stack. Kann auch mal 10 Nachrichten pro Tag enthalten, ist "Rauschkanal".
- **vip** -- kritischer Kanal für Alerts die sofortige Aufmerksamkeit brauchen. Security-Events (Authentik Failed-Logins, Reputation-Blocks), Grafana-Critical-Alerts, Vault-Fehler, Proxmox-Host-Down. Pro Tag idealerweise 0 Nachrichten -- jede eingehende Nachricht ist ernst.

Die Trennung ist bewusst: wer alle Events in einen Chat mischt, gewöhnt sich an Rauschen und übersieht die wichtigen.

## Bot-Konsumenten

Direkt integrierte Services (Bot-Token liegt in der Service-Config):

- **Grafana Unified Alerting** -- nutzt den `default` Bot als Contact Point. Sendet Metrik- und Log-basierte Alerts (LVM, DRBD, CheckMK via Loki). Details: [Monitoring Stack](./index.md)
- **Uptime Kuma** -- nutzt den `default` Bot bei HTTP/TCP-Check-Failures. Credentials in der `kuma.db` Datenbank, via Litestream auf NAS gesichert
- **Notifiarr** -- nutzt den `default` Bot für Media-Stack-Events (Radarr/Sonarr-Grabs, Quality-Profile-Syncs)

Über den Telegram-Relay angebundene Services (kein Token in der Service-Config):

- **Authentik** -- sendet Security-Events (Failed-Logins, Reputation-Blocks, LDAP-Bind-Fails, Configuration-Errors) an den `vip` Bot
- Weitere Services können jederzeit hinzukommen, solange sie HTTP-Webhooks absetzen können

## Relay-Service

Der Telegram-Relay ist ein kleiner Nomad-Job mit einem HTTP-Endpoint `POST /notify`. Er nimmt JSON-Payloads entgegen und leitet sie an die Telegram-Bot-API weiter. Der Bot-Token liegt als Consul-Template aus Vault nur im Relay-Container -- nicht in den Configs der anbindenden Services.

**Warum ein Relay statt Direct-Integration für Authentik & Co.?**

- Authentik speichert Webhook-URLs inklusive eingebetteter Tokens **im Klartext** in der Datenbank. Ein DB-Backup-Leak würde den Bot-Token exponieren und alle Chats des Bots kompromittieren
- Der Relay liegt nur auf Consul-internem Netz erreichbar (`telegram-relay.service.consul`), der Endpoint ist nicht von aussen ansprechbar
- Format-Normalisierung: der Relay fügt Tags wie `[Authentik/alert/LDAP]` hinzu, Severity-Icons, Timestamps -- Services müssen nur Text liefern
- Rate-Limit und Deduplication zentral möglich (Telegram-Bot-API hat Rate-Limits auf 30 msg/sec)

Der Relay-Job liegt unter [nomad-jobs/services/telegram-relay.nomad](https://gitea.ackermannprivat.ch/PRIVAT/infra/src/branch/main/nomad-jobs/services/telegram-relay.nomad).

## Secrets in Vault

Die Bot-Credentials werden zentral in Vault unter folgenden Pfaden abgelegt:

- `kv/data/telegram` -- legacy Pfad, genutzt von Grafana. Enthält Default-Bot-Token und Default-Chat-ID
- `kv/data/telegram-relay` -- Relay-spezifische Credentials. Enthält den VIP-Bot-Token und die Chat-IDs für Security-Alerts

Das Duplikat ist beabsichtigt: Grafana bleibt bei seinem bestehenden Vault-Pfad, der Relay hat einen eigenen Pfad, damit beide unabhängig rotiert werden können. Die Original-Credentials liegen zusätzlich in 1Password im Item `Monitoring Telegram Bots` (Felder `default_bot_token`, `default_chat_id`, `vip_bot_token`, `vip_chat_id`).

## Neue Services anbinden

Drei Muster, abhängig vom Service:

1. **Service unterstützt Telegram nativ** (Grafana, Uptime Kuma, Notifiarr, Prometheus Alertmanager)
   - Bot-Token direkt in die Service-Config über Consul-Template aus Vault
   - Bevorzugt für Services die den Token über Template-Rendering bekommen und nicht persistieren
2. **Service kann Webhooks absetzen** (Authentik, Custom-Scripts, Backup-Jobs)
   - Webhook-URL auf den Relay zeigen lassen: `http://telegram-relay.service.consul:PORT/notify`
   - Body muss mindestens `text` enthalten, optional `severity` (`alert`, `warning`, `info`) und `source`
3. **Service kann nur E-Mail** (legacy Tools)
   - E-Mail an `services@ackermann.systems` absetzen (via `smtp.service.consul`)
   - Bei Bedarf einen separaten Mail-zu-Telegram-Filter aufsetzen -- aktuell nicht im Einsatz

Welcher Chat (default vs. vip) verwendet wird, hängt an der **Relevanz** der Events, nicht am Service selbst: Authentik Login-Statistiken gingen in `default`, Authentik Security-Alerts gehen in `vip`. Die Trennung muss auf Rule-Level stattfinden, nicht auf Service-Level.

## Rate-Limits und Deduplication

Die Telegram-Bot-API erlaubt maximal 30 Nachrichten pro Sekunde und 20 Nachrichten pro Minute pro Chat. Im Homelab-Alltag sind wir weit darunter. Sollte ein fehlerhafter Alert-Loop entstehen (z. B. Oscillating Service-Check), blockt Telegram automatisch -- der Relay sollte diese Fehler absorbieren und zurückmelden, nicht retrien.

Deduplication läuft heute **nicht zentral** -- wenn Grafana und Authentik gleichzeitig einen Ausfall melden, kommen zwei Nachrichten. Falls das stört, kann der Relay später eine 5-Minuten-Fingerprint-Cache-Logik bekommen.

## Test und Health-Check

Der Relay-Service registriert sich als Consul-Service `telegram-relay`. Ein Health-Check auf `GET /health` prüft ob der Service läuft und Vault-Credentials lesen konnte. Falls das fehlschlägt (z. B. Vault-Token expired), wird der Service im Consul als `critical` markiert und die anbindenden Services bekommen `503` statt der Nachricht.

Regression-Tests für einen neuen Alert-Pfad erfolgen immer am Ende der Einrichtung: echter End-to-End-Test mit Trigger am Service (nicht nur Relay-Smoke-Test).

## Verwandte Seiten

- [Monitoring Stack](./index.md) -- Grafana, Uptime Kuma, CheckMK
- [Notifiarr](../notifiarr/index.md) -- Media-Stack-Benachrichtigungen
- [Authentik Alerting](../authentik/betrieb.md) -- Security-Event-Pipeline (wird im Zuge des Hardening-Sprints angelegt)
- [Vault](../vault/index.md) -- Secret-Storage für Bot-Tokens
