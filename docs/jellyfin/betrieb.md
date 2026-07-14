---
title: Jellyfin Betrieb
description: Betriebsprozeduren -- LDAP-Authentifizierung, IPv6-Handling, täglicher Restart und Kurator-Playlist-Sync
tags:
  - service
  - media
  - betrieb
---

# Jellyfin Betrieb

Betriebsprozeduren von Jellyfin: die LDAP-Authentifizierung, das IPv6-Handling für TMDb-Metadaten, der tägliche Restart und der Sync der privaten Kurator-Playlists. Steckbrief und Architektur stehen in der [Jellyfin Übersicht](./index.md), die Referenz-Tabellen in [Jellyfin Referenz](./referenz.md).

## Authentifizierung

Jellyfin nutzt LDAP-Bind-Authentifizierung gegen den [Authentik LDAP Outpost](../authentik/index.md) -- kein OAuth2 oder Traefik-Middleware. Das LDAP-Plugin in Jellyfin verbindet sich über Consul DNS (`authentik-ldap.service.consul:3389`) und prüft Benutzer-Credentials gegen Authentik. Benutzer werden über ihre E-Mail-Adresse (`mail`-Attribut) mit bestehenden Jellyfin-Accounts verknüpft.

Der Bind-User ist `svc-jellyfin-ldap` (dedizierter Account, Typ `internal`). Dieser hat über die Rolle `ldap-searcher` die `search_full_directory`-Permission und kann das gesamte LDAP-Directory durchsuchen. Wer sich via LDAP anmelden darf, wird durch eine Expression-Policy auf der LDAP-Applikation gesteuert: nur Mitglieder der Gruppen `family` oder `guest` sind zugelassen.

Der LDAP Provider nutzt **Cached Bind + Cached Search Mode**: Der erste Login pro User nach einem Outpost-Neustart durchläuft den vollen Authentik-Flow (~2s), alle weiteren Logins kommen aus dem Outpost-Memory (<5ms). Der LDAP-Provider verwendet einen eigenen minimalen Flow (`ldap-authentication-flow`) ohne MFA und GeoIP.

::: tip Kein OAuth auf Traefik-Ebene
Anders als die meisten Services hat Jellyfin keine Traefik-Middleware-Chain für OAuth. Die Authentifizierung erfolgt vollständig in der Applikation selbst über LDAP. Dadurch können auch Mediaplayer-Clients (TV, Apps) ohne Browser-OAuth zugreifen.
:::

Weil keine Authentik-Login-Seite vor Jellyfin geschaltet ist, fehlt der natürliche Recovery-Sprungbrett. Stattdessen rendert die Jellyfin-Login-Maske unterhalb des Anmelde-Formulars einen "Passwort vergessen?"-Link, der auf den Authentik-Recovery-Flow zeigt -- konfiguriert über den Branding-Endpoint `LoginDisclaimer` und persistiert im CSI-Volume. Konzept und Diagramm: [Authentik Recovery -- Recovery-Eingangspfade aus Apps](../authentik/recovery.md#recovery-eingangspfade-aus-apps).

## TMDb-Metadata ohne IPv6

`api.themoviedb.org` antwortet dual-stack, die Homelab-VMs haben aber keine IPv6-Route nach aussen -- Jellyfins .NET-HttpClient lief dadurch via Happy-Eyeballs sporadisch in Timeouts. Frische Filme blieben beim Erstscan ohne Poster, weil der Fallback-Provider stattdessen ein Standbild aus der Video-Datei extrahierte. Die Env-Variable `DOTNET_SYSTEM_NET_DISABLEIPV6=1` im Job zwingt die Runtime strikt auf IPv4.

## Täglicher Restart

Ein periodischer Batch Job (`batch-jobs/daily_restart_jellyfin.nomad`) startet Jellyfin täglich um 05:00 Uhr neu, sofern keine aktiven Streams laufen. Das behebt Memory-Leaks und räumt temporäre Daten auf. Siehe [Batch Jobs](../_querschnitt/batch-jobs.md).

## Private Kurator-Playlists

Für persönliche Film-Kuratierung nutzt der Admin-Account zwei Playlists, die ausschliesslich in seinem Jellyfin-Profil sichtbar sind. Die Taxonomie lebt serverseitig in Radarr-Tags (`jf-cinema-a`, `jf-cinema-b`) -- die Mitgliedschaft wird von einem periodischen Nomad-Batchjob (`batch-jobs/jellyfin_adult_sync.nomad`) abgeglichen, der täglich um 04:15 Uhr nach dem Restart läuft.

Der Job macht drei Dinge:

1. Liest die beiden Radarr-Tags und matcht die TMDb-IDs gegen die Jellyfin-Movies-Library.
2. Setzt für passende Items in der Jellyfin-SQLite-DB `OfficialRating='XXX'` plus granulares `LockedFields=[OfficialRating]` (damit Metadaten-Refreshes andere Felder frei aktualisieren können, das Rating aber nie überschrieben wird). Triggert danach einen Nomad-Alloc-Restart, damit Jellyfin den In-Memory-Cache neu lädt.
3. Fügt fehlende Items in die beiden privaten Playlists ein.

::: info Warum Radarr-Tags als Taxonomie-Quelle
Die Kategorisierung lebt ausschliesslich serverseitig in Radarr-Tags und benötigt keine lokale Mapping-Datei. Zum Verschieben eines Films zwischen den beiden Playlists reicht es, in Radarr das Tag umzustellen -- der nächste Sync-Lauf zieht die Änderung automatisch nach.
:::

::: warning In-Memory-Cache-Quirk
Direkte SQLite-Writes an der Jellyfin-DB werden vom laufenden Prozess **nicht** erkannt, bis ein Restart den In-Memory-Cache neu lädt. Deshalb triggert der Sync-Job nach jedem DB-Update explizit einen Nomad-Alloc-Restart und wartet, bis Playlists-API wieder antwortet, bevor er die Playlist-Items nachfährt. Für Änderungen ohne DB-Fix (nur Playlist-Pflege) ist kein Restart nötig.
:::

Secrets werden aus `kv/data/jellyfin-adult-sync` in Vault gelesen (Radarr-Key, Jellyfin-Key, Playlist-IDs, Nomad-Token).

## Verwandte Seiten

- [Jellyfin (Übersicht)](./index.md) -- Steckbrief, Architektur und Abhängigkeiten
- [Jellyfin Referenz](./referenz.md) -- Transcoding, Storage, Traefik-Routing, Wartungsbanner
- [Authentik](../authentik/index.md) -- Authentifizierung (LDAP Outpost)
- [Batch Jobs](../_querschnitt/batch-jobs.md) -- Täglicher Restart-Job
