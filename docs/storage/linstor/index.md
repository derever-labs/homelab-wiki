---
title: Linstor & DRBD
description: Distributed Block Storage mit synchroner Replikation und Controller HA
tags:
  - storage
  - ha
  - drbd
  - linstor
  - drbd-reactor
---

# Linstor & DRBD

Linstor ist eine Management-Schicht für DRBD (Distributed Replicated Block Device). DRBD spiegelt Schreibvorgänge synchron auf Block-Level zwischen Nodes und stellt damit hochverfügbaren Block-Storage für den Nomad-Cluster bereit.

## Übersicht

| Attribut | Wert |
|----------|------|
| Deployment | Ansible Role `drbd-reactor` + Nomad CSI (`system/linstor-csi.nomad`) |
| API-Endpoint | `http://linstor-controller.service.consul:3370` |

| Komponente | Funktion |
|------------|----------|
| DRBD | Kernel-Modul für synchrone Block-Replikation |
| Linstor Controller | Management API, Cluster-Koordination (H2 DB) |
| Linstor Satellite | Node-Agent, verwaltet lokale Ressourcen |
| DRBD Reactor | Failover-Manager für Controller HA |
| CSI Driver | Integration mit Nomad/Kubernetes |

## Homelab Architektur

### Controller High Availability (HA)

Der Linstor Controller läuft im Active/Passive HA-Modus mit DRBD Reactor als Failover-Manager. Die Controller-Datenbank (H2) liegt auf einem DRBD-replizierten Volume (`linstor_db`). DRBD Reactor überwacht das Volume und startet den Controller automatisch auf dem Node mit DRBD Primary. Die gesamte Konfiguration (Promoter, Systemd Mount Unit, Consul Registration, JVM Memory) wird durch die Ansible Role `drbd-reactor` verwaltet (Repository `homelab-hashicorp-stack/ansible/roles/drbd-reactor/`).

**Wichtig:** Linstor Controller ist für Active/Passive designed -- nur EIN Controller kann gleichzeitig laufen!

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
}

linstor: Linstor-Cluster (Quorum 2/3) {
  class: container

  c05: vm-nomad-client-05 {
    class: node
    tooltip: "10.0.2.125, TB 10.99.1.105 -- Satellite + Controller-Kandidat, drbd-reactor managed"
  }
  c06: vm-nomad-client-06 {
    class: node
    tooltip: "10.0.2.126, TB 10.99.1.106 -- Satellite + Controller-Kandidat, drbd-reactor managed"
  }
  c04: vm-nomad-client-04 (diskless) {
    class: node
    tooltip: "10.0.2.124 -- Satellite ohne Storage, nur Quorum-Witness"
  }

  c05 <-> c06: DRBD-Replikation (Thunderbolt) {
    style.stroke: "#2563eb"
    tooltip: "10.99.1.0/24, ~20 Gbit/s -- alle Volumes inkl. linstor_db (H2-Controller-DB)"
  }
  c05 -- c04: Quorum (Management) {
    style.stroke: "#6b7280"
    tooltip: "10.0.2.0/24, 1 Gbit -- node-connection path management-path"
  }
  c06 -- c04: Quorum (Management) {
    style.stroke: "#6b7280"
    tooltip: "10.0.2.0/24, 1 Gbit -- node-connection path management-path"
  }
}

svc: linstor-controller.service.consul {
  class: node
  tooltip: "Consul-Service mit DNS-TTL 0 -- zeigt immer auf den aktiven Controller"
}

csi: Nomad CSI Plugin {
  class: node
  tooltip: "linstor.csi.linbit.com, privileged -- system/linstor-csi.nomad"
}

linstor.c05 -> svc: registriert wenn aktiv {
  style.stroke: "#854d0e"
  style.stroke-dash: 3
  tooltip: "drbd-reactor promotet den DRBD-Primary, startet Controller + Consul-Registrierung"
}
linstor.c06 -> svc: registriert wenn aktiv {
  style.stroke: "#854d0e"
  style.stroke-dash: 3
  tooltip: "drbd-reactor promotet den DRBD-Primary, startet Controller + Consul-Registrierung"
}
csi -> svc: Linstor API (HTTP :3370) {
  style.stroke: "#7c3aed"
  tooltip: "Endpoint via Consul Service Discovery -- Failover ohne CSI-Anpassung"
}
```

Die H2-Controller-Datenbank ist schneller als etcd und liegt auf dem DRBD-Volume repliziert. Netzwerk-Pfade und Quorum-Rollen zeigt das Diagramm; die konkreten Bandbreiten siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md).

### Netzwerk

| Netzwerk | Verwendung | Bandbreite |
|----------|------------|------------|
| 10.0.2.0/24 | Management, Nomad CSI | 1 Gbit |
| 10.99.1.0/24 | DRBD Replikation | ~20 Gbit (Thunderbolt) |

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

Auf `vm-nomad-client-05` und `-06` läuft ein Cron-Skript jede Minute, das zwei Influx-Metriken nach `/var/lib/csi-metrics/csi_health_<hostname>.influx` schreibt (lokaler Pfad, **NFS-frei**). Der lokale Telegraf-Host-Agent liest die Datei via `inputs.file` und routet die Measurements nach InfluxDB-Bucket `telegraf`. Grafana alarmiert mit zwei Alert-Rules in der `Storage Alerts`-Gruppe (`csi-stale-mount-warn`, `csi-plugin-down-crit`) und routet via Keep an Telegram.

::: danger NFS-Selbstreferenz vermieden
Der Schreibpfad ist bewusst lokal. Bis 2026-05-29 schrieb das Skript nach `/nfs/docker/telegraf/metrics/`. Bei totem NAS-`nfsd` blockierten `stat` und `mv` im uninterruptiblen D-State; jede Minute liefen neue Crons auf, die nie endeten -- ein NAS-Ausfall riss so die Storage-Nodes selbst in den Wedge. Lokaler Pfad plus `mkdir -p` statt NFS-Existenzprüfung schliesst diese Falle. Details: [InfluxDB & Telegraf](../../monitoring/influxdb.md).
:::

- **`csi_mounts.stale_count`** -- Anzahl Mount-Pfade unter `/opt/nomad/client/csi/.../per-alloc/<id>/`, deren `<id>` nicht in den running Allocs der Node existiert (orphan Mount nach Crash, OOM, Quorum-Stall).
- **`csi_plugin.socket_alive`** -- 1 wenn der CSI-Plugin-Container läuft und seine `csi.sock` im Filesystem da ist; 0 sonst.
- **`csi_plugin.uptime_seconds`** -- Plugin-Container-Uptime, hilft Alerts auf "Plugin lebt schon zu lange ohne Restart" zu fahren (siehe linstor-csi v0.13.1 State-Drift-Bug).

Token: `/etc/nomad.d/csi-monitor.token` (mode 0400 root:root) -- Nomad-ACL-Policy `csi-monitor` mit `node:read` + `namespace:read`. Token-Wert in 1Password als "Nomad CSI Monitor Token" (Privat Vault).

::: info Detection-only, kein Auto-Cleanup
Die Detection alarmiert nur, sie löscht keine Mounts selbst. Cleanup nach Alert: SSH auf die Node, `findmnt | grep csi` plus `nomad alloc status -short`, `umount` der orphan Pfade.
:::

## Performance Tuning

Globale DRBD-Properties (via Linstor Controller, gelten für alle Resources):

**Network Tuning (optimiert für 10G Thunderbolt):**
- `DrbdOptions/Net/sndbuf-size` = 1048576 (1 MB, Default 128K)
- `DrbdOptions/Net/rcvbuf-size` = 2097152 (2 MB)
- `DrbdOptions/Net/max-buffers` = 8000
- `DrbdOptions/Net/max-epoch-size` = 8000

**Disk Tuning:**
- `DrbdOptions/Disk/disk-flushes` = yes (Consumer-NVMe ohne Power-Loss-Protection)
- `DrbdOptions/Disk/md-flushes` = yes
- `DrbdOptions/Disk/al-extents` = 6433 (mehr parallele Write-Hotspots auf NVMe)

::: danger disk-flushes müssen aktiv bleiben
Im Homelab sind `disk-flushes` und `md-flushes` bewusst auf `yes` gesetzt. Die Storage-Nodes laufen auf Consumer-NVMe ohne Power-Loss-Protection (PLP): Ohne Flushes bestätigt DRBD Schreibvorgänge, die bei einem Stromausfall noch im flüchtigen Disk-Cache stehen und dann verloren gehen. Der ansible-verwaltete Default (`linstor_disk_flushes`) steht auf `yes`; nur das DClab überschreibt ihn per group_vars auf `no`, weil dort Enterprise-NVMe mit PLP verbaut ist. Die DClab-Einstellung `no` darf nicht ins Homelab übernommen werden -- das riskiert Datenverlust.
:::

**Connection Timing (tolerant gegen CPU-Kontention):**
- `DrbdOptions/Net/ping-timeout` = 20 (2 s, Default 5 = 500 ms)

Der Default-ping-timeout von 500 ms ist auf einer VM mit enger CPU-Allocation zu knapp. Wenn der Kernel-Receiver-Thread nicht innerhalb von 500 ms auf einen PingAck antwortet -- z. B. während ein dpkg-Install Kernel-Module neu schreibt oder während ein Docker-Daemon-Restart läuft -- markiert DRBD die Verbindung als tot und initiiert einen Reconnect. Das verursacht Flap-Kaskaden mit Telegram-Noise, ohne dass ein echtes Netzwerkproblem vorliegt.

2 Sekunden fangen Mikro-Stalls aus CPU-Steal, Kernel-Freezes beim Modul-Reload und kurze Netzwerk-Jitter ab, ohne echte Verbindungsprobleme zu maskieren: ein länger als 2 s ausgefallener Peer ist in jedem Fall nicht mehr ok.

## Nomad-Client-Sizing

Die Nomad-Worker-VMs hängen je 1:1 an einem Proxmox-Host. Auf den N100-Mini-PCs (`pve00`, 4 pCPU, 16 GB RAM) gilt: VM-vCPU-Allocation muss unter den physischen Cores bleiben.

- **Richtig**: 2 vCPU für die Worker-VM, 2 für Host + Nomad-Server-VM
- **Falsch**: 4 vCPU für die Worker-VM auf einem 4-Core-Host -- keine Reserve, jede Host-Aktivität erzeugt VM-Steal, kurze Stalls verletzen DRBD-Timeouts

Auf den i9-12900H-Hosts (`pve01`/`pve02`, 16 pCPU) ist die Ratio unkritisch -- dort laufen Worker-VMs mit 16 vCPU ohne Steal-Risiko.

## MaxOversubscriptionRatio

Pool-Property auf c05/c06 (Homelab) von Default 5 auf 30 gesetzt. Verhindert, dass stark overcommittete Thin Pools neue Resource-Creates blockieren. Im DClab gilt dieselbe Einstellung auf c02/c03 -- die DClab-spezifische Topologie und Konfiguration ist im DClab-Wiki dokumentiert.

## Backup

Die DRBD/LINSTOR-Volumes werden nicht LINSTOR-nativ gesichert, sondern als Block über den Proxmox Backup Server, der die Storage-VMs sichert; hinzu kommen app-konsistente DB-Dumps. Die frühere Linstor-Schedule-Engine (ephemerer Snapshot plus Shipping nach Garage S3) wurde am 2026-05-31 zurückgebaut -- sie war redundant zu PBS und lief wegen eines `listObjectsV2`-Timeout-Bugs in der Kombination Linstor + Garage ohnehin nur im Full-Only-Modus (Incremental-Backups unmöglich). Strategie, Retention und Restore: [Backup](../backup/).

## Encryption und Auto-Unlock

Passphrase-File auf c05 und c06 (`/etc/linstor/passphrase`, mode 600). `linstor-auto-unlock.service` entsperrt automatisch nach Controller-Promotion. Passphrase in 1Password: "Linstore Passphrase HOME" (PRIVAT Agent Vault).

## Nomad CSI Integration

Das CSI Plugin (`system/linstor-csi.nomad`) ermöglicht die Verwendung von Linstor-Volumes als persistenten Speicher in Nomad Jobs. Die Plugin-Attribute (Job-Typ, Plugin-ID, Constraint, Endpoint) stehen in der [Linstor Referenz](./referenz.md#nomad-csi-plugin).

Der Container läuft im privileged Mode, da CSI-Plugins Mount-Operationen auf dem Host durchführen müssen.

**Wichtig:** Das offizielle LINBIT Image (drbd.io) erfordert Login. Stattdessen wird das `quay.io/piraeusdatastore/piraeus-csi`-Image verwendet (`docker.io/kvaps` hat nur Tags bis v0.9.0). Konkreter Tag: siehe Nomad-Job `system/linstor-csi.nomad`.

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

## Performance

Die DRBD-Replikation läuft über das Thunderbolt-Netzwerk (10.99.1.0/24) mit ~20 Gbit/s (Werte siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md)). Dadurch ist die Latenz für synchrone Replikation minimal.

Erwartete Kennwerte und der pgbench-Vergleich DRBD gegen lokale SSD stehen in der [Linstor Referenz](./referenz.md#performance-kennwerte).

## Referenzen

- [LINBIT Linstor User Guide](https://linbit.com/drbd-user-guide/linstor-guide-1_0-en/)
- [DRBD User Guide](https://linbit.com/drbd-user-guide/drbd-guide-9_0-en/)
- [DRBD Reactor (GitHub)](https://github.com/LINBIT/drbd-reactor)
- [DRBD Reactor Promoter Plugin](https://linbit.com/blog/drbd-reactor-promoter/)
- [Linstor HA mit DRBD Reactor](https://docs.piraeus.daocloud.io/books/linstor-10-user-guide/page/21-linstor-high-availability-pWl)
- [Linstor CSI Driver](https://github.com/piraeusdatastore/linstor-csi)

## Verwandte Seiten

- [Linstor Betrieb](./betrieb.md) -- Failover, Troubleshooting, Monitoring, Volume-Übersicht
- [Linstor Referenz](./referenz.md) -- CSI-Attribute, Performance, Panels und Metriken
- [Split-Brain Recovery Runbook](./split-brain-runbook.md) -- Notfall-Runbook (destruktiv)
- [Proxmox](../../infrastruktur/proxmox/) -- Host- und VM-Übersicht
- [Nomad](../../plattform/nomad/) -- Container-Orchestrierung mit CSI-Volumes
- [Consul](../../plattform/consul/) -- Service Discovery für Controller HA
- [Backup](../backup/) -- Backup-Strategie für DRBD-Volumes
- [Netzwerk](../../netz/netzwerk/) -- Thunderbolt und Management-Netzwerk
