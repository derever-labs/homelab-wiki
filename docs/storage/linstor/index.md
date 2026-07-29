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

## Architektur

Drei Szenario-Sichten zeigen die Mechanik des Storage-Stacks: der synchrone Schreibpfad, der Controller-Failover mit CSI-Anbindung und das Verhalten bei Node-Ausfall und Heilung. Lese-Konvention für alle Diagramme: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt. Durchgezogene Kanten laufen synchron im Schreib- oder API-Pfad, gestrichelte asynchron als Kontroll- oder Hintergrundverkehr. Farben kodieren die Wege: Blau der synchrone Nutzpfad, Ocker der drbd-reactor-Kontrollweg, Grün die Heilung nach einem Ausfall, Grau der Quorum-Hintergrund.

### Schreibpfad (synchrone Replikation)

**Leitfrage:** Wann gilt ein Write als quittiert -- und warum verliert ein Node-Crash oder Stromausfall keine bestätigten Daten?

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { style: { border-radius: 8 } }
  schreib: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  quorum: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
}

c05: vm-nomad-client-05 (Primary) {
  class: container
  label.near: top-center
  tooltip: "Beispiel-Rollenverteilung -- Primary ist immer der Node, auf dem die Alloc ihr Volume gemountet hat"

  alloc: Nomad-Alloc { class: node }
  drbd: DRBD-Resource (Primary) { class: node }
  disk: "NVMe -- LVM-Thin linstor_pool" { class: data }
}

c06: vm-nomad-client-06 (Secondary) {
  class: container
  label.near: top-center

  drbd: DRBD-Resource (Secondary) { class: node }
  disk: "NVMe -- LVM-Thin linstor_pool" { class: data }
}

c04: vm-nomad-client-04 (TieBreaker) {
  class: node
  tooltip: "diskless -- nur Quorum-Stimme über das Management-Netz, sieht nie Nutzdaten"
}

c05.alloc -> c05.drbd: "1. write() -- kehrt erst nach lokalem Write und Peer-Ack zurück" { class: schreib }
c05.drbd -> c05.disk: "2a. Write mit Flush auf das Thin-LV" { class: schreib }
c05.drbd -> c06.drbd: "2b. parallel Replika-Write mit Ack -- Protokoll C via Thunderbolt" { class: schreib }
c06.drbd -> c06.disk: "3. Write mit Flush" { class: schreib }
c05.drbd -> c04: "Quorum-Stimme (Management-Netz)" { class: quorum; style.stroke-dash: 3 }
c06.drbd -> c04: "Quorum-Stimme (Management-Netz)" { class: quorum; style.stroke-dash: 3 }
```

**Lesehilfe:**

1. Jedes CSI-Volume existiert zweifach (PlaceCount 2) auf client-05 und -06; client-04 hält dieselbe Resource diskless und liefert nur die dritte Quorum-Stimme ([Volume-Management](./betrieb.md#volume-management)).
2. Die Alloc läuft immer auf einem der beiden Storage-Nodes -- das CSI-Plugin ist per Constraint auf client-05/-06 beschränkt ([Nomad CSI Integration](#nomad-csi-integration)). Beim Mount promotet DRBD den Node automatisch zum Primary (auto-promote).
3. Ein write() geht parallel auf die lokale NVMe und per Protokoll C an den Peer -- quittiert wird erst, wenn beide geschrieben haben. Beide Nodes tragen dadurch in jedem Moment denselben bestätigten Datenstand.
4. Geschrieben heisst durchgeschrieben: `disk-flushes` und `md-flushes` erzwingen den Flush durch den flüchtigen Cache der Consumer-NVMe ([Performance Tuning](#performance-tuning)).
5. Nutzdaten fliessen ausschliesslich über den Thunderbolt-Pfad, die Quorum-Verbindungen zu client-04 über das Management-Netz ([Netzwerk und Connection Paths](#netzwerk-und-connection-paths)).
6. Schreiben darf nur, wer die Quorum-Mehrheit (2 von 3 Stimmen) sieht -- was ohne Mehrheit passiert, zeigt [Node-Ausfall und Heilung](#node-ausfall-und-heilung).

### Controller-Failover und CSI

Der Linstor Controller ist zustandsbehaftet (H2-Datenbank -- schneller als etcd und ohne zusätzlichen Cluster-Dienst) und strikt Active/Passive: Es darf nur ein Controller gleichzeitig laufen. Seine Datenbank liegt auf dem DRBD-Volume `linstor_db`, das Failover-Management übernimmt drbd-reactor auf client-05 und -06. Die gesamte Konfiguration (Promoter, Mount-Unit, Consul-Registrierung, JVM Memory) verwaltet die Ansible-Rolle `drbd-reactor` (Repository `homelab-hashicorp-stack/ansible/roles/drbd-reactor/`).

**Leitfrage:** Wer entscheidet, welcher Node den Controller startet -- und wie findet das CSI-Plugin den Controller nach einem Failover, ohne dass eine Config angepasst wird?

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { style: { border-radius: 8 } }
  schreib: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  kontroll: { style: { stroke: "#8f6418"; font-color: "#8f6418" } }
  quorum: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
}

db: "linstor_db (DRBD)" {
  class: data
  tooltip: "500 MiB H2-Controller-DB -- repliziert wie jedes Volume, TieBreaker auf client-04"
}

aktiv: Aktiver Node (client-05 oder -06) {
  class: container
  label.near: top-center

  reactor: drbd-reactor { class: node }
  ctrl: Linstor Controller { class: node }
}

standby: Standby-Node (der jeweils andere) {
  class: container
  label.near: top-center

  reactor: drbd-reactor { class: node }
}

consul: Consul {
  class: node
  tooltip: "Service linstor-controller -- Health-Check /health alle 10s, Deregistrierung nach 30s critical"
}

csi: CSI-Plugin {
  class: node
  tooltip: "system-Job auf client-05/-06 -- kennt den Controller nur als Consul-DNS-Namen"
}

aktiv.reactor -> db: "1. promotet zum Primary -- sobald das DRBD-Quorum es erlaubt" { class: kontroll; style.stroke-dash: 3 }
aktiv.reactor -> aktiv.ctrl: "2. startet die Kette -- Mount, Controller, Auto-Unlock, Consul-Registrierung" { class: kontroll; style.stroke-dash: 3 }
aktiv.ctrl -> consul: "3. Registrierung als linstor-controller" { class: kontroll; style.stroke-dash: 3 }
standby.reactor -> db: "beobachtet dieselbe Resource -- ohne Quorum-Mehrheit keine Promotion" { class: quorum; style.stroke-dash: 3 }
csi -> consul: "4. löst linstor-controller.service.consul auf -- DNS-TTL 0" { class: schreib }
csi -> aktiv.ctrl: "5. Linstor-API HTTP :3370 -- Volume anlegen, attachen, vergrössern" { class: schreib }
```

**Lesehilfe:**

1. drbd-reactor läuft auf beiden Storage-Nodes -- wer den Controller starten darf, entscheidet aber das DRBD-Quorum der Resource `linstor_db`: Nur der Node, der zum Primary promoten kann, gewinnt. `linstor_db` steht dafür auf `auto-promote no`, die Promotion gehört vollständig drbd-reactor.
2. Nach der Promotion startet drbd-reactor die systemd-Kette: `/var/lib/linstor` mounten, `linstor-controller` starten, Encryption entsperren ([Encryption und Auto-Unlock](#encryption-und-auto-unlock)), Consul-Registrierung ([CSI HA via Consul](#csi-ha-via-consul-service-discovery)).
3. Consul prüft den Controller alle 10 s über `/health` und wirft einen toten Eintrag nach 30 s aus dem Katalog; DNS-Antworten kommen mit TTL 0, kein Client cached den alten Standort.
4. Das CSI-Plugin kennt nur den Consul-Namen -- nach dem Failover zeigt schon die nächste DNS-Auflösung auf den neuen Node, Job und Config bleiben unangetastet ([Nomad CSI Plugin](./referenz.md#nomad-csi-plugin)).
5. Die Satellites aller drei Nodes verbinden sich selbständig neu zum aktiven Controller; Szenarien und Failover-Dauer: [Controller Failover](./betrieb.md#controller-failover).
6. Scheitert das Demote auf dem alten Node, erzwingt drbd-reactor einen Node-Reboot (`on-drbd-demote-failure reboot-force`) -- lieber ein harter Neustart als zwei Controller auf derselben Datenbank.

### Node-Ausfall und Heilung

**Leitfrage:** Was passiert mit laufenden Writes, wenn ein Storage-Node ausfällt -- und wie holt der zurückkehrende Node den Rückstand auf, ohne alles neu zu spiegeln?

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { style: { border-radius: 8 } }
  schreib: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  heilung: { style: { stroke: "#42714a"; font-color: "#42714a" } }
  quorum: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
}

c05: vm-nomad-client-05 (überlebt) {
  class: container
  label.near: top-center

  drbd: DRBD Primary { class: node }
  bitmap: Quick-Sync-Bitmap { class: data; tooltip: "markiert pro Datenblock, was der abwesende Peer verpasst" }
}

c06: vm-nomad-client-06 (fällt aus) {
  class: container
  label.near: top-center

  drbd: DRBD-Resource { class: node; tooltip: "nach der Rückkehr SyncTarget -- bleibt Inconsistent bis zum Ende des Resync" }
}

c04: vm-nomad-client-04 (TieBreaker) { class: node }

c05.drbd -> c06.drbd: "1. Replikations-Link reisst -- erkannt über die DRBD-Timeouts" { class: quorum; style.stroke-dash: 3 }
c05.drbd -> c04: "2. Quorum hält -- 2 von 3 Stimmen, I/O läuft weiter" { class: schreib }
c05.drbd -> c05.bitmap: "3. markiert jeden weiteren Write als out-of-sync" { class: schreib }
c06.drbd -> c05.drbd: "4. Rückkehr -- Reconnect und Abgleich der Daten-Generationen" { class: heilung; style.stroke-dash: 3 }
c05.drbd -> c06.drbd: "5. Resync nur der markierten Blöcke -- via Thunderbolt" { class: heilung; style.stroke-dash: 3 }
```

**Lesehilfe:**

1. Fällt ein Storage-Node aus, behält der Überlebende mit dem TieBreaker die Quorum-Mehrheit und schreibt weiter -- laufende Allocs merken davon nichts. Die Timing-Toleranzen gegen Fehlalarme beschreibt [Performance Tuning](#performance-tuning).
2. Ab dem Abriss führt der Primary in der Quick-Sync-Bitmap Buch, welche Blöcke der Abwesende verpasst -- die Grundlage dafür, dass die Heilung ein partieller Resync ist und keine Voll-Spiegelung.
3. Kehrt der Node zurück, vergleichen beide ihre Daten-Generationen: Der Rückkehrer wird SyncTarget und erhält nur die markierten Blöcke. Bis der Resync durch ist, bleibt er Inconsistent -- die I/O läuft derweil ununterbrochen auf dem Primary.
4. Verliert ein Node selbst die Mehrheit (isoliert, 1 von 3 Stimmen), suspendiert DRBD dort die I/O (`on-no-quorum suspend-io`) statt weiterzuschreiben -- bei einer Netzwerk-Partition gewinnt die Seite, die client-04 noch sieht. Genau das verhindert den Split-Brain; versagt der Mechanismus doch: [Split-Brain Recovery Runbook](./split-brain-runbook.md).
5. Gegen schleichende Abweichungen (Bit-Rot) läuft wöchentlich ein sequenzielles `drbdadm verify` über alle replizierten Ressourcen ([Automatisierung](./betrieb.md#automatisierung)).

### Netzwerk und Connection Paths

| Netzwerk | Verwendung | Bandbreite |
|----------|------------|------------|
| 10.0.2.0/24 | Management, Nomad CSI, Quorum-Pfad zu client-04 | 1 Gbit |
| 10.99.1.0/24 | DRBD Replikation | ~20 Gbit (Thunderbolt) |

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

Damit der Controller-Failover ohne Anpassung des CSI-Plugins funktioniert, wird Consul Service Discovery genutzt -- den Ablauf zeigt [Controller-Failover und CSI](#controller-failover-und-csi). Die DNS-TTL für den Service `linstor-controller` ist auf allen drei Consul-Servern explizit auf `0s` gesetzt (`dns_config.service_ttl` in `/etc/consul.d/linstor-ttl.hcl`, verteilt über `scripts/update_consul_ttl.sh` im infra-Repository). Kein Client cached damit einen alten Controller-Standort.

**Komponenten:**
- **Registration Script:** `/usr/local/bin/linstor-consul-register.sh` -- registriert `linstor-controller` (Port 3370) mit HTTP-Health-Check auf `/health` (Intervall 10 s, Deregistrierung nach 30 s critical)
- **Systemd Service:** `linstor-consul-register.service` (`Requires`/`After` auf `linstor-controller.service`, ohne `WantedBy` -- wird ausschliesslich von drbd-reactor gestartet)
- **DRBD Reactor:** Startet den Registration-Service als letztes Glied der Promoter-Kette

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
