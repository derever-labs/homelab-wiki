---
title: Wartungsbanner -- Betrieb
description: Banner schalten und Wartungsfenster setzen (Jellyfin Custom-CSS)
tags:
  - service
  - jellyfin
  - runbook
---

# Wartungsbanner -- Betrieb

Seit 2026-05-29 läuft der Banner nur noch für die Jellyfin-Web-UI über Jellyfins natives Custom-CSS (Mechanik: [Wartungsbanner](index.md)). Es gibt keine Traefik-Chain-Pflege, kein `force-identity-encoding` und keine SSE-/Streaming-Sonderfälle mehr -- der frühere `banner-inject`-Mechanismus ist zurückgebaut.

## Banner schalten

Im Pocketbase-Admin-UI ([banner.ackermannprivat.ch/_/](https://banner.ackermannprivat.ch/_/), Login via Authentik admin-Gruppe, dann Pocketbase-Credentials aus 1P `Pocketbase Banner`) den einen `banner_config`-Record bearbeiten: `enabled` auf `true`/`false`, dazu `severity` und `text`. Wirksam beim nächsten Reload der Jellyfin-Web-UI ([watch.ackermannprivat.ch](https://watch.ackermannprivat.ch)).

## Wartungsfenster

`start_at`/`end_at` im selben Record setzen (UTC -- das UI zeigt Lokalzeit, persistiert aber UTC). Der Banner erscheint und verschwindet automatisch innerhalb des Fensters, solange `enabled` auf `true` steht. Die Zeitprüfung läuft server-seitig im Pocketbase-Hook.

## Prüfen ob der Banner ankommt

`banner.ackermannprivat.ch/banner.css` liefert bei aktivem Banner die `body::before`-Regeln, sonst `/* maintenance banner: off */`. In der Jellyfin-Web-UI erscheint der Banner dann am oberen Rand. Native Clients (Infuse, Android-TV) zeigen ihn nicht -- Server-CSS wirkt nur im Browser.

## Weitere App anbinden

Aktuell nur Jellyfin. Eine andere App liesse sich nur einbinden, wenn sie ein eigenes natives Custom-CSS-Feld hat -- Jellyseerr etwa hat keines. Der frühere Traefik-weite Inject (alle Apps) ist mit dem `banner-inject`-Rückbau entfallen.

## Schema ändern

Migrationen liegen inline als Templates in [`services/pocketbase.nomad`](https://github.com/derever-labs/homelab-nomad-jobs/blob/main/services/pocketbase.nomad). Neues Feld: Migration-Template mit eindeutiger Timestamp-ID ergänzen, Job neu deployen (Pocketbase führt neue Migrations beim Start aus), die `/banner.css`- und `/banner.js`-Hooks bei Bedarf nachziehen. Admin-Passwort-Reset läuft über die Pocketbase-Superuser-CLI im Container; neues Passwort danach in 1P nachführen.

## Backup

Die SQLite-Datei liegt im Linstor-CSI-Volume `banner-pb-data` (DRBD autoPlace=2). Punkt-in-Zeit-Backup über die allgemeine Linstor-Strategie (siehe [linstor-storage/betrieb](../linstor-storage/betrieb.md)).
