---
title: Linstor & DRBD
description: Distributed Block Storage mit synchroner Replikation und Controller HA
tags:
  - storage
  - ha
  - drbd
  - linstor
  - drbd-reactor
  - dclab
---

# Linstor & DRBD

Linstor ist eine Management-Schicht für DRBD (Distributed Replicated Block Device). DRBD spiegelt Schreibvorgänge synchron auf Block-Level zwischen Nodes und stellt damit hochverfügbaren Block-Storage für den Nomad-Cluster bereit.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Ansible Role `drbd-reactor` + Nomad CSI (`system/linstor-csi.nomad`) |
| Auth | `intern-auth@file` (Authentik ForwardAuth) für LINBIT GUI |

Linstor ist eine Management-Schicht für DRBD (Distributed Replicated Block Device). DRBD spiegelt Schreibvorgänge synchron auf Block-Level zwischen Nodes.

| Komponente | Funktion |
|------------|----------|
| DRBD | Kernel-Modul für synchrone Block-Replikation |
| Linstor Controller | Management API, Cluster-Koordination (H2 DB) |
| Linstor Satellite | Node-Agent, verwaltet lokale Ressourcen |
| DRBD Reactor | Failover-Manager für Controller HA |
| CSI Driver | Integration mit Nomad/Kubernetes |

## Homelab Architektur

### Controller High Availability (HA)

Der Linstor Controller läuft im Active/Passive HA-Modus mit DRBD Reactor als Failover-Manager. Die Controller-Datenbank (H2) liegt auf einem DRBD-replizierten Volume (`linstor_db`).

**Wichtig:** Linstor Controller ist für Active/Passive designed -- nur EIN Controller kann gleichzeitig laufen!

```d2
direction: down

DB: "DRBD Resource: linstor_db (Quorum: 2/3) H2 Datenbank" { style.border-radius: 8 }

C05: "client-05 — ACTIVE" {
  style.stroke-dash: 4
  C05a: "COMBINED drbd-reactor Storage: 200GB" { tooltip: "10.0.2.125 / TB: 10.99.1.105"; style.border-radius: 8 }
}

C06: "client-06 — STANDBY" {
  style.stroke-dash: 4
  C06a: "COMBINED drbd-reactor Storage: 200GB" { tooltip: "10.0.2.126 / TB: 10.99.1.106"; style.border-radius: 8 }
}

C04: vm-nomad-client-04 {
  style.stroke-dash: 4
  C04a: "Satellite (Diskless) TieBreaker/Quorum" { tooltip: "10.0.2.124"; style.border-radius: 8 }
}

DB -- C05
DB -- C06
C05 <-> C06: Thunderbolt 25 Gbit
C05 -> C04: Management 1 Gbit
C06 -> C04: Management 1 Gbit
```

**Architektur-Details:**
- **Active/Passive:** Nur ein Controller läuft gleichzeitig (managed by drbd-reactor)
- **DRBD Reactor:** Überwacht DRBD Quorum und startet/stoppt Services automatisch
- **H2 Datenbank:** Schneller als etcd, auf DRBD-Volume repliziert
- **Thunderbolt (25 Gbit):** DRBD Replikation zwischen client-05 und client-06
- **Management (1 Gbit):** Control Plane, CSI, Satellite-Kommunikation
- **TieBreaker:** client-04 ist diskloser Quorum-Witness (kein Thunderbolt nötig)

### Netzwerk

| Netzwerk | Verwendung | Bandbreite |
|----------|------------|------------|
| 10.0.2.0/24 | Management, Nomad CSI | 1 Gbit |
| 10.99.1.0/24 | DRBD Replikation | 25 Gbit (Thunderbolt) |

### Quorum

- 3 Nodes im Cluster (2 Storage + 1 Diskless Witness)
- 2 von 3 müssen erreichbar sein für Schreiboperationen
- Node 04 ist diskless Witness (nur Quorum, keine Daten)
- Verhindert Split-Brain bei Netzwerkpartitionierung

## Performance Tuning

Globale DRBD-Properties (via Linstor Controller, gelten für alle Resources):

**Network Tuning (optimiert für 10G Thunderbolt):**
- `DrbdOptions/Net/sndbuf-size` = 1048576 (1 MB, Default 128K)
- `DrbdOptions/Net/rcvbuf-size` = 2097152 (2 MB)
- `DrbdOptions/Net/max-buffers` = 8000
- `DrbdOptions/Net/max-epoch-size` = 8000

**Disk Tuning (sicher weil ZFS darunter):**
- `DrbdOptions/Disk/disk-flushes` = no (ZFS hat eigene Barrier-Logik)
- `DrbdOptions/Disk/md-flushes` = no
- `DrbdOptions/Disk/al-extents` = 6433 (mehr parallele Write-Hotspots auf NVMe)

::: warning disk-flushes deaktivieren
`disk-flushes no` ist nur sicher wenn ZFS als unterliegendes Dateisystem genutzt wird. Bei LVM/ext4 als Backend NICHT deaktivieren -- Datenverlust-Risiko bei Stromausfall.
:::

## DClab Konfiguration

Das DClab verwendet ein separates 10GbE Netzwerk (172.180.46.0/24) für DRBD-Replikation zwischen den Storage-Nodes.

### Netzwerk-Topologie

```d2
direction: down

DB2: "DRBD Resource: linstor_db (Quorum: 2/3) H2 Datenbank" { style.border-radius: 8 }

DC02: "client-02 — ACTIVE" {
  style.stroke-dash: 4
  DC02a: "COMBINED / drbd-reactor Storage: NVMe" { tooltip: "10.180.46.82 / DRBD: 172.180.46.82"; style.border-radius: 8 }
}

DC03: "client-03 — STANDBY" {
  style.stroke-dash: 4
  DC03a: "COMBINED / drbd-reactor Storage: NVMe" { tooltip: "10.180.46.83 / DRBD: 172.180.46.83"; style.border-radius: 8 }
}

DC01: vm-nomad-client-01 {
  style.stroke-dash: 4
  DC01a: "Satellite (Diskless) TieBreaker/Quorum" { tooltip: "10.180.46.81 / KEIN 10GbE Zugang"; style.border-radius: 8 }
}

DB2 -- DC02
DB2 -- DC03
DC02 <-> DC03: "10GbE (172.180.46.x)"
DC02 -> DC01: Management 1 Gbit
DC03 -> DC01: Management 1 Gbit
```

### Netzwerk-Übersicht

| Node | Management (1GbE) | DRBD-Sync (10GbE) | Rolle |
|------|-------------------|-------------------|-------|
| vm-nomad-client-01 | 10.180.46.81 | - | TieBreaker (Diskless) |
| vm-nomad-client-02 | 10.180.46.82 | 172.180.46.82 | Storage + Controller |
| vm-nomad-client-03 | 10.180.46.83 | 172.180.46.83 | Storage + Controller |

**Wichtig:** client-01 hat NUR Zugang zum Management-Netzwerk (1GbE). Das DRBD-Sync Netzwerk (172.180.46.0/24) ist nur zwischen client-02 und client-03 verfügbar.

### Connection Paths

Da client-01 das 10GbE-Netzwerk nicht erreichen kann, müssen explizite Connection-Paths konfiguriert werden. Ohne diese würde Linstor versuchen, alle Verbindungen über das PrefNic-Interface (drbd-sync) aufzubauen.

| Verbindung | Netzwerk | Interface |
|------------|----------|-----------|
| client-01 -- client-02 | Management (10.180.46.x) | default -- default |
| client-01 -- client-03 | Management (10.180.46.x) | default -- default |
| client-02 -- client-03 | DRBD-Sync (172.180.46.x) | drbd-sync -- drbd-sync |

### IP-Reservierungen (172.180.46.0/24)

| IP | Verwendung |
|----|------------|
| 172.180.46.1-4 | Reserviert (Netzwerk-Infrastruktur) |
| 172.180.46.82 | vm-nomad-client-02 (DRBD-Sync) |
| 172.180.46.83 | vm-nomad-client-03 (DRBD-Sync) |

### Aktive Resources (DClab)

| Resource | Grösse | Verwendung |
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

## Installation und Konfiguration

Deployment via Ansible Role `drbd-reactor`. Siehe Repository `homelab-hashicorp-stack/ansible/roles/drbd-reactor/`.

## Nomad CSI Integration

Das CSI Plugin (`system/linstor-csi.nomad`) ermöglicht die Verwendung von Linstor-Volumes als persistenten Speicher in Nomad Jobs.

| Eigenschaft | Wert |
|-------------|------|
| Job-Typ | System (läuft auf allen Storage Nodes) |
| Plugin-ID | `linstor.csi.linbit.com` |
| Plugin-Typ | Monolith (Controller + Node in einem Container) |
| Image | Siehe Nomad-Job `system/linstor-csi.nomad` |
| Constraint | `vm-nomad-client-05`, `vm-nomad-client-06` |
| Endpoint | `http://linstor-controller.service.consul:3370` |

Der Container läuft im privileged Mode, da CSI-Plugins Mount-Operationen auf dem Host durchführen müssen.

**Wichtig:** Das offizielle LINBIT Image (drbd.io) erfordert Login. Stattdessen wird `kvaps/linstor-csi` von Docker Hub verwendet.

### CSI HA via Consul Service Discovery

Um den automatischen Failover des Linstor Controllers ohne manuelle Anpassung des CSI-Plugins zu ermöglichen, wird Consul Service Discovery genutzt.

**Funktionsweise:**
1. Der aktive Linstor Controller (bestimmt durch drbd-reactor) registriert sich als Service `linstor-controller` in Consul.
2. Das CSI Plugin verwendet `http://linstor-controller.service.consul:3370` als Endpoint.
3. Bei einem Failover registriert der neue aktive Node den Service.
4. Die DNS TTL für diesen Service ist auf 0s gesetzt, um Caching-Probleme zu vermeiden.

**Komponenten:**
- **Registration Script:** `/usr/local/bin/linstor-consul-register.sh`
- **Systemd Service:** `linstor-consul-register.service` (hängt von linstor-controller ab)
- **DRBD Reactor:** Startet den Registration-Service zusammen mit dem Controller

## Controller HA mit DRBD Reactor

Der Linstor Controller läuft im Active/Passive Modus. DRBD Reactor überwacht das `linstor_db` DRBD-Volume und startet den Controller automatisch auf dem Node mit DRBD Primary.

Die gesamte Konfiguration (DRBD Reactor Promoter, Systemd Mount Unit, Consul Registration, JVM Memory) wird durch die Ansible Role `drbd-reactor` verwaltet.

## Performance

### Thunderbolt Optimierung

Die DRBD-Replikation läuft über das Thunderbolt-Netzwerk (10.99.1.0/24) mit 25 Gbit/s. Dadurch ist die Latenz für synchrone Replikation minimal.

| Metrik | Erwarteter Wert |
|--------|-----------------|
| Latenz | < 0.1 ms |
| Throughput | > 1 GB/s |
| IOPS | > 100k (SSD) |

### PostgreSQL Benchmark (DRBD vs Lokale SSD)

Benchmark durchgeführt am 2025-12-29 mit pgbench (Scale 10, 10 Clients, 2 Threads, 60 Sekunden).

| Metrik | DRBD (Netzwerk) | Lokal (SSD) | Differenz |
|--------|-----------------|-------------|-----------|
| TPS | 2,561 | 4,411 | +72% |
| Latenz | 3.91 ms | 2.27 ms | -42% |
| Transaktionen (60s) | 153,379 | 264,633 | +73% |
| Verbindungszeit | 117 ms | 10 ms | -91% |

**Fazit:** Der DRBD-Performance-Overhead ist für den Anwendungsfall akzeptabel. Die Vorteile (automatisches Failover, keine manuelle Replikation) überwiegen die leicht höheren Latenzen. Die meisten Services benötigen < 100 TPS.

## Referenzen

- [LINBIT Linstor User Guide](https://linbit.com/drbd-user-guide/linstor-guide-1_0-en/)
- [DRBD User Guide](https://linbit.com/drbd-user-guide/drbd-guide-9_0-en/)
- [DRBD Reactor (GitHub)](https://github.com/LINBIT/drbd-reactor)
- [DRBD Reactor Promoter Plugin](https://linbit.com/blog/drbd-reactor-promoter/)
- [Linstor HA mit DRBD Reactor](https://docs.piraeus.daocloud.io/books/linstor-10-user-guide/page/21-linstor-high-availability-pWl)
- [Linstor CSI Driver](https://github.com/piraeusdatastore/linstor-csi)

## Verwandte Seiten

- [Linstor Betrieb](./betrieb.md) -- Failover, Troubleshooting, Monitoring, Volume-Übersicht
- [Proxmox](../proxmox/) -- Host- und VM-Übersicht
- [Nomad](../nomad/) -- Container-Orchestrierung mit CSI-Volumes
- [Consul](../consul/) -- Service Discovery für Controller HA
- [Backup](../backup/) -- Backup-Strategie für DRBD-Volumes
- [Netzwerk](../netzwerk/) -- Thunderbolt und Management-Netzwerk
