---
title: Linstor & DRBD
description: Distributed Block Storage mit synchroner Replikation
published: true
date: 2025-12-29T17:00:00+00:00
tags: storage, ha, drbd, linstor
editor: markdown
dateCreated: 2025-12-27T20:00:00+00:00
---

## Uebersicht

Linstor ist eine Management-Schicht fuer DRBD (Distributed Replicated Block Device). DRBD spiegelt Schreibvorgaenge synchron auf Block-Level zwischen Nodes.

| Komponente | Funktion |
|------------|----------|
| DRBD | Kernel-Modul fuer synchrone Block-Replikation |
| Linstor Controller | Management API, Cluster-Koordination |
| Linstor Satellite | Node-Agent, verwaltet lokale Ressourcen |
| CSI Driver | Integration mit Nomad/Kubernetes |

## Architektur

```
                      Linstor 3-Node Cluster

   +-----------------------+
   | vm-nomad-client-04    |
   | 10.0.2.124            |
   |                       |
   | Satellite (Diskless)  |  <- Diskless Witness fuer Quorum
   | Nur DRBD, kein LVM    |
   +-----------+-----------+
               | 1 Gbit
   +-----------+-----------+---------------------------+
   |                                                   |
   v                                                   v
   +-----------------------+         +-----------------------+
   | vm-nomad-client-05    |         | vm-nomad-client-06    |
   | 10.0.2.125            |         | 10.0.2.126            |
   | TB: 10.99.1.105       |<------->| TB: 10.99.1.106       |
   |                       | 25 Gbit |                       |
   | Linstor Controller    |  DRBD   | Satellite             |
   | Satellite (Combined)  | Proto C |                       |
   | Storage: 100GB LVM    |         | Storage: 100GB LVM    |
   | /dev/sdb              |         | /dev/sdb              |
   +-----------------------+         +-----------------------+
```

**Wichtig:** Der Linstor Controller laeuft nur auf client-05 (Combined Node). Die anderen Nodes sind Satellites.

### Netzwerk

| Netzwerk | Verwendung | Bandbreite |
|----------|------------|------------|
| 10.0.2.0/24 | Management, Nomad CSI | 1 Gbit |
| 10.99.1.0/24 | DRBD Replikation | 25 Gbit (Thunderbolt) |

### Storage Nodes

| Node | Disk | Pool | Kapazitaet |
|------|------|------|------------|
| vm-nomad-client-05 | /dev/sdb | linstor_pool | 100 GB |
| vm-nomad-client-06 | /dev/sdb | linstor_pool | 100 GB |

### Quorum

- 3 Nodes im Cluster (2 Storage + 1 Diskless Witness)
- 2 von 3 muessen erreichbar sein fuer Schreiboperationen
- Node 04 ist diskless Witness (nur Quorum, keine Daten)
- Verhindert Split-Brain bei Netzwerkpartitionierung

### Aktive Volumes

| Volume | Groesse | Verwendung |
|--------|---------|------------|
| influxdb-data | 3 GiB | InfluxDB Time Series DB |
| jellyfin-config | 15 GiB | Jellyfin Media Server Config |
| paperless-data | 20 GiB | Paperless-ngx Dokumente |
| postgres-data | 10 GiB | PostgreSQL Datenbank (zentral) |
| sabnzbd-config | 1 GiB | SABnzbd Download Client |
| stash-data | 10 GiB | Stash Media Organizer |
| uptime-kuma-data | 5 GiB | Uptime Kuma Monitoring |
| vaultwarden-data | 1 GiB | Vaultwarden Password Manager |

Alle Volumes sind 2-fach repliziert (client-05 + client-06) mit Diskless TieBreaker auf client-04.

## Installation

### Voraussetzungen

```bash
# Auf allen 3 Nodes
sudo apt-get update
sudo apt-get install -y software-properties-common

# LINBIT PPA hinzufuegen
sudo add-apt-repository -y ppa:linbit/linbit-drbd9-stack
sudo apt-get update
```

### DRBD Kernel-Modul (nur Storage Nodes)

```bash
# Auf Nodes 05 und 06
sudo apt-get install -y drbd-dkms drbd-utils
sudo modprobe drbd
echo "drbd" | sudo tee /etc/modules-load.d/drbd.conf
```

### Linstor Installation (alle Nodes)

```bash
# Controller und Satellite
sudo apt-get install -y linstor-controller linstor-satellite linstor-client

# Services aktivieren
sudo systemctl enable --now linstor-controller
sudo systemctl enable --now linstor-satellite
```

### LVM Thin Pool (nur Storage Nodes)

```bash
# Auf Nodes 05 und 06
sudo pvcreate /dev/sdb
sudo vgcreate linstor_vg /dev/sdb
sudo lvcreate -l 95%FREE -T linstor_vg/thinpool
```

## Konfiguration

### Cluster initialisieren

```bash
# Auf dem Controller Node (client-05)

# Controller Node (Combined = Controller + Satellite)
linstor node create vm-nomad-client-05 10.0.2.125 --node-type Combined

# Storage Satellite
linstor node create vm-nomad-client-06 10.0.2.126 --node-type Satellite

# Diskless Witness (nur fuer Quorum)
linstor node create vm-nomad-client-04 10.0.2.124 --node-type Satellite

# Interface fuer DRBD-Traffic (Thunderbolt, nur Storage Nodes)
linstor node interface create vm-nomad-client-05 thunderbolt 10.99.1.105
linstor node interface create vm-nomad-client-06 thunderbolt 10.99.1.106

# PrefNic setzen damit DRBD Thunderbolt bevorzugt
linstor node set-property vm-nomad-client-05 PrefNic thunderbolt
linstor node set-property vm-nomad-client-06 PrefNic thunderbolt
```

### Storage Pool erstellen

```bash
# Nur auf Storage Nodes (05, 06)
linstor storage-pool create lvmthin vm-nomad-client-05 linstor_pool linstor_vg/thinpool
linstor storage-pool create lvmthin vm-nomad-client-06 linstor_pool linstor_vg/thinpool

# Diskless Pool wird automatisch erstellt (DfltDisklessStorPool)
```

### Diskless Witness hinzufuegen

Fuer jede Ressource muss ein Diskless Witness erstellt werden:

```bash
# Nach dem Erstellen einer Ressource auf Storage Nodes
linstor resource create vm-nomad-client-04 <resource-name> --diskless

# Beispiel fuer uptime-kuma-data
linstor resource create vm-nomad-client-04 uptime-kuma-data --diskless
```

### Resource Definition

```bash
# Resource Group mit 2 Replicas
linstor resource-group create rg-replicated \
  --storage-pool linstor_pool \
  --place-count 2 \
  --diskless-on-remaining true

# Volume Group
linstor volume-group create rg-replicated

# DRBD Options (Protocol C = synchron)
linstor resource-group drbd-options --protocol C rg-replicated
```

## Nomad CSI Integration

### CSI Plugin Deployment

**Wichtig:** Das offizielle LINBIT Image (drbd.io) erfordert Login. Verwende stattdessen `kvaps/linstor-csi` von Docker Hub.

**Voraussetzung:** Docker privileged mode muss in Nomad aktiviert sein:
```hcl
# /etc/nomad.d/client.hcl
plugin "docker" {
  config {
    allow_privileged = true
  }
}
```

```hcl
# nomad-jobs/system/linstor-csi.nomad
job "linstor-csi" {
  type = "system"
  datacenters = ["dc1"]

  # Nur auf Nodes mit Linstor/DRBD Storage
  constraint {
    attribute = "${attr.unique.hostname}"
    operator  = "regexp"
    value     = "vm-nomad-client-0[56]"
  }

  group "csi" {
    network {
      mode = "host"
    }

    task "plugin" {
      driver = "docker"
      config {
        image      = "kvaps/linstor-csi:latest"
        privileged = true
        args = [
          "--csi-endpoint=unix:///csi/csi.sock",
          "--node=${attr.unique.hostname}",
          "--linstor-endpoint=http://10.0.2.125:3370",
          "--log-level=info"
        ]
      }
      csi_plugin {
        id        = "linstor.csi.linbit.com"
        type      = "monolith"
        mount_dir = "/csi"
      }
      env {
        # Nur ein Controller (Combined Node auf client-05)
        LS_CONTROLLERS = "http://10.0.2.125:3370"
      }
    }
  }
}
```

**Hinweis:** Das CSI Plugin laeuft nur auf den Storage Nodes (client-05, client-06), da nur diese Volumes mounten koennen.

### Volume erstellen

```hcl
# In Nomad Job
volume "jellyfin-data" {
  type            = "csi"
  source          = "jellyfin-data"
  read_only       = false
  access_mode     = "single-node-writer"
  attachment_mode = "file-system"
}

task "jellyfin" {
  volume_mount {
    volume      = "jellyfin-data"
    destination = "/config"
  }
}
```

## Betrieb

### Status pruefen

```bash
# Cluster Status
linstor node list
linstor storage-pool list
linstor resource list

# DRBD Status
drbdadm status
cat /proc/drbd
```

### Volume erstellen

```bash
# Manuell
linstor resource-group spawn-resources rg-replicated myvolume 10G

# Via Nomad CSI (automatisch)
nomad volume create volume.hcl
```

### Failover testen

```bash
# Node offline nehmen
sudo systemctl stop linstor-satellite

# Pruefen ob Resources auf anderem Node verfuegbar
linstor resource list

# Node wieder online
sudo systemctl start linstor-satellite
```

## Troubleshooting

### DRBD Status

```bash
# Verbindungsstatus
drbdadm status all

# Sync-Fortschritt
cat /proc/drbd

# Logs
journalctl -u linstor-satellite -f
```

### Split-Brain Recovery

```bash
# Auf dem Node der verworfen werden soll
drbdadm disconnect <resource>
drbdadm secondary <resource>
drbdadm connect --discard-my-data <resource>

# Auf dem Node der behalten werden soll
drbdadm connect <resource>
```

### Controller HA

```bash
# Leader pruefen
linstor controller list

# Bei Controller-Failover
# -> Automatisch via Leader Election
# -> Satellites reconnecten automatisch
```

## Backup

### Snapshot erstellen

```bash
linstor snapshot create <resource> <snapshot-name>
linstor snapshot list
```

### Snapshot wiederherstellen

```bash
linstor snapshot volume-definition restore \
  --from-resource <resource> \
  --from-snapshot <snapshot-name> \
  --to-resource <new-resource>
```

## Performance

### Thunderbolt Optimierung

Die DRBD-Replikation laeuft ueber das Thunderbolt-Netzwerk (10.99.1.0/24) mit 25 Gbit/s. Dadurch ist die Latenz fuer synchrone Replikation minimal.

| Metrik | Erwarteter Wert |
|--------|-----------------|
| Latenz | < 0.1 ms |
| Throughput | > 1 GB/s |
| IOPS | > 100k (SSD) |

### PostgreSQL Benchmark (DRBD vs Lokale SSD)

Benchmark durchgefuehrt am 2025-12-29 mit pgbench (Scale 10, 10 Clients, 2 Threads, 60 Sekunden).

**Testaufbau:**
- DRBD: PostgreSQL auf client-05 (DRBD Volume), Zugriff von client-06 via `postgres.service.consul`
- Lokal: PostgreSQL direkt auf client-06 SSD, lokaler Unix-Socket Zugriff

| Metrik | DRBD (Netzwerk) | Lokal (SSD) | Differenz |
|--------|-----------------|-------------|-----------|
| TPS | 2,561 | 4,411 | +72% |
| Latenz | 3.91 ms | 2.27 ms | -42% |
| Transaktionen (60s) | 153,379 | 264,633 | +73% |
| Verbindungszeit | 117 ms | 10 ms | -91% |

**Erkenntnisse:**
- DRBD-Overhead: ca. 1.6 ms zusaetzliche Latenz pro Transaktion (Netzwerk-RTT + synchrone Replikation)
- Lokale SSD ist ~72% schneller bei TPS, aber DRBD mit 2,561 TPS ist fuer Homelab-Anwendungen mehr als ausreichend
- Die meisten Services (Jellyseerr, Sonarr, etc.) benoetigen < 100 TPS
- Verbindungszeit ueber Netzwerk ist hoeher (TCP vs Unix-Socket), aber nur beim initialen Connect relevant

**Fazit:** Der DRBD-Performance-Overhead ist fuer den Anwendungsfall akzeptabel. Die Vorteile (automatisches Failover, keine manuelle Replikation) ueberwiegen die leicht hoeheren Latenzen.

#### Konfiguration verifizieren

```bash
# Interfaces pruefen
linstor node interface list vm-nomad-client-05
linstor node interface list vm-nomad-client-06

# PrefNic Property pruefen
linstor node list-properties vm-nomad-client-05
linstor node list-properties vm-nomad-client-06
# -> PrefNic sollte "thunderbolt" sein

# DRBD Verbindungen pruefen (muessen 10.99.1.x IPs zeigen)
ss -tnp | grep ':7'
# -> Verbindungen zwischen 10.99.1.105 und 10.99.1.106
```

### Monitoring

#### Grafana Dashboard

URL: `https://graf.ackermannprivat.ch/d/linstor-storage/linstor-storage`

Das Linstor Storage Dashboard zeigt:

| Panel | Beschreibung |
|-------|--------------|
| Storage Pool Auslastung | Gauge mit Gesamtauslastung des linstor_pool (Schwellwerte: 70% gelb, 90% rot) |
| Storage Pool Total/Frei | Absolute Werte in GB |
| Volumes | Anzahl der Resource Definitions |
| Volume Auslastung | Prozentuale Auslastung pro Volume (Belegt/Provisioniert), sortiert nach hoechster Auslastung |
| Volume Allocation | Tatsaechlich belegter Speicher pro Volume in Bytes |
| Volume Definition | Provisionierte Groesse pro Volume in Bytes |
| Node Status | Online/Offline Status aller Linstor Nodes |
| Resource Status | Sync-Status aller Ressourcen (UpToDate, Syncing, Diskless) |

#### Metriken-Pipeline

```
Linstor Controller (10.0.2.125:3370)
         |
         | /metrics Endpoint
         v
    Traefik Proxy
         |
         | https://linstor.ackermannprivat.ch/metrics
         v
      Telegraf
         |
         | prometheus input plugin (60s interval)
         v
      InfluxDB
         |
         | telegraf bucket
         v
      Grafana
```

#### Telegraf Konfiguration

```toml
# /nfs/docker/telegraf/config/telegraf.conf
[[inputs.prometheus]]
  urls = ["https://linstor.ackermannprivat.ch/metrics"]
  metric_version = 2
  interval = "60s"
  response_timeout = "10s"

  [inputs.prometheus.tags]
    source = "linstor"
```

#### Wichtige Metriken

| Metrik | Beschreibung |
|--------|--------------|
| linstor_storage_pool_capacity_total_bytes | Gesamtkapazitaet des Storage Pools |
| linstor_storage_pool_capacity_free_bytes | Freier Speicher im Pool |
| linstor_volume_allocated_size_bytes | Tatsaechlich belegter Speicher pro Volume |
| linstor_volume_definition_size_bytes | Provisionierte Groesse pro Volume |
| linstor_node_state | Node Status (0=Offline, 1=Connected, 2=Online) |
| linstor_resource_state | Resource Status (0=UpToDate, 1=Syncing) |
| linstor_resource_definition_count | Anzahl der definierten Volumes |

#### CLI Monitoring

```bash
# DRBD Metriken
drbdsetup status --verbose --statistics

# Linstor Metriken (Prometheus)
curl http://localhost:3370/metrics

# Schnellstatus
linstor node list
linstor storage-pool list
linstor resource list -p
```

## Referenzen

- [LINBIT Linstor User Guide](https://linbit.com/drbd-user-guide/linstor-guide-1_0-en/)
- [DRBD User Guide](https://linbit.com/drbd-user-guide/drbd-guide-9_0-en/)
- [Linstor CSI Driver](https://github.com/piraeusdatastore/linstor-csi)
