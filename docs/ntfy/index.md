---
title: ntfy
description: Self-Hosted Push-Notification-Service fuer Homelab-Alerts und Automatisierungen
tags:
  - service
  - notifications
  - nomad
---

# ntfy

ntfy ist ein einfacher, selbst-gehosteter Pub/Sub-Notification-Dienst. Topics werden per HTTP-Anfrage beschrieben, Benachrichtigungen kommen auf Android, iOS oder im Browser an. Kein Account beim Anbieter nötig.

## Übersicht

- URL: [ntfy.ackermannprivat.ch](https://ntfy.ackermannprivat.ch)
- Deployment: Nomad Job `services/ntfy.nomad`
- Storage: Linstor CSI Volume `ntfy-data` (cache.db + Attachments)
- Constraint: `vm-nomad-client-0[56]` (folgt dem Volume)
- Auth: Token-Auth via ntfy selbst (`auth-default-access: deny-all`), kein Authentik ForwardAuth
- Middleware: `intern-noauth@file` (IP-Whitelisting, kein Cookie-Auth)
- Vault: `kv/data/ntfy` -- Feld `admin_token`

## Warum kein Authentik ForwardAuth

ntfy verwendet Bearer-Token-Authentifizierung im HTTP-Header (`Authorization: Bearer <token>`). Authentik ForwardAuth erwartet dagegen Cookie-basierte Sessions. Die beiden Mechanismen sind nicht kompatibel -- ntfy-Clients (Apps, Scripts, n8n) würden von Authentik ausgesperrt. Lösung: `intern-noauth@file` für IP-Whitelisting, Zugangskontrolle übernimmt ntfy selbst via Tokens.

## iOS-Push-Notifications

::: warning iOS Relay-Konfiguration -- keine Server-Einstellung
iOS-Push-Notifications funktionieren nur über APNs (Apple Push Notification Service). ntfy.sh betreibt dafür einen Firebase/APNs-Relay-Service. Eine selbst-gehostete ntfy-Instanz kann diesen Relay **nicht ersetzen**.

Lösung: In der ntfy-iOS-App unter Einstellungen den Standard-Server auf `ntfy.sh` als Relay eintragen **und** als eigenen Server `ntfy.ackermannprivat.ch` hinterlegen. Die App sendet Push-Tokens über ntfy.sh weiter, die Inhalte bleiben auf der eigenen Instanz.

Diese Konfiguration ist reine App-Einstellung und erfordert keine Änderung am Server.
:::

::: info Android und Desktop
Auf Android und im Browser funktioniert WebSocket-Push direkt über die eigene Instanz ohne Relay.
:::

## Deployment

Der Job wird **nicht automatisch deployed**. Voraussetzung: das 1Password-Item `ntfy` im Privat-Vault mit dem Feld `password` (wird als `admin_token` via Vault Agent injiziert) muss angelegt sein.

Linstor-Volume vor dem ersten Deploy erstellen:

```
linstor resource-group create ntfy-rg --place-count 2
linstor volume-group create ntfy-rg
linstor resource-group spawn-resources ntfy-rg ntfy-data 2GiB
```

Dann deployen via `nomad-deploy`-Skill oder manuell:

```
NOMAD_ADDR=http://10.0.2.104:4646 NOMAD_TOKEN=<token> nomad job run nomad-jobs/services/ntfy.nomad
```

## Alerting-Integration

ntfy eignet sich als Alerting-Kanal für:

- **n8n** -- HTTP-Request-Node mit Bearer-Token in Authorization-Header
- **Gatus** -- custom-Alerting-Provider (alternativ zum bestehenden Telegram-Relay)
- **Scripts** -- `curl -H "Authorization: Bearer <token>" -d "Nachricht" https://ntfy.ackermannprivat.ch/<topic>`

## Verwandte Seiten

- [Traefik Referenz](../traefik/referenz.md) -- `intern-noauth`-Middleware-Chain
- [Monitoring Stack](../monitoring/index.md) -- Übersicht Alerting-Wege
- [Vault](../vault/index.md) -- Secret-Verwaltung
