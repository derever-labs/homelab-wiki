---
title: Wartungsbanner -- Betrieb
description: Banner aktivieren, Wartungsfenster setzen, neue Apps anbinden
tags:
  - service
  - traefik
  - runbook
---

# Wartungsbanner -- Betrieb

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

1. Zugehoerigen Nomad-Job-File aufmachen (z.B. `nomad-jobs/services/<app>.nomad`)
2. Im `service { tags = [...] }` Block die Middleware aendern:
   - Bisher `intern-auth@file` -> neu `intern-auth-with-banner@file`
   - Bisher `public-auth@file` -> neu `public-auth-with-banner@file`
   - Bisher `public-noauth@file` -> neu `public-noauth-with-banner@file`
3. Job neu deployen (`nomad job run`). Traefik nimmt die neuen Tags ueber Consul-Catalog auf -- kein Traefik-Restart noetig.
4. Verifizieren: Im Browser die Domain oeffnen, Banner muss erscheinen wenn `enabled=true`.

Bei komprimierungs-aktiven Backends (z.B. neue Java/Python-Apps): Routes mit Banner profitieren automatisch von `force-identity-encoding` weil das Teil der `*-with-banner` Chains ist.

## Eine Domain wieder ohne Banner

Tag zurueck auf die unmarkierte Variante (`intern-auth@file`, `public-auth@file`, `public-noauth@file`), neu deployen.

## Test ob das Banner auf einer Domain ankommt

`curl -s -H "Accept-Encoding: gzip, br" https://<domain>/ | grep -c "banner.ackermannprivat.ch"` muss `>= 1` ergeben. Wenn `0`:

- Liefert das Backend Content-Type ausser `text/html`? Plugin filtert auf `text/html` -- API-Endpunkte sind ignoriert.
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
