---
title: Karakeep Referenz
description: Container-Tasks, Volumes, Secrets und Backup-Parameter von Karakeep
tags:
  - service
  - productivity
  - nomad
  - referenz
---

# Karakeep Referenz

Technische Details zum Nomad-Job `services/karakeep.nomad`. Konfigurationswerte und Image-Tags stehen im Job selbst; diese Seite beschreibt Struktur und Begründung.

## Container-Tasks

Der Job läuft als eine einzige Nomad-Group mit vier Tasks, damit alle den Claim auf das `karakeep-data`-Volume teilen können (siehe [Backup](#backup)).

| Task | Rolle | Lifecycle |
| :--- | :--- | :--- |
| `web` | Karakeep-Applikation, serviert Web-UI und `/api` | Haupt-Task |
| `chrome` | Headless-Chrome erzeugt Screenshots und rendert JS-Seiten | Prestart-Sidecar |
| `meilisearch` | Volltextsuche inklusive OCR-Treffern | Prestart-Sidecar |
| `backup` | tägliches App-Level-Backup der Datenbank und Assets | Poststart-Sidecar |

Die Tasks adressieren sich innerhalb der Group über `NOMAD_ADDR_<port>`; `web` erreicht Chrome und Meilisearch also ohne Consul-Umweg.

## Volumes

Beide Volumes sind repliziert (Linstor CSI, `rg-replicated`, `autoPlace=2`, `single-node-writer`).

| Volume | Grösse | Inhalt | Begründung |
| :--- | :--- | :--- | :--- |
| `karakeep-data` | 20 GiB | SQLite-DB (WAL) und Bild-Assets | SQLite braucht lokales oder CSI-Volume, nie NFS (File-Locking) |
| `karakeep-meili` | 5 GiB | Meilisearch-Suchindex | abgeleiteter Index, auf CSI gegen stillen Suchausfall nach Reschedule (siehe [Architektur](./index.md#storage-und-suche)) |

Die Volume-Spezifikationen liegen unter `volumes/karakeep-data-volume.hcl` und `volumes/karakeep-meili-volume.hcl`.

## Secrets

Alle Secrets liegen im eigenen KV-Pfad `kv/data/karakeep` und werden per Workload Identity injiziert.

| Feld | Verwendung |
| :--- | :--- |
| `nextauth_secret` | Session-Signierung der Karakeep-Anmeldung |
| `meili_master_key` | Master-Key zwischen `web` und Meilisearch |
| `backup_kuma_push_url` | Push-URL des Backup-Heartbeats (siehe [Monitoring](#monitoring)) |

Karakeep nutzt keine geteilte Datenbank aus dem Cluster, sondern die eingebettete SQLite-DB im Datenvolume; es taucht deshalb nicht in der [Datenbank-Zuordnung](../_referenz/datenbanken.md) auf.

## Backup

Das Backup läuft als Poststart-Sidecar in derselben Group und nicht als eigener periodischer Batch-Job. Grund: `karakeep-data` ist ein `single-node-writer`-Volume und am laufenden `web`-Alloc geclaimt -- nur eine Task derselben Group teilt diesen Claim und bekommt Dateizugriff auf die Live-Datenbank. Ein separater Batch-Job könnte das Volume nicht mounten.

| Parameter | Wert |
| :--- | :--- |
| Zeitplan | täglich 03:30 Europe/Zurich (gestaffelt nach postgres 03:00 / mariadb 03:15) |
| Methode | SQLite Online-Backup-API (`.backup`) plus Assets, konsistenter Snapshot ohne rohes `cp` |
| Verschlüsselung | age, cluster-weiter Public Key (gleicher Schlüssel wie postgres- und mariadb-Backup) |
| Ziel | `/nfs/backup/karakeep` auf dem NAS (NFS-Guard prüft das Ziel vor dem Schreiben) |
| Rotation | GFS 7 täglich / 28 wöchentlich (Sonntag) / 90 monatlich (Monatserster) |

Warum App-Level und nicht das VM-Backup: PBS sichert nur ganze VMs, und für die DRBD-Volumes gibt es keinen Einzelvolume-Restore. Ein konsistenter Snapshot der Live-Datenbank ist nur über die SQLite-Online-Backup-API möglich. Einordnung in die übrigen Backup-Ebenen: [Backup](../storage/backup/index.md).

## Monitoring

Der Backup-Sidecar sendet nach erfolgreichem Lauf einen Push an den Uptime-Kuma-Monitor **Karakeep Backup** (Gruppe *Storage & Backup*, 26-Stunden-Fenster). Bleibt der Heartbeat aus, geht der Monitor auf DOWN. Coverage-Einordnung: [Monitoring: Coverage](../monitoring/coverage/index.md).

## Verwandte Seiten

- [Karakeep](./index.md) -- Architektur und Rolle im Stack
- [Karakeep Betrieb](./betrieb.md) -- Erfassung, Restore, Reindex, Troubleshooting
- [Backup](../storage/backup/index.md) -- Gesamtübersicht aller Backup-Schichten
- [Uptime Kuma](../monitoring/uptime-kuma/index.md) -- Push-Monitore und Alerting
