---
title: Linstor & DRBD
description: Distributed Block Storage mit synchroner Replikation und Controller HA
published: true
date: 2025-12-30T18:00:00+00:00
tags: storage, ha, drbd, linstor, drbd-reactor, dclab
editor: markdown
dateCreated: 2025-12-27T20:00:00+00:00
---

## Uebersicht

Linstor ist eine Management-Schicht fuer DRBD (Distributed Replicated Block Device). DRBD spiegelt Schreibvorgaenge synchron auf Block-Level zwischen Nodes.

| Komponente | Funktion |
|------------|----------|
| DRBD | Kernel-Modul fuer synchrone Block-Replikation |
| Linstor Controller | Management API, Cluster-Koordination (H2 DB) |
| Linstor Satellite | Node-Agent, verwaltet lokale Ressourcen |
| DRBD Reactor | Failover-Manager fuer Controller HA |
| CSI Driver | Integration mit Nomad/Kubernetes |

## Homelab Architektur

### Controller High Availability (HA)

Der Linstor Controller laeuft im Active/Passive HA-Modus mit DRBD Reactor als Failover-Manager. Die Controller-Datenbank (H2) liegt auf einem DRBD-replizierten Volume (`linstor_db`).

**Wichtig:** Linstor Controller ist fuer Active/Passive designed - nur EIN Controller kann gleichzeitig laufen!

```
+-------------------------------------------------------------+
|           DRBD Resource: linstor_db (Quorum: 2/3)           |
|                    H2 Datenbank                             |
+---------------+-----------------------------+---------------+
                |                             |
        +-------+-------+             +-------+-------+
        |   client-05   |  Thunderbolt|   client-06   |
        |   COMBINED    |<----------->|   COMBINED    |
        |   [ACTIVE]    |   25 Gbit   |   [STANDBY]   |
        | drbd-reactor  |             | drbd-reactor  |
        | 10.0.2.125    |             | 10.0.2.126    |
        | TB: 10.99.1.105             | TB: 10.99.1.106
        | Storage: 100GB|             | Storage: 100GB|
        +-------+-------+             +-------+-------+
                |                             |
                |         Management          |
                |           1 Gbit            |
                +-------------+---------------+
                              |
                   +----------+----------+
                   | vm-nomad-client-04  |
                   | 10.0.2.124          |
                   |                     |
                   | Satellite (Diskless)|
                   | TieBreaker/Quorum   |
                   +---------------------+
```

**Architektur-Details:**
- **Active/Passive:** Nur ein Controller laeuft gleichzeitig (managed by drbd-reactor)
- **DRBD Reactor:** Ueberwacht DRBD Quorum und startet/stoppt Services automatisch
- **H2 Datenbank:** Schneller als etcd, auf DRBD-Volume repliziert
- **Thunderbolt (25Gbit):** DRBD Replikation zwischen client-05 und client-06
- **Management (1Gbit):** Control Plane, CSI, Satellite-Kommunikation
- **TieBreaker:** client-04 ist diskloser Quorum-Witness (kein Thunderbolt noetig)

### Failover-Verhalten

| Szenario | Verhalten | Failover-Zeit |
|----------|-----------|---------------|
| Controller-Node down | Automatischer Failover zum Standby | ~10-15 Sekunden |
| Netzwerk-Partition | Quorum entscheidet (2-von-3 Nodes) | ~10-15 Sekunden |
| Manueller Failover | `drbd-reactorctl evict linstor_db` | ~20 Sekunden |
| DRBD Split-Brain | Verhindert durch Quorum-Mechanismus | - |

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

## DClab Konfiguration

Das DClab verwendet ein separates 10GbE Netzwerk (172.180.46.0/24) fuer DRBD-Replikation zwischen den Storage-Nodes.

### Netzwerk-Topologie

```
+-------------------------------------------------------------+
|           DRBD Resource: linstor_db (Quorum: 2/3)           |
|                    H2 Datenbank                             |
+---------------+-----------------------------+---------------+
                |                             |
        +-------+-------+             +-------+-------+
        |   client-02   |    10GbE    |   client-03   |
        |   COMBINED    |<----------->|   COMBINED    |
        |   [ACTIVE]    | 172.180.46.x|   [STANDBY]   |
        | drbd-reactor  |             | drbd-reactor  |
        | 10.180.46.82  |             | 10.180.46.83  |
        | DRBD: 172.180.46.82         | DRBD: 172.180.46.83
        | Storage: NVMe |             | Storage: NVMe |
        +-------+-------+             +-------+-------+
                |                             |
                |         Management          |
                |           1 Gbit            |
                +-------------+---------------+
                              |
                   +----------+----------+
                   | vm-nomad-client-01  |
                   | 10.180.46.81        |
                   |                     |
                   | Satellite (Diskless)|
                   | TieBreaker/Quorum   |
                   | KEIN 10GbE Zugang   |
                   +---------------------+
```

### Netzwerk-Uebersicht

| Node | Management (1GbE) | DRBD-Sync (10GbE) | Rolle |
|------|-------------------|-------------------|-------|
| vm-nomad-client-01 | 10.180.46.81 | - | TieBreaker (Diskless) |
| vm-nomad-client-02 | 10.180.46.82 | 172.180.46.82 | Storage + Controller |
| vm-nomad-client-03 | 10.180.46.83 | 172.180.46.83 | Storage + Controller |

**Wichtig:** client-01 hat NUR Zugang zum Management-Netzwerk (1GbE). Das DRBD-Sync Netzwerk (172.180.46.0/24) ist nur zwischen client-02 und client-03 verfuegbar.

### Connection Paths (Wichtig bei heterogenem Netzwerk)

Da client-01 das 10GbE-Netzwerk nicht erreichen kann, muessen explizite Connection-Paths konfiguriert werden. Ohne diese wuerde Linstor versuchen, alle Verbindungen ueber das PrefNic-Interface (drbd-sync) aufzubauen.

**Verbindungsmatrix:**

| Verbindung | Netzwerk | Interface |
|------------|----------|-----------|
| client-01 ↔ client-02 | Management (10.180.46.x) | default ↔ default |
| client-01 ↔ client-03 | Management (10.180.46.x) | default ↔ default |
| client-02 ↔ client-03 | DRBD-Sync (172.180.46.x) | drbd-sync ↔ drbd-sync |

**Connection-Paths erstellen:**

```bash
# Fuer jede Resource muss ein Path zum TieBreaker erstellt werden
# Beispiel fuer linstor_db:
linstor resource-connection path create vm-nomad-client-01 vm-nomad-client-02 linstor_db management-path default default
linstor resource-connection path create vm-nomad-client-01 vm-nomad-client-03 linstor_db management-path default default

# Fuer alle anderen Resources wiederholen:
for res in postgres-data traefik-data uptime-kuma-data; do
  linstor resource-connection path create vm-nomad-client-01 vm-nomad-client-02 $res management-path default default
  linstor resource-connection path create vm-nomad-client-01 vm-nomad-client-03 $res management-path default default
done
```

### Node Interface Konfiguration

```bash
# Interfaces pruefen
linstor node interface list vm-nomad-client-01
# +--------------------------------------------------------------------------+
# | vm-nomad-client-01 | NetInterface | IP           | Port | EncryptionType |
# | + StltCon          | default      | 10.180.46.81 | 3366 | PLAIN          |
# +--------------------------------------------------------------------------+

linstor node interface list vm-nomad-client-02
# +---------------------------------------------------------------------------+
# | vm-nomad-client-02 | NetInterface | IP            | Port | EncryptionType |
# | + StltCon          | default      | 10.180.46.82  | 3366 | PLAIN          |
# |                    | drbd-sync    | 172.180.46.82 |      |                |
# +---------------------------------------------------------------------------+

# PrefNic ist auf Node-Level gesetzt (NUR fuer Storage-Nodes)
linstor node list-properties vm-nomad-client-02 | grep PrefNic
# | PrefNic | drbd-sync |

# client-01 hat KEIN PrefNic (verwendet automatisch default)
```

### DRBD Resource Konfiguration

Die resultierende DRBD-Konfiguration zeigt die korrekten Verbindungsadressen:

```bash
# cat /var/lib/linstor.d/linstor_db.res (auf client-02)
connection
{
    path
    {
        host "vm-nomad-client-01" address ipv4 10.180.46.81:7011;   # Management
        host "vm-nomad-client-02" address ipv4 10.180.46.82:7011;   # Management
    }
}

connection
{
    host "vm-nomad-client-02" address ipv4 172.180.46.82:7011;      # 10GbE
    host "vm-nomad-client-03" address ipv4 172.180.46.83:7011;      # 10GbE
}
```

### IP-Reservierungen (172.180.46.0/24)

| IP | Verwendung |
|----|------------|
| 172.180.46.1-4 | Reserviert (Netzwerk-Infrastruktur) |
| 172.180.46.82 | vm-nomad-client-02 (DRBD-Sync) |
| 172.180.46.83 | vm-nomad-client-03 (DRBD-Sync) |

### Aktive Resources (DClab)

| Resource | Groesse | Verwendung |
|----------|---------|------------|
| linstor_db | 500 MiB | Controller H2 Datenbank (HA) |
| postgres-data | 10 GiB | PostgreSQL |
| traefik-data | 1 GiB | Traefik Proxy |
| authentik-data | 5 GiB | Authentik SSO |
| uptime-kuma-data | 1 GiB | Uptime Monitoring |
| homepage-data | 500 MiB | Homepage Dashboard |
| flame-data | 500 MiB | Flame Dashboard |
| wikijs-data | 2 GiB | Wiki.js |
| snipeit-data | 1 GiB | Snipe-IT Assets |
| snipeit-db | 2 GiB | Snipe-IT Database |

### Troubleshooting DClab

**Verbindungen im "Connecting" Status:**

Wenn Ressourcen "Connecting" zu client-01 zeigen, fehlen die Connection-Paths:

```bash
# Status pruefen
linstor resource list -r <resource-name>

# Fehlende Paths erstellen
linstor resource-connection path create vm-nomad-client-01 vm-nomad-client-02 <resource-name> management-path default default
linstor resource-connection path create vm-nomad-client-01 vm-nomad-client-03 <resource-name> management-path default default
```

**DRBD-Konfiguration verifizieren:**

```bash
# Auf client-02 oder client-03
cat /var/lib/linstor.d/<resource-name>.res | grep -A5 connection

# Verbindungen zu client-01 muessen 10.180.46.x verwenden
# Verbindungen zwischen client-02 und client-03 muessen 172.180.46.x verwenden
```

### Aktive Volumes

| Volume | Groesse | Verwendung |
|--------|---------|------------|
| **linstor_db** | 500 MiB | **Linstor Controller H2 Datenbank (HA)** |
| influxdb-data | 3 GiB | InfluxDB Time Series DB |
| jellyfin-config | 15 GiB | Jellyfin Media Server Config |
| paperless-data | 20 GiB | Paperless-ngx Dokumente |
| postgres-data | 10 GiB | PostgreSQL Datenbank (zentral) |
| sabnzbd-config | 1 GiB | SABnzbd Download Client |
| stash-data | 10 GiB | Stash Media Organizer |
| uptime-kuma-data | 5 GiB | Uptime Kuma Monitoring |
| vaultwarden-data | 1 GiB | Vaultwarden Password Manager |

Alle Volumes sind 2-fach repliziert (client-05 + client-06) mit Diskless TieBreaker auf client-04.

**Hinweis:** `linstor_db` ist ein spezielles Volume fuer die Controller-Datenbank. Es wird von drbd-reactor verwaltet und sollte nicht manuell geaendert werden.

### CSI HA via Consul Service Discovery

Um den automatischen Failover des Linstor Controllers ohne manuelle Anpassung des CSI-Plugins zu ermoeglichen, wird Consul Service Discovery genutzt.

**Funktionsweise:**
1. Der aktive Linstor Controller (bestimmt durch drbd-reactor) registriert sich als Service `linstor-controller` in Consul.
2. Das CSI Plugin verwendet `http://linstor-controller.service.consul:3370` als Endpoint.
3. Bei einem Failover registriert der neue aktive Node den Service.
4. Die DNS TTL fuer diesen Service ist auf 0s gesetzt, um Caching-Probleme zu vermeiden.

**Komponenten:**
- **Registration Script:** `/usr/local/bin/linstor-consul-register.sh`
- **Systemd Service:** `linstor-consul-register.service` (haengt von linstor-controller ab)
- **DRBD Reactor:** Startet den Registration-Service zusammen mit dem Controller

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

# Nur Satellite aktivieren (Controller wird von drbd-reactor verwaltet)
sudo systemctl enable --now linstor-satellite

# Controller NICHT manuell enablen - wird von drbd-reactor gesteuert!
# sudo systemctl enable linstor-controller  # NICHT AUSFUEHREN
```

### DRBD Reactor Installation (Storage Nodes)

```bash
# Auf client-05 und client-06
sudo apt-get install -y drbd-reactor

# Version pruefen (mindestens 1.10.0)
drbd-reactor --version
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
          "--linstor-endpoint=http://10.0.2.125:3370,http://10.0.2.126:3370",
          "--log-level=info"
        ]
      }
      csi_plugin {
        id        = "linstor.csi.linbit.com"
        type      = "monolith"
        mount_dir = "/csi"
      }
      env {
        # HA Controller Endpoints (beide Combined Nodes)
        LS_CONTROLLERS = "http://10.0.2.125:3370,http://10.0.2.126:3370"
      }
    }
  }
}
```

**Hinweis:** Das CSI Plugin laeuft nur auf den Storage Nodes (client-05, client-06), da nur diese Volumes mounten koennen. Die HA-Endpoints stellen sicher, dass CSI-Operationen auch bei Controller-Ausfall funktionieren.

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

# DRBD Reactor Status (Controller HA)
sudo drbd-reactorctl status

# DRBD Status (alle Ressourcen)
drbdadm status
drbdadm status linstor_db  # Controller DB

# Detaillierte DRBD Statistiken
cat /proc/drbd
drbdsetup status --verbose --statistics
```

### Volume erstellen

```bash
# Manuell
linstor resource-group spawn-resources rg-replicated myvolume 10G

# Via Nomad CSI (automatisch)
nomad volume create volume.hcl
```

### Failover testen

**Controller Failover (DRBD Reactor):**
```bash
# Aktuellen Status pruefen
sudo drbd-reactorctl status

# Manuellen Failover ausloesen (auf aktivem Node)
sudo drbd-reactorctl evict linstor_db

# Status auf dem anderen Node pruefen
ssh sam@10.0.2.126 "sudo drbd-reactorctl status"

# Cluster-Status verifizieren
linstor node list
```

**Satellite Failover:**
```bash
# Satellite offline nehmen
sudo systemctl stop linstor-satellite

# Pruefen ob Resources auf anderem Node verfuegbar
linstor resource list

# Satellite wieder online
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

### Controller HA mit DRBD Reactor

Der Linstor Controller laeuft im Active/Passive Modus. DRBD Reactor ueberwacht das `linstor_db` DRBD-Volume und startet den Controller automatisch auf dem Node mit DRBD Primary.

**DRBD Reactor Status:**
```bash
# Auf jedem Storage Node
sudo drbd-reactorctl status

# Beispiel-Output:
# /etc/drbd-reactor.d/linstor_db.toml:
# Promoter: Currently active on this node
# * drbd-services@linstor_db.target
# * +- drbd-promote@linstor_db.service
# * +- var-lib-linstor.mount
# * +- linstor-controller.service
```

**Controller Status:**
```bash
# Aktueller aktiver Controller
linstor controller which

# DRBD Status fuer linstor_db
sudo drbdadm status linstor_db

# Controller Logs
journalctl -u linstor-controller -f

# drbd-reactor Logs
journalctl -u drbd-reactor -f
```

**Manueller Failover:**
```bash
# Auf dem aktiven Node ausfuehren
sudo drbd-reactorctl evict linstor_db

# Der andere Node uebernimmt automatisch (~20 Sekunden)
```

**Controller Konfiguration (`/etc/linstor/linstor.toml` auf client-05/06):**
```toml
[db]
# H2 Datenbank (default, gespeichert in /var/lib/linstor)
# Keine connection_url = verwendet H2

[http]
enabled = true
listen_addr = "::"
port = 3370

[logging]
level = "info"
linstor_level = "info"
```

**DRBD Reactor Promoter Config (`/etc/drbd-reactor.d/linstor_db.toml`):**
```toml
[[promoter]]
id = "linstor-controller"

[promoter.resources.linstor_db]
start = ["var-lib-linstor.mount", "linstor-controller.service"]
on-drbd-demote-failure = "reboot"
on-quorum-loss = "shutdown"
secondary-force = true
preferred-nodes = ["vm-nomad-client-05", "vm-nomad-client-06"]
```

**Systemd Mount Unit (`/etc/systemd/system/var-lib-linstor.mount`):**
```ini
[Unit]
Description=LINSTOR Database Filesystem (DRBD)
After=drbd-reactor.service

[Mount]
What=/dev/drbd/by-res/linstor_db/0
Where=/var/lib/linstor
Type=ext4
Options=defaults

[Install]
WantedBy=multi-user.target
```

**Satellite Konfiguration (`/etc/linstor/linstor.toml` auf client-04):**
```toml
# Satellite-only - keine DB-Konfiguration noetig
[logging]
level = "info"
```

**Bei Controller-Ausfall:**
1. DRBD Reactor erkennt Quorum-Verlust auf dem ausgefallenen Node
2. Standby-Node erhaelt Quorum und wird DRBD Primary
3. drbd-reactor mounted `/var/lib/linstor` und startet `linstor-controller`
4. Satellites reconnecten automatisch zum neuen Controller
5. CSI Plugin verbindet automatisch (beide Endpoints konfiguriert)
6. Failover dauert ca. 10-15 Sekunden

## Backup

### Automatische Snapshots

Taeglich um 02:00 Uhr werden automatisch Snapshots aller Linstor-Ressourcen erstellt. Die letzten 7 Snapshots werden behalten.

**Script:** `/usr/local/bin/linstor-snapshot.sh` auf client-05

```bash
#!/bin/bash
# Linstor Daily Snapshot Script
# Dynamisch - erfasst automatisch alle neuen Ressourcen

DATE=$(date +%Y%m%d-%H%M)
KEEP=7

# Alle Ressourcen dynamisch abfragen
RESOURCES=$(linstor resource-definition list -p 2>/dev/null | \
  grep -v '^+' | grep -v 'ResourceName' | awk '{print $2}' | \
  grep -v '^$' | grep -v '^|')

for RES in $RESOURCES; do
  # Snapshot erstellen
  linstor snapshot create "$RES" "daily-$DATE"

  # Alte Snapshots loeschen (behalte die letzten KEEP)
  linstor snapshot list -r "$RES" | grep "daily-" | awk '{print $2}' | \
    sort -r | tail -n +$((KEEP+1)) | while read SNAP; do
      linstor snapshot delete "$RES" "$SNAP"
    done
done
```

**Cron Job:** `/etc/cron.d/linstor-snapshot`

```
# Linstor Daily Snapshots at 02:00
0 2 * * * root /usr/local/bin/linstor-snapshot.sh >> /var/log/linstor-snapshot.log 2>&1
```

**Wichtig:** Neue Ressourcen werden automatisch erfasst - keine manuelle Anpassung noetig.

### Manueller Snapshot

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

### Snapshot Status pruefen

```bash
# Alle Snapshots anzeigen
linstor snapshot list

# Snapshots einer Ressource
linstor snapshot list -r postgres-data

# Log der automatischen Snapshots
tail -f /var/log/linstor-snapshot.log
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
- [DRBD Reactor (GitHub)](https://github.com/LINBIT/drbd-reactor)
- [DRBD Reactor Promoter Plugin](https://linbit.com/blog/drbd-reactor-promoter/)
- [Linstor HA mit DRBD Reactor](https://docs.piraeus.daocloud.io/books/linstor-10-user-guide/page/21-linstor-high-availability-pWl)
- [Linstor CSI Driver](https://github.com/piraeusdatastore/linstor-csi)
