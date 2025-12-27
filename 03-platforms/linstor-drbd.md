---
title: Linstor & DRBD
description: Distributed Block Storage mit synchroner Replikation
published: true
date: 2025-12-27T20:00:00+00:00
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
                      Linstor 3-Node HA Cluster

   +-----------------------+
   | vm-nomad-client-04    |
   | 10.0.2.124            |
   |                       |
   | Linstor Controller    |  <- Alle 3 Nodes laufen Controller
   | Satellite (Diskless)  |  <- Leader Election via etcd
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
   | Linstor Controller    |  DRBD   | Linstor Controller    |
   | Satellite             | Proto C | Satellite             |
   | Storage: 100GB        |         | Storage: 100GB        |
   | /dev/sdb              |         | /dev/sdb              |
   +-----------------------+         +-----------------------+
```

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

- 3 Nodes im Cluster
- 2 von 3 muessen erreichbar sein
- Node 04 ist diskless (nur Quorum, keine Daten)
- Verhindert Split-Brain bei Netzwerkpartitionierung

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
# Auf einem beliebigen Node
linstor node create vm-nomad-client-04 10.0.2.124
linstor node create vm-nomad-client-05 10.0.2.125
linstor node create vm-nomad-client-06 10.0.2.126

# Interface fuer DRBD-Traffic (Thunderbolt)
linstor node interface create vm-nomad-client-05 thunderbolt 10.99.1.105
linstor node interface create vm-nomad-client-06 thunderbolt 10.99.1.106
```

### Storage Pool erstellen

```bash
# Nur auf Storage Nodes
linstor storage-pool create lvmthin vm-nomad-client-05 linstor_pool linstor_vg/thinpool
linstor storage-pool create lvmthin vm-nomad-client-06 linstor_pool linstor_vg/thinpool

# Diskless Pool auf Node 04 (fuer Quorum)
linstor storage-pool create diskless vm-nomad-client-04 diskless_pool
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
          "--linstor-endpoint=http://10.0.2.124:3370",
          "--log-level=info"
        ]
      }
      csi_plugin {
        id        = "linstor.csi.linbit.com"
        type      = "monolith"
        mount_dir = "/csi"
      }
      env {
        LS_CONTROLLERS = "http://10.0.2.124:3370,http://10.0.2.125:3370,http://10.0.2.126:3370"
      }
    }
  }
}
```

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

### Monitoring

```bash
# DRBD Metriken
drbdsetup status --verbose --statistics

# Linstor Metriken (Prometheus)
curl http://localhost:3370/metrics
```

## Referenzen

- [LINBIT Linstor User Guide](https://linbit.com/drbd-user-guide/linstor-guide-1_0-en/)
- [DRBD User Guide](https://linbit.com/drbd-user-guide/drbd-guide-9_0-en/)
- [Linstor CSI Driver](https://github.com/piraeusdatastore/linstor-csi)
