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
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: down

DB: DRBD Resource linstor_db {
  class: node
  tooltip: "Quorum 2/3 | H2 Datenbank fuer Linstor Controller State"
}

C05: vm-nomad-client-05 -- ACTIVE {
  class: container

  C05a: Linstor Controller + Satellite {
    class: node
    tooltip: "10.0.2.125 | TB: 10.99.1.105 | 200 GB ZFS, drbd-reactor managed"
  }
}

C06: vm-nomad-client-06 -- STANDBY {
  class: container

  C06a: Linstor Satellite (Standby Controller) {
    class: node
    tooltip: "10.0.2.126 | TB: 10.99.1.106 | 200 GB ZFS, drbd-reactor uebernimmt bei Failover"
  }
}

C04: vm-nomad-client-04 -- TieBreaker {
  class: container

  C04a: Satellite (Diskless) {
    class: node
    tooltip: "10.0.2.124 | Kein Storage, nur Quorum-Witness"
  }
}

CSI: Nomad CSI Plugin {
  class: node
  tooltip: "linstor.csi.linbit.com | Endpoint: linstor-controller.service.consul:3370"
}

DB -- C05: DRBD Primary {
  style.stroke: "#854d0e"
  tooltip: "Aktive H2 DB auf dem Controller-Node"
}
DB -- C06: DRBD Secondary {
  style.stroke: "#854d0e"
  style.stroke-dash: 3
  tooltip: "Synchrone Replikation der H2 DB"
}
C05 <-> C06: Thunderbolt 25 Gbit/s {
  style.stroke: "#2563eb"
  tooltip: "10.99.1.0/24 | DRBD-Replikation aller Volumes"
}
C05 -> C04: Management 1 Gbit {
  style.stroke: "#6b7280"
  tooltip: "10.0.2.0/24 | Control Plane, Quorum"
}
C06 -> C04: Management 1 Gbit {
  style.stroke: "#6b7280"
  tooltip: "10.0.2.0/24 | Control Plane, Quorum"
}
CSI -> C05: Linstor API {
  style.stroke: "#7c3aed"
  tooltip: "HTTP :3370 via Consul Service Discovery"
}
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

### Connection Paths (Homelab)

Strukturell identisch zum DClab: client-04 hängt physisch nur am Management-Netzwerk (10.0.2.0/24), nicht an der Thunderbolt-Bridge (10.99.1.0/24). PrefNic auf client-05 und -06 ist `thunderbolt`. Ohne expliziten Path-Override versucht DRBD c04 über die Thunderbolt-IP zu erreichen, was scheitert.

Lösung analog zum DClab: zwei Node-Connection-Paths auf Cluster-Ebene zwingen DRBD bei Verbindungen zu c04 auf das Mgmt-Interface (`default`).

| Verbindung | Netzwerk | Interface | Konfiguration |
|------------|----------|-----------|---------------|
| client-04 -- client-05 | Management (10.0.2.0/24) | default -- default | node-connection path management-path |
| client-04 -- client-06 | Management (10.0.2.0/24) | default -- default | node-connection path management-path |
| client-05 -- client-06 | Thunderbolt (10.99.1.0/24) | thunderbolt -- thunderbolt | node-connection path thunderbolt |

## CSI Health Monitoring

Auf `vm-nomad-client-05` und `-06` läuft ein Cron-Skript jede Minute, das zwei Influx-Metriken nach `/nfs/docker/telegraf/metrics/csi_health_<hostname>.influx` schreibt. Telegraf nimmt sie automatisch via `inputs.file` auf, InfluxDB-Bucket `telegraf` und Grafana mit zwei Alert-Rules in der `Storage Alerts`-Gruppe (`csi-stale-mount-warn`, `csi-plugin-down-crit`) routen via Keep an Telegram.

- **`csi_mounts.stale_count`** -- Anzahl Mount-Pfade unter `/opt/nomad/client/csi/.../per-alloc/<id>/`, deren `<id>` nicht in den running Allocs der Node existiert (orphan Mount nach Crash, OOM, Quorum-Stall).
- **`csi_plugin.socket_alive`** -- 1 wenn der CSI-Plugin-Container läuft und seine `csi.sock` im Filesystem da ist; 0 sonst.
- **`csi_plugin.uptime_seconds`** -- Plugin-Container-Uptime, hilft Alerts auf "Plugin lebt schon zu lange ohne Restart" zu fahren (siehe linstor-csi v0.13.1 State-Drift-Bug).

Token: `/etc/nomad.d/csi-monitor.token` (mode 0400 root:root) -- Nomad-ACL-Policy `csi-monitor` mit `node:read` + `namespace:read`. Token-Wert in 1Password als "Nomad CSI Monitor Token" (Privat Vault).

::: info Detection-only, kein Auto-Cleanup
Die erste Iteration alarmiert nur, sie löscht keine Mounts selbst. Cleanup nach Alert: SSH auf die Node, `findmnt | grep csi` plus `nomad alloc status -short`, `umount` der orphan Pfade. Auto-Cleanup wäre eine zweite Iteration nach 30 Tagen Beobachtung der Detection-Verlässlichkeit.
:::

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

**Connection Timing (tolerant gegen CPU-Kontention):**
- `DrbdOptions/Net/ping-timeout` = 20 (2 s, Default 5 = 500 ms)

Der Default-ping-timeout von 500 ms ist auf einer VM mit enger CPU-Allocation zu knapp. Wenn der Kernel-Receiver-Thread nicht innerhalb von 500 ms auf einen PingAck antwortet -- z. B. während ein dpkg-Install Kernel-Module neu schreibt oder während ein Docker-Daemon-Restart läuft -- markiert DRBD die Verbindung als tot und initiiert einen Reconnect. Das verursacht Flap-Kaskaden mit Telegram-Noise, ohne dass ein echtes Netzwerkproblem vorliegt.

2 Sekunden fangen Mikro-Stalls aus CPU-Steal, Kernel-Freezes beim Modul-Reload und kurze Netzwerk-Jitter ab, ohne echte Verbindungsprobleme zu maskieren: ein länger als 2 s ausgefallener Peer ist in jedem Fall nicht mehr ok.
:::

## Nomad-Client-Sizing

Die Nomad-Worker-VMs hängen je 1:1 an einem Proxmox-Host. Auf den N100-Mini-PCs (`pve00`, 4 pCPU, 15 GB RAM) gilt: VM-vCPU-Allocation muss unter den physischen Cores bleiben.

- **Richtig**: 2 vCPU für die Worker-VM, 2 für Host + Nomad-Server-VM
- **Falsch**: 4 vCPU für die Worker-VM auf einem 4-Core-Host -- keine Reserve, jede Host-Aktivität erzeugt VM-Steal, kurze Stalls verletzen DRBD-Timeouts

Auf den i9-12900H-Hosts (`pve01`/`pve02`, 16 pCPU) ist die Ratio unkritisch -- dort laufen Worker-VMs mit 16 vCPU ohne Steal-Risiko.

## DClab Konfiguration

Das DClab verwendet ein separates 10GbE Netzwerk (172.180.46.0/24) für DRBD-Replikation zwischen den Storage-Nodes.

### Netzwerk-Topologie

```d2
vars: {
  d2-config: {
    theme-id: 1
    layout-engine: elk
  }
}

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

direction: down

DB2: DRBD Resource linstor_db {
  class: node
  tooltip: "Quorum 2/3 | H2 Datenbank fuer Linstor Controller State"
}

DC02: vm-nomad-client-02 -- ACTIVE {
  class: container

  DC02a: Linstor Controller + Satellite {
    class: node
    tooltip: "10.180.46.82 | DRBD: 172.180.46.82 | NVMe Storage, drbd-reactor managed"
  }
}

DC03: vm-nomad-client-03 -- STANDBY {
  class: container

  DC03a: Linstor Satellite (Standby Controller) {
    class: node
    tooltip: "10.180.46.83 | DRBD: 172.180.46.83 | NVMe Storage, Failover via drbd-reactor"
  }
}

DC01: vm-nomad-client-01 -- TieBreaker {
  class: container

  DC01a: Satellite (Diskless) {
    class: node
    tooltip: "10.180.46.81 | Kein 10GbE-Zugang, nur Quorum-Witness"
  }
}

DB2 -- DC02: DRBD Primary {
  style.stroke: "#854d0e"
}
DB2 -- DC03: DRBD Secondary {
  style.stroke: "#854d0e"
  style.stroke-dash: 3
}
DC02 <-> DC03: 10GbE DRBD-Sync (172.180.46.x) {
  style.stroke: "#2563eb"
  tooltip: "Dediziertes 10GbE Netzwerk fuer Replikation"
}
DC02 -> DC01: Management 1 Gbit {
  style.stroke: "#6b7280"
  tooltip: "10.180.46.x | Control Plane, Quorum"
}
DC03 -> DC01: Management 1 Gbit {
  style.stroke: "#6b7280"
  tooltip: "10.180.46.x | Control Plane, Quorum"
}
```

### Netzwerk-Übersicht

| Node | Management (1GbE) | DRBD-Sync (10GbE) | Rolle |
|------|-------------------|-------------------|-------|
| vm-nomad-client-01 | 10.180.46.81 | - | TieBreaker (Diskless) |
| vm-nomad-client-02 | 10.180.46.82 | 172.180.46.82 | Storage + Controller |
| vm-nomad-client-03 | 10.180.46.83 | 172.180.46.83 | Storage + Controller |

**Wichtig:** client-01 hat NUR Zugang zum Management-Netzwerk (1GbE). Das DRBD-Sync Netzwerk (172.180.46.0/24) ist nur zwischen client-02 und client-03 verfügbar.

### Connection Paths

Da client-01 das 10GbE-Netzwerk nicht erreichen kann, würde Linstor ohne expliziten Path-Override versuchen, alle Verbindungen über das PrefNic-Interface (drbd-sync) aufzubauen -- Resultat: asymmetrische Pfade c83:172.x → c01:10.x, die topologisch nicht connectbar sind und zu permanenten `connection:Connecting`-Zuständen führen.

Lösung: zwei `linstor node-connection path create`-Einträge auf Cluster-Ebene, die DRBD für jede Verbindung zu c01 auf das `default`-Interface auf beiden Seiten zwingen. Diese wirken als Fallback für jede Resource-Connection ohne eigenes Path-Property -- alle dynamisch via CSI angelegten Volumes erben das Routing automatisch (Quelle: `ConfFileBuilder.java`, Resource-Connection-Path überschattet Node-Connection-Path).

| Verbindung | Netzwerk | Interface | Konfiguration |
|------------|----------|-----------|---------------|
| client-01 -- client-02 | Management (10.180.46.x) | default -- default | node-connection path management-path |
| client-01 -- client-03 | Management (10.180.46.x) | default -- default | node-connection path management-path |
| client-02 -- client-03 | DRBD-Sync (172.180.46.x) | drbd-sync -- drbd-sync | PrefNic-Default, kein Override |

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
