---
title: Wartungsbanner -- Betrieb
description: Banner aktivieren, Wartungsfenster setzen, neue Apps anbinden
tags:
  - service
  - traefik
  - runbook
---

# Wartungsbanner -- Betrieb

::: danger Aktuell deaktiviert (2026-05-19)
Banner-Injection ist in **allen** Traefik-Chains auskommentiert wegen SSE-Pufferung. Die Schritte unten setzen voraus, dass `banner-inject` wieder in der Chain aktiv ist. Re-Enable-Anleitung siehe [Wartungsbanner](index.md).
:::

## Banner einschalten (sofort)

1. [banner.ackermannprivat.ch/_/](https://banner.ackermannprivat.ch/_/) im Browser oeffnen
2. Mit den Pocketbase-Credentials einloggen (Item `Pocketbase Banner` im PRIVAT 1P-Vault)
3. Collection `banner_config` -> existierender Record bearbeiten
4. `enabled` auf `true` schalten, `text` anpassen
5. Save

Banner erscheint auf allen Routen mit `*-with-banner` Chain beim naechsten Page-Reload.

## Banner ausschalten

`enabled` auf `false` setzen, save. Beim naechsten Page-Reload auf den Apps verschwindet das Banner.

## Wartungsfenster mit fester Zeit setzen

Im selben Record:

- `start_at`: Beginn (z.B. heute 22:00). Banner erscheint erst ab dann.
- `end_at`: Ende (z.B. heute 23:00). Banner verschwindet automatisch danach.
- `enabled` muss `true` sein -- Zeitfenster wird nur ausgewertet wenn der Master-Schalter an ist.

Die Felder werden in UTC erwartet -- das Pocketbase-UI zeigt die lokale Zeit aber persistiert UTC. Im Zweifel pruefen.

## Eine zusaetzliche Domain mit Banner ausstatten

Das Banner ist Teil der Base-Chains `intern-auth`, `public-auth`, `public-noauth` (und der Strict-Varianten). Jede Route die eine dieser Chains nutzt zeigt automatisch das Banner -- nichts zu tun pro App.

Wenn eine neue App eine eigene Custom-Chain braucht: `force-identity-encoding` ganz vorne in der Liste, dann die regulaeren Middlewares, dann `banner-inject` VOR `error-pages`.

## Eine Domain bewusst ohne Banner

Eine Route auf `intern-api` umstellen (kein Banner, keine Error-Pages) oder eine eigene Chain ohne `banner-inject` definieren. Standardfall: alle HTML-liefernden Apps sollen das Banner haben -- Ausnahmen nur fuer Webhook- oder API-only-Routen.

## SSE-Endpoint pro Service

Wenn ein Service eine Banner-Chain nutzt, aber einen einzelnen SSE-Pfad (`text/event-stream`) hat: nicht die ganze Chain wechseln, sondern einen **separaten Router mit Path-Match und hoeherer Prioritaet** anlegen, der `banner-inject` umgeht. `plugin-rewritebody` puffert sonst den Stream bis zum Connection-Close und der Client bekommt nichts.

Pattern aus DCLab `messe-configurator.nomad`:

- `traefik.http.routers.<service>-sse.rule=Host(...) && Path(/api/sse)` -- nur dieser Pfad
- `traefik.http.routers.<service>-sse.priority=300` -- vor der Default-Chain
- `traefik.http.routers.<service>-sse.middlewares=...` -- explizit ohne `banner-inject`

Verifikation: `curl --max-time 5 https://<host>/api/sse` muss innerhalb 1 s das initial `event: ...` liefern. Hangt der Stream, puffert banner-inject noch.

## Streaming und grosse Bodies

Das gleiche Pattern wie bei SSE gilt fuer **alle Pfade die binaere oder mehrere-MB-grosse Antworten liefern**: Video-Streams, Audio-Streams, HLS-Segmente, Datei-Downloads, Bandwidth-Tests. `plugin-rewritebody` puffert die komplette Response damit der Body-Search-Replace moeglich wird -- bei multi-GB Videos zerstoert das `Content-Length`, blockiert `Range`-Requests (HTTP 206 Partial Content) und brichst `Transfer-Encoding: chunked`.

Symptome im Client:

- Infuse (Apple TV / iOS / macOS): "Ein Fehler ist aufgetreten -- Beim Laden des Inhaltes"
- Browser-Direktplay: Spinner haengt, Video startet nie, Network-Tab zeigt einen einzelnen pending Request der nicht voranschreitet
- Downloads brechen ohne Fehlermeldung ab oder liefern korrupte Datei

Loesung wie bei SSE: **eigener Router mit `priority` ueber dem Default und einer schlanken Middleware-Kette** (nur Crowdsec + Security-Headers, kein `banner-inject`, kein `error-pages`, kein `force-identity-encoding`).

Konkretes Beispiel siehe [Jellyfin Traefik-Routing und Streaming-Bypass](../jellyfin/index.md#traefik-routing-und-streaming-bypass). Die Pfad-Liste pro App ergibt sich aus der API-Doku des Backends -- bei Jellyfin sind das `/Videos/*`, `/Audio/*`, `/LiveRecordings/*`, `/LiveStreamFiles/*`, `/Items/<id>/(Download|File)`, `/Providers/Subtitles/*`, `/Playback/BitrateTest`, `/FallbackFont/Fonts/*` und `/websocket`.

Verifikation: `curl --max-time 5 -I https://<host>/<stream-pfad>` muss innerhalb von 1 s einen `Content-Length`-Header (oder `Transfer-Encoding: chunked`) und idealerweise `Accept-Ranges: bytes` zurueckliefern. Wenn die Antwort verzoegert kommt oder Header fehlen, ist der Router noch durch banner-inject geleitet.

## Test ob das Banner auf einer Domain ankommt

`curl -s -H "Accept-Encoding: gzip, br" https://<domain>/ | grep -c "banner.ackermannprivat.ch"` muss `>= 1` ergeben. Wenn `0`:

- Liefert das Backend Content-Type ausser `text/html`? Plugin v0.3.1 ignoriert die `monitoring.types`-Konfiguration (silent ignore -- Source-Audit-Befund). Damit puffert es jeden Content-Type, ersetzt aber nur in `text/html`-Bodies erfolgreich -- bei API-Responses landet trotzdem die Buffering-Verzoegerung.
- Hat die Route die richtige `*-with-banner` Chain im Tag?
- Liefert Traefik tatsaechlich den Inject? Dashboard `/_/middlewares` zeigt `banner-inject@file` und die Chain.

## Schemata aendern

Migrationen in [`services/pocketbase.nomad`](https://github.com/derever-labs/infra/blob/main/nomad-jobs/services/pocketbase.nomad) inline als Template gerendert. Neues Feld:

1. Neuen Migration-Template eintragen mit eindeutiger Timestamp-ID
2. Job neu deployen -- beim Start fuehrt Pocketbase neue Migrations aus
3. Hook `banner.pb.js` ggf. anpassen wenn das Feld im JS verwendet wird

## Backup

SQLite-Datei liegt im Linstor-CSI-Volume `pocketbase-data` mit Replikation `autoPlace=2`. Wenn ein VolHost ausfaellt, DRBD haelt die Replik. Punkt-in-Time-Backup laeuft ueber die allgemeine Linstor-Backup-Strategie (siehe [linstor-storage/betrieb](../linstor-storage/betrieb.md)).

## Pocketbase-Admin-Passwort verloren

Pocketbase erlaubt Reset ueber CLI im Container:

`nomad alloc exec -task pocketbase <alloc-id> pocketbase superuser upsert <email> <new-password>`

Alloc-ID via `nomad job status pocketbase`. Neues Passwort danach in 1P aktualisieren.
