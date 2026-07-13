---
title: Zot Container Registry - Betrieb
description: Betriebshandbuch für die Zot Registry -- Failover, Backup, Troubleshooting
tags:
  - zot
  - registry
  - betrieb
  - troubleshooting
---

# Zot Container Registry - Betrieb

Betriebs- und Wartungsprozeduren der Zot Registry. Steckbrief, Architektur und
Konfiguration stehen im [Steckbrief](./index.md).

## Failover & Wiederanlauf

Mit `type = "service"` und Linstor-CSI DRBD-Volume vereinfacht sich der Wiederanlauf gegenüber dem früheren System-Job mit S3-Backend deutlich:

1. Node fällt aus → Nomad erkennt fehlgeschlagene Health Checks
2. Nomad rescheduled die Allokation auf einen anderen Node
3. Linstor-CSI meldet das DRBD-Volume auf dem Ziel-Node an -- kein Daten-Sync nötig (DRBD repliziert Block-Level live)
4. ZOT startet mit vollem Datenstand und sofortigem Zugriff auf den BoltDB-Index -- ein Cold-Start-ParseStorage-Durchlauf (wie früher mit Redis/S3) entfällt
5. `zot.service.consul` zeigt auf die neue Allokation -- Nodes, die `registry-mirrors` nutzen, verbinden sich automatisch zur neuen Instanz

::: warning CSI Stale-Claim Pattern
Nach einem unclean Node-Ausfall kann der CSI-Volume-Claim im "stale" Zustand hängen bleiben (Nomad kennt den alten Alloc noch, der Node meldet sich nicht mehr zurück). Symptom: neue Allokation startet nicht, Volume-Mount schlägt fehl.

Workaround: `nomad system gc` ausführen -- bereinigt stale Alloc-Einträge und gibt den CSI-Claim frei. Danach startet Nomad die Allokation neu. Der DRBD-Volume-Inhalt bleibt dabei unberührt.
:::

## Backup

- Linstor-CSI Volume `zot-data` (150 GB DRBD): Block-Level 3-Replica im Cluster -- kein separates Backup-Job nötig für Availability. Für Disaster-Recovery (alle 3 Nodes gleichzeitig verloren) gilt: Pull-Through-Cache füllt sich on-demand aus Upstream-Registries neu. Eigene Pushes (`homelab/...`, `immo-monitor/...`) müssen separat gesichert werden.

## Troubleshooting

### Langsame Image Pulls (>30s)

1. **Zot Health prüfen:** `curl http://zot.service.consul:5000/v2/` muss 200 zurückgeben
2. **Allokation prüfen:** `nomad job status zot-registry` -- 1 Alloc im Status `running`
3. **CSI-Volume prüfen:** `nomad volume status zot-data` -- Volume gemounted und nicht stale
4. **Upstream prüfen:** Zot-Container-Logs auf `TOOMANYREQUESTS` oder Connection-Timeouts

### CSI-Claim stale nach Node-Ausfall

Symptom: neue Allokation startet nicht, Volume-Mount-Fehler in den Alloc-Logs. `nomad system gc` ausführen -- das bereinigt stale Alloc-Einträge, danach rescheduled Nomad automatisch.

### Nach Cluster-Restart

ZOT startet mit BoltDB-Index sofort wieder. Keine Wartezeit wie beim früheren S3/Redis-Cold-Start. Kurze Anlaufzeit nur für den CSI-Volume-Mount (DRBD-Attach, typisch < 10s).

## Verwandte Seiten

- [Zot Container Registry](./index.md) -- Steckbrief, Architektur, Konfiguration
- [Cluster-Neustart](../_querschnitt/cluster-restart.md) -- Verhalten der Registry nach Cluster-Restart
