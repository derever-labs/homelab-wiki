---
title: Linstor Betrieb
description: Betriebshandbuch für Linstor/DRBD -- Snapshot-Management, Troubleshooting, Volume-Verwaltung
tags:
  - linstor
  - drbd
  - betrieb
  - troubleshooting
---

# Linstor Betrieb

## Controller Failover

### Automatischer Failover

DRBD Reactor überwacht das `linstor_db` DRBD-Volume und steuert den Controller automatisch:

1. DRBD Reactor erkennt Quorum-Verlust auf dem ausgefallenen Node
2. Standby-Node erhält Quorum und wird DRBD Primary
3. drbd-reactor mounted `/var/lib/linstor` und startet `linstor-controller`
4. Satellites reconnecten automatisch zum neuen Controller
5. CSI Plugin verbindet automatisch (Consul Service Discovery)
6. Failover dauert ca. 10-15 Sekunden

### Manueller Failover

Manuelles Eviction über `drbd-reactorctl evict linstor_db` (ca. 20 Sekunden).

### Failover-Szenarien

| Szenario | Verhalten | Failover-Zeit |
|----------|-----------|---------------|
| Controller-Node down | Automatischer Failover zum Standby | ~10-15 Sekunden |
| Netzwerk-Partition | Quorum entscheidet (2-von-3 Nodes) | ~10-15 Sekunden |
| Manueller Failover | `drbd-reactorctl evict linstor_db` | ~20 Sekunden |
| DRBD Split-Brain | Verhindert durch Quorum-Mechanismus | - |

## Split-Brain Recovery

Ein Split-Brain tritt auf wenn beide Nodes sich als Primary sehen. Dies wird durch den Quorum-Mechanismus (2-von-3) normalerweise verhindert.

Falls es dennoch vorkommt:

1. Bestimmen welcher Node die aktuelleren Daten hat
2. Den anderen Node als Secondary degradieren und seine Daten verwerfen
3. Verbindung wiederherstellen -- der Secondary synchronisiert automatisch vom Primary

::: danger Datenverlust
Beim Verwerfen der Daten auf dem Secondary gehen alle Schreibvorgänge verloren, die nur auf diesem Node stattfanden. Vor der Recovery prüfen, ob relevante Daten betroffen sind.
:::

## Volume-Management

### Aktive Volumes (Homelab)

| Volume | Grösse | Verwendung |
|--------|---------|------------|
| **linstor_db** | 500 MiB | Linstor Controller H2 Datenbank (HA) |
| flame-data | 1 GiB | Flame Dashboard |
| flame-intra-data | 1 GiB | Flame-Intra Dashboard |
| gitea-data | 5 GiB | Gitea Git Server |
| influxdb-data | 30 GiB | InfluxDB Time Series DB |
| jellyfin-config | 15 GiB | Jellyfin Media Server Config |
| kimai-data | 2 GiB | Kimai MariaDB |
| loki-data | 20 GiB | Loki Log Aggregation |
| mosquitto-data | 1 GiB | MQTT Persistence |
| obsidian-livesync-data | 1 GiB | CouchDB |
| paperless-data | 20 GiB | Paperless-ngx Dokumente |
| postgres-data | 10 GiB | PostgreSQL Datenbank (zentral) |
| sabnzbd-config | 1 GiB | SABnzbd Download Client |
| stash-data | 10 GiB | Stash Media Organizer |
| stash-secure-data | 2 GiB | Stash-Secure Config/Cache/Metadata |
| uptime-kuma-data | 5 GiB | Uptime Kuma Monitoring |
| vaultwarden-data | 1 GiB | Vaultwarden Password Manager |

Alle Volumes sind 2-fach repliziert (client-05 + client-06) mit Diskless TieBreaker auf client-04.

::: warning linstor_db
`linstor_db` ist ein spezielles Volume für die Controller-Datenbank. Es wird von drbd-reactor verwaltet und sollte nicht manuell geändert werden.
:::

### Storage Nodes

| Node | Disk | Pool | Kapazität |
|------|------|------|-----------|
| vm-nomad-client-05 | /dev/sdb | linstor_pool | 200 GB |
| vm-nomad-client-06 | /dev/sdb | linstor_pool | 200 GB |

## Monitoring

### Grafana Dashboard

URL: `https://graf.ackermannprivat.ch/d/linstor-storage/linstor-storage`

| Panel | Beschreibung |
|-------|--------------|
| Storage Pool Auslastung | Gauge mit Gesamtauslastung (Schwellwerte: 70% gelb, 90% rot) |
| Storage Pool Total/Frei | Absolute Werte in GB |
| Volumes | Anzahl der Resource Definitions |
| Volume Auslastung | Prozentuale Auslastung pro Volume |
| Volume Allocation | Tatsächlich belegter Speicher pro Volume |
| Node Status | Online/Offline Status aller Nodes |
| Resource Status | Sync-Status aller Ressourcen |

### LVM Thin Pool Monitoring

Linstor meldet `storage_pool_capacity_free_bytes`, aber dies bildet die tatsächliche LVM-Thin-Pool-Auslastung (inkl. Snapshot-Overhead) nicht korrekt ab. Beim Thin-Pool-Overflow-Incident zeigte Linstor noch freien Platz, während LVM bei 100% war.

Die LVM-Metriken werden per Cron (1 Min) als InfluxDB Line Protocol exportiert und über Telegraf nach InfluxDB geschrieben. Zusätzlich läuft ein CheckMK Local Check direkt auf dem Host (75% WARN, 85% CRIT) als Safety Net -- funktioniert auch wenn der gesamte Container-Stack ausfällt.

### Wichtige Metriken

| Metrik | Beschreibung |
|--------|--------------|
| `linstor_storage_pool_capacity_total_bytes` | Gesamtkapazität des Storage Pools |
| `linstor_storage_pool_capacity_free_bytes` | Freier Speicher im Pool |
| `linstor_volume_allocated_size_bytes` | Tatsächlich belegter Speicher pro Volume |
| `linstor_volume_definition_size_bytes` | Provisionierte Grösse pro Volume |
| `linstor_node_state` | Node Status (0=Offline, 1=Connected, 2=Online) |
| `linstor_resource_state` | Resource Status (0=UpToDate, 1=Syncing) |
| `linstor_resource_definition_count` | Anzahl der definierten Volumes |

## LINBIT GUI

| Eigenschaft | Wert |
|-------------|------|
| URL | `https://linstor-gui.ackermannprivat.ch` |
| Deployment | Nomad Service Job (`system/linstor-gui.nomad`) |
| Image | `linstor-gui:v2.2.0` (self-built, lokal verfügbar) |
| Auth | Authentik ForwardAuth (`intern-auth`) |
| Backend | `linstor-controller.service.consul:3370` (Consul DNS) |
| Constraint | `vm-nomad-client-05`, `vm-nomad-client-06` |

Die GUI verbindet sich automatisch mit dem aktiven Linstor Controller via Consul DNS -- bei einem Controller-Failover bleibt die GUI funktional.

## CSI Boot Race Condition

### Problem

Nach einem Node-Reboot kann es vorkommen, dass CSI-abhängige Nomad Jobs (Postgres, Vaultwarden, etc.) in `pending` hängen bleiben. Die Ursache ist eine Timing-Lücke: Die Jobs werden evaluiert bevor das Linstor CSI Plugin als "healthy" registriert ist. Nomad erstellt eine "blocked eval", die normalerweise aufgelöst wird wenn das Plugin healthy wird -- aber in manchen Fällen bleibt sie stecken (dokumentiert in GitHub Issues #8994, #13028, #11784).

### Lösung: nomad-csi-reeval Timer

Auf client-05 und client-06 läuft ein systemd Timer (`nomad-csi-reeval.timer`), der 60 Sekunden nach dem Boot ein poll-basiertes Script startet:

1. Wartet bis die Nomad API erreichbar ist
2. Wartet bis das CSI Plugin `linstor.csi.linbit.com` mindestens einen healthy Node hat
3. Sucht nach blockierten Evaluations und re-evaluiert diese

Das Script ist idempotent -- bei bereits laufenden Jobs passiert nichts.

### Troubleshooting

- Timer-Status: `systemctl status nomad-csi-reeval.timer`
- Letzte Ausführung: `journalctl -u nomad-csi-reeval --no-pager -n 20`
- Manuell auslösen: `sudo systemctl start nomad-csi-reeval.service`
- Blocked evals prüfen: `nomad eval list -status=blocked`
- Manuell re-evaluieren: `nomad job eval <job-name>`

### Dateien

| Datei | Beschreibung |
|-------|--------------|
| `/usr/local/bin/nomad-csi-reeval.sh` | Poll-basiertes Re-Evaluation Script |
| `/etc/systemd/system/nomad-csi-reeval.service` | Oneshot Service |
| `/etc/systemd/system/nomad-csi-reeval.timer` | Boot-Timer (60s nach Start) |
| `/etc/nomad.d/nomad-csi-reeval.env` | Nomad Token (0600) |

## Backup

Die Backup-Strategie für DRBD-Volumes ist in der [Backup-Dokumentation](../backup/) beschrieben.

## Verwandte Seiten

- [Linstor Storage](../linstor-storage/) -- Architektur, HA-Design, CSI-Integration
- [Proxmox](../proxmox/) -- Host- und VM-Übersicht
- [Nomad](../nomad/) -- Container-Orchestrierung mit CSI-Volumes
- [Backup](../backup/) -- Backup-Strategie für DRBD-Volumes
