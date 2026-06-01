---
title: 2026-05-12 ZOT/Redis NAS-Cascade
description: NAS-Garage-S3 Performance-Crash loest ZOT-Sync-Storm aus, 17 Apps unhealthy, Recovery via Linstor-CSI-Migration
tags:
  - incident
  - post-mortem
  - zot
  - storage
  - nas
---

# 2026-05-12 ZOT/Redis NAS-Cascade

NAS-Synology hat unter Garage-S3-Schreiblast einen Performance-Crash erlitten -- ZOT (type=system, 3 Instanzen mit S3-Backend) ist mit ihm gestorben und hat 17 Apps in Image-Pull-Errors gerissen. Recovery durch Architektur-Migration auf Linstor-CSI + BoltDB.

## 1. Was ist passiert

- **2026-05-12 21:10 UTC**: NAS-Synology begann unter Garage-S3-Schreiblast zu hangen. Garage-Backend wurde 2026-05-12 erst auf NAS migriert (Garage v2.3.0, vom Mini-PC weg)
- **21:12**: ZOT type=system count=3 (c04/c05/c06) verloren Verbindung zum S3-Backend. ParseStorage-Scan auf Image-Recovery loopt unendlich -- 95 Repos / 6267 Objekte, Cache lokal (Redis) aber Backend über S3 nicht verfügbar
- **21:15**: Erste Apps schlagen mit "Image pull failed: context deadline exceeded" auf. Cascade ausgelöst weil Apps bei Job-Restart neue Pulls triggern und ZOT diese nicht bedienen kann
- **21:30**: 17 Apps unhealthy (postgres-drbd-Restart hat CSI-Stale-Claims hinterlassen, die ihrerseits dependent Apps blockierten)
- **22:00 - 00:30**: Recovery-Versuche: Garage-Restart, Mirror-Failover, ZOT-Restarts erfolglos -- ParseStorage hängt strukturell solange S3 hakt
- **2026-05-13 00:30 - 01:15**: Architektur-Umbau live: ZOT type=service count=1 + Linstor-CSI 3-Replica DRBD + BoltDB embedded (Redis-zot ausgemustert). 78 App-Image-Refs umgestellt auf zot.service.consul:5000. Docker Hub Pro Plan aktiviert (unlimited Pulls)
- **2026-05-13 01:15**: 59 Apps healthy, ZOT stabil auf Linstor-Volumen, Pull-Through-Cache funktioniert

## 2. Warum ist es passiert

- **Ursache 1 (Hardware/Storage):** Synology-NAS (DS2419+) konnte die kombinierte Schreiblast aus Garage-S3-Migration + ZOT-Cache + sonstigen Backups (PBS, NFS) nicht bewältigen. IOPS-Sättigung
- **Ursache 2 (Architektur ZOT alt):** ZOT type=system count=3 mit S3-Backend ist strukturell fragil:
  - 3 parallele Allocs konkurrieren um ParseStorage bei Backend-Wechsel
  - S3-Latency wirkt auf jede Image-Operation -- keine Failure-Domain-Trennung zwischen Storage und Compute
  - Bei NAS-Ausfall sterben alle 3 Instanzen gleichzeitig (kein Fallback)
- **Ursache 3 (Image-Mirror-Strategie):** ALLE Apps zogen ihre Images via ZOT (`registry-mirrors: localhost:5000`). Bei ZOT-Ausfall = ganzer Cluster image-pull-blockiert. Docker registry-mirrors greift nicht für explizite docker.io/-Refs -- nur Default-Registry-Lookups, was Apps mit explizit gesetztem Prefix unbrauchbar machte für Direct-Fallback
- **Ursache 4 (telegraf-zot Vault-Secret fehlte):** Beim Recovery-Versuch wurde Telegraf gerestartet und stieg über den Vault-Template für das nicht existierende kv/data/shared/telegraf-zot ein -- der Template wurde mit `# kommentiert` deaktiviert, aber Vault-Templates ignorieren `#`-Kommentare. Telegraf hing in Render-Loop bis Template komplett entfernt wurde

## 3. Was haben wir gelernt

- **NAS ist kein Storage-Backend für aktive Pfade.** Synology mit Single-PSU, einzelner Raid-Group, gemixter Workload (Backups + S3 + NFS) ist Backup-Storage, nicht Hot-Path-Storage. Linstor-CSI auf den Cluster-Nodes ist die richtige Wahl für Live-Daten
- **Docker registry-mirrors hat ein subtiles Verhalten.** Mirror greift nur für Default-Registry-Lookups (`alpine` ohne Prefix). Bei expliziten Refs (`docker.io/library/alpine`) wird der Mirror umgangen. Alle Apps müssen Image-Refs konsistent auf zot.service.consul:5000 setzen, sonst funktioniert die Cache-Architektur nicht
- **Vault-Templates ignorieren `#`-Kommentare.** <span v-pre>`# {{ with secret ... }}`</span> wird vom consul-template trotzdem gerendert. Wenn ein Secret nicht existiert: Template KOMPLETT entfernen oder Secret anlegen
- **Linstor-CSI v1.10.6 entwickelt unter Last Stale-Claims.** Job stop + neuer Run = "failed to set source device readwrite" wenn alter Claim noch im Plugin-State. `nomad system gc` räumt das auf -- Periodic-Batch (Nomad Batch Job `batch-jobs/csi-gc.nomad`) deployed, täglich 03:30
- **ZOT-Sync-Reihenfolge bei catch-all-prefix ist kritisch.** Spezielle Registries (ghcr.io, quay.io) müssen VOR docker.io stehen, sonst routet die Catch-All-Rule alle Pulls fehl
- **Pull-Through-Cache funktioniert mit catch-all-Prefix-Match auf jeder Sync-Registry.** retryDelay 5min (statt 1h) hat sich als kritisch erwiesen -- bei Backend-Wechsel sind kurze Retry-Cycles wichtig für schnelle Recovery
- **Docker Hub Rate-Limits 2026:** anonymous 10/hr (drastisch reduziert von 100), authenticated Free 100/hr, Pro 9 USD/mo unlimited. Pro-Plan ist für einen self-hosted-Cluster mit ZOT-Cache + Personal-Pull-Last unverzichtbar

## 4. Was ändern wir

- **ZOT-Architektur strukturell verändert** -- type=service count=1, Linstor-CSI 3-Replica DRBD, BoltDB embedded. Migration durch ([ClickUp 86c9rvv31](https://app.clickup.com/t/86c9rvv31) closed)
- **78 App-Image-Refs explizit auf zot.service.consul:5000** umgestellt (mit Sub-Pfaden wie library/, ghcr.io/) -- Mirror-Quirk umgangen
- **Docker Hub Pro Plan aktiviert** -- entfernt Rate-Limit-Risiko strukturell
- **Periodischer CSI-GC** (Nomad Batch Job `batch-jobs/csi-gc.nomad`) täglich 03:30 -- präventiv gegen Linstor-Stale-Claims
- **PostgreSQL Alert-Rules** (3+1) zur Früherkennung von Connection-Storm (parallel zur Authentik #20714 Mitigation) -- siehe [Datenbank-Architektur](../_querschnitt/datenbank-architektur.md)
- **NAS als Backup-Storage isoliert** -- Garage-S3 bleibt darauf für Backup-Workloads (NAS-Backup-Storage-Schwelle 95%), Hot-Path-Daten bleiben auf Linstor
- **Pull-Through-Cache Best-Practice dokumentiert** in [docker-registry/index.md](../docker-registry/index.md) inklusive Sync-Reihenfolge, retryDelay, BoltDB-Sizing
- **Restrisiko akzeptiert:** Single-PSU NAS bleibt -- USV-Plan IT 2026 deckt das ab ([USV-Plan](../ups/index.md))

## 5. ClickUp-Tracking

- [86c9rvv31](https://app.clickup.com/t/86c9rvv31) ZOT Storage-Migration auf Linstor-CSI -- closed
- [86c9rvv73](https://app.clickup.com/t/86c9rvv73) NAS Garage-Performance-Fix -- closed
- [86c9rx2gk](https://app.clickup.com/t/86c9rx2gk) Keep upstream Image-Bug (externer Fix)
- [86c9rx2hg](https://app.clickup.com/t/86c9rx2hg) CSI-GC periodisch -- deployed (`batch-jobs/csi-gc.nomad`)
- [86c9rx2jg](https://app.clickup.com/t/86c9rx2jg) ZOT-LXC-Migration (Architektur-Verbesserung)
- [86c9rx2k9](https://app.clickup.com/t/86c9rx2k9) Wiki/DNS Cleanup filebrowser+hollama

## Verwandte Seiten

- [docker-registry/index.md](../docker-registry/index.md) -- ZOT Pull-Through-Cache, Sync-Reihenfolge und Architektur nach der Migration
- [ups/index.md](../ups/index.md) -- USV-Plan, deckt das Single-PSU-Restrisiko des NAS ab
- [_querschnitt/datenbank-architektur.md](../_querschnitt/datenbank-architektur.md) -- PostgreSQL Alert-Rules zur Connection-Storm-Früherkennung
- [_querschnitt/incident-template.md](../_querschnitt/incident-template.md) -- Vorlage für Postmortems und Incident-Dokumentation
