---
title: "Uptime Kuma: Referenz"
description: resendInterval-Semantik, Zertifikats-Monitore, API-Besonderheiten und Monitor-CRUD von Uptime Kuma
tags:
  - service
  - monitoring
  - nomad
  - referenz
---

# Uptime Kuma: Referenz

Nachschlage-Details zu Uptime Kuma. Steckbrief, Architektur und Rolle im Stack stehen auf der [Übersichtsseite](./index.md).

## resendInterval: zählt Beats, nicht Minuten

`resendInterval` ist die Anzahl aufeinanderfolgender DOWN-Beats bis zur nächsten Benachrichtigung, **keine** Minutenangabe:

```
Realabstand = resendInterval x interval
```

Bei `resendInterval = 0` benachrichtigt Kuma während eines andauernden DOWN **nie erneut** -- `sendNotification()` läuft dann nur beim Statuswechsel (`important = 1`).

::: warning Die 60-Sekunden-Täuschung
Bei 60-Sekunden-Takt fallen Beats und Minuten zufällig zusammen, dort scheint eine Minuten-Lesart zu funktionieren. Bei jedem anderen Takt zerfällt die Gleichung. Der Wert `720` ergibt bei 60s-Takt 12 Stunden -- bei einem Drei-Tage-Scraper-Monitor aber 540 Tage.
:::

Belege (Kuma 2.4.0, `server/model/monitor.js`): Zeile 454 führt `downCount` über Beats fort, Zeile 1036/1037 vergleicht ihn gegen `resendInterval`, und `beatInterval = retryInterval` gilt laut Zeile 1083 nur im PENDING-Zweig -- im DOWN taktet der Beat mit `interval`. Das UI-Label lautet entsprechend "Resend Notification if Down X times consecutively".

### Hausregel

Kritische Infrastruktur und Alarm-Bastion auf **3 Stunden**, alles Übrige auf **12 Stunden**.

```
resendInterval = round(Zielabstand / interval), mindestens 1
```

Werte für 3 Stunden nach Takt: 60s -> 180, 2 min -> 90, 5 min -> 36, 10 min -> 18, 20 min -> 9, 1 h -> 3, 90 min -> 2.

Bei Monitoren mit einem Takt über 3 Stunden (Backups, Scraper, Wochenjobs) ist `1` der einzige sinnvolle Wert -- ein Drei-Stunden-Abstand ist dort physikalisch unerreichbar, weil der Monitor gar nicht so oft schlägt.

### Zertifikats-Monitore brauchen keinen Sonderweg

Die Ablaufwarnung ist kein DOWN: `handleTlsInfo` (`monitor.js:2108`) ruft `checkCertExpiryNotifications` nach erfolgreichem TLS-Handshake, also im UP-Pfad, und meldet an festen Schwellen (`tlsExpiryNotifyDays`, Default 7/14/21 Tage). `resendInterval` berührt diesen Pfad nicht. Ein DOWN eines Cert-Monitors bedeutet einen akuten Ausfall (Seite weg oder Handshake gescheitert) -- dort gilt die normale 3-Stunden-Regel.

## Monitore per API ändern

`get_monitors()` und `get_monitor()` der Bibliothek `uptime-kuma-api` lesen den zuletzt empfangenen Socket.io-Event. Direkt nach einem `edit` oder `delete` zeigt dieselbe Verbindung noch den alten Stand.

::: warning Verifikation nur mit frischer Verbindung
Sonst bestätigt man den Cache statt den Server.
:::

`edit_monitor` erhält `pushToken` und `notificationIDList` (es liest den Monitor vorher komplett und merged die Argumente). Das ist wichtig, weil die Push-URLs in Vault unter `kv/uptime-kuma` liegen -- ein neu generierter Token würde die zugehörigen Nomad-Jobs still abhängen. Wer das an einem Wegwerf-Monitor testet: Ein Testmonitor **ohne** Notification deckt einen Notification-Verlust nicht auf.

## Kuma-CRUD nur per Direkt-SQL

Kuma v2 bietet keinen Admin-API-Endpunkt für Monitor-Create/Update. Das UI arbeitet über Socket.IO mit Session-Cookie. Skript-getriebene Änderungen laufen über die `uptime-kuma-api`-Lib (Socket.IO, siehe `group-kuma-monitors.py`); Bulk-Änderungen alternativ per MariaDB-`INSERT`/`UPDATE` gegen die Datenbank `uptime_kuma` (`mariadb.service.consul`), anschliessend `docker restart` des Kuma-Containers für Cache-Reload.

::: warning Vor Bulk-Änderungen sichern
Vor Bulk-Änderungen `mariadb-dump` der Tabellen `monitor`, `monitor_tag`, `tag` als Backup nach `/app/data/`.
:::
