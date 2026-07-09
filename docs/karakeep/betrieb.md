---
title: Karakeep Betrieb
description: Erfassung, Registrierung, Restore, Reindex und Troubleshooting von Karakeep
tags:
  - service
  - productivity
  - betrieb
---

# Karakeep Betrieb

## Erfassung

Links werden über die Web-UI, die Browser-Extension oder die Mobile-App erfasst. Extension und App authentifizieren sich per Bearer-Token gegen `/api`. Weil der Dienst nur intern und über Tailscale erreichbar ist, setzt jede Erfassung von unterwegs ein aktives Tailscale-Profil voraus.

## Registrierung

Im Normalbetrieb ist die Selbstregistrierung deaktiviert; Konten werden nicht offen angeboten. Nur beim erstmaligen Aufbau von Grund auf muss die Registrierung für den allerersten Start kurz geöffnet sein, sonst lässt sich kein Konto anlegen. Das genaue Vorgehen und der zugehörige Schalter sind im Kopfkommentar von `services/karakeep.nomad` dokumentiert.

## Restore

Ein Restore entschlüsselt das age-Archiv des gewünschten Backup-Stands und entpackt Datenbank und Assets zurück ins Datenvolume, während der `web`-Task gestoppt ist. Der Meilisearch-Index muss danach nicht mitgesichert werden -- er wird bei Bedarf neu aufgebaut (siehe [Reindex](#reindex)).

Der genaue Ablauf inklusive Entschlüsselungskommando und Herkunft des privaten Schlüssels steht als Kommentar im `backup`-Task von `services/karakeep.nomad`. Der Restore wurde nach dem Aufbau einmal gegen einen Scratch-Bereich getestet (Integritätsprüfung bestanden), ohne die Live-Instanz anzufassen.

## Reindex

Fehlen nach einem Wiederherstellen oder einem leeren Index Suchtreffer, baut Karakeep den Meilisearch-Index über die Admin-Funktion `/admin/jobs/trigger/reindex` neu auf. Weil der Index auf einem replizierten CSI-Volume liegt, ist ein manueller Reindex im Normalbetrieb nicht nötig; er bleibt der Ausweg, falls der Index inkonsistent wird.

## Backup-Überwachung

Der Backup-Sidecar meldet jeden erfolgreichen Lauf an den Uptime-Kuma-Push-Monitor **Karakeep Backup** (Gruppe *Storage & Backup*). Bleibt der tägliche Heartbeat aus, geht der Monitor nach Ablauf des 26-Stunden-Fensters auf DOWN -- das ist das Signal, dass das Backup nicht durchgelaufen ist. Ein zu kleines oder leeres Archiv fängt der Sidecar selbst über einen Grössen- und Integritäts-Guard ab und meldet den Lauf dann ebenfalls als fehlgeschlagen.

## Troubleshooting

::: warning Client-seitiges Crawling in Safari defekt
Die offizielle Safari-Extension speichert zwar Lesezeichen, sendet das im Browser erfasste HTML aber nie an den Server (upstream-Bug, [Issue #2814](https://github.com/karakeep-app/karakeep/issues/2814)). Karakeep crawlt die Seite dann serverseitig neu, was bei Consent-Wall- oder Login-geschützten Seiten scheitert. Das ist kein Konfigurationsfehler und lässt sich lokal nicht beheben. Das client-seitige Crawling funktioniert in Chrome und Firefox; für Consent-Wall-Links ist der serverseitige Weg die Alternative.
:::

## Verwandte Seiten

- [Karakeep](./index.md) -- Architektur und Rolle im Stack
- [Karakeep Referenz](./referenz.md) -- Container-Tasks, Volumes, Secrets, Backup-Parameter
- [Uptime Kuma](../uptime-kuma/index.md) -- Push-Monitore und Alerting
