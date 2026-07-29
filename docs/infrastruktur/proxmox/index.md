---
title: Proxmox
description: Proxmox VE Cluster mit drei Knoten, VM-Übersicht, HA-Konfiguration und Datacenter Manager
tags:
  - proxmox
  - virtualisierung
  - cluster
  - ha
---

# Proxmox

## Übersicht

Drei-Knoten-Proxmox-Cluster am Standort Lenzburg (Corosync-Clustername `Proxmox-Rack-01`, in PDM und Wiki als `lenzburg` geführt) als Virtualisierungsplattform für alle Homelab-VMs und LXCs.

| Attribut | Wert |
|----------|------|
| Deployment | Bare-metal (3 Knoten: pve00, pve01, pve02) |
| HA-Modus | HA-Manager, shutdown_policy `conditional` |
| Migration-Netzwerk | 10.99.1.0/24 (Thunderbolt) |
| IPs | [Hosts und IPs](../../_referenz/hosts-und-ips.md) |

## Cluster-Knoten und VMs

Der Cluster besteht aus drei Knoten (pve00 als Quorum/VM-Host, pve01 und pve02 als Compute-Nodes). Alle Nodes sind über das Management-Netzwerk (10.0.2.0/24) erreichbar; auch der Corosync-Ring läuft ausschliesslich über dieses Netz (ein einziger Ring, kein zweiter). SSH-Zugang erfolgt als `root` auf den jeweiligen Management-IPs.

Vollständige Knoten-, VM- und LXC-Liste mit IPs, VM-IDs und Host-Zuordnung: [Hosts und IPs](../../_referenz/hosts-und-ips.md#proxmox-cluster). Physische Hardware-Specs (CPU, RAM, Storage): [Hardware-Inventar](../../_referenz/hardware-inventar.md).

## Externe / Standalone-Nodes

Neben dem Lenzburg-Cluster gibt es zwei eigenständige Proxmox-Nodes an anderen Standorten. Sie sind **kein Cluster-Mitglied** (kein Quorum, kein HA, kein DRBD), nutzen lokale ZFS-Disks und sind via Tailscale ins Homelab eingebunden. Verwaltet werden sie zentral über den [Datacenter Manager](./referenz.md#datacenter-manager-pdm), der gemeinsame PBS ist als Backup-Ziel eingebunden.

| Node | Standort | Netz | Rolle |
| :--- | :--- | :--- | :--- |
| pve-01-nana | Dottikon | 192.168.2.0/23 | Externer Watchdog (Subnet-Router 192.168.2.0/23), hostet homeassistant-dottikon |
| pve-lu-01 | Luzern | 172.16.0.0/24 | Standalone-Node (Subnet-Router 172.16.0.0/24), hostet homeassistant-luzern |

IPs, DNS und Details: [Hosts und IPs -- Externe Plattformen](../../_referenz/hosts-und-ips.md#externe-plattformen). Hardware: [Hardware-Inventar -- Externe Nodes](../../_referenz/hardware-inventar.md#externe-nodes). Betrieb (Wartung, Migration): [Betrieb -- Externe Standalone-Nodes](./betrieb.md#externe-standalone-nodes).

### Standort-Topologie

Lese-Konvention für beide Diagramme dieser Seite: Der Pfeil zeigt vom Initiator zum Ziel, das Label nennt Schritt und Inhalt. Durchgezogene Kanten gehören zur Schrittkette des jeweiligen Szenarios, gestrichelte sind Dauer- oder Hintergrundverkehr. Farben kodieren die Wege: Violett die Verwaltung (PDM), Blau die geplante Datenbewegung (Backup-Push, Live-Migration), Ocker die Reaktion auf einen Ausfall, Grau der Cluster-Hintergrund.

**Leitfrage:** Wer initiiert Verwaltung und Backups zwischen den Standorten -- und warum sichert sich der Backup-Server nicht über sich selbst?

```d2
classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { style: { border-radius: 8 } }
  verwaltung: { style: { stroke: "#7c3aed"; font-color: "#7c3aed" } }
  backup: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
}

lenzburg: Standort Lenzburg {
  class: container
  label.near: top-center
  tooltip: "Hauptstandort, 10.0.0.0/22"

  cluster: PVE-Cluster (pve00, pve01, pve02) {
    class: node
    tooltip: "Corosync-Cluster Proxmox-Rack-01 -- IPs siehe Hosts und IPs"
  }
  pbs: PBS { class: node; tooltip: "10.0.2.50 -- VM 99999, läuft als HA-VM auf dem Cluster selbst" }
  pdm: PDM { class: node; tooltip: "10.0.2.60 -- VM 99998, zentrale Verwaltung aller Proxmox-Instanzen" }
  nas: Synology-NAS (NFS) { class: data; tooltip: "vm-backup-Share -- Ziel für das vzdump der PBS-VM" }
}

dottikon: Standort Dottikon {
  class: container
  label.near: top-center
  tooltip: "192.168.2.0/23"
  nana: pve-01-nana { class: node; tooltip: "192.168.2.41 | TS 100.81.116.122" }
}

luzern: Standort Luzern {
  class: container
  label.near: top-center
  tooltip: "172.16.0.0/24"
  pvelu: pve-lu-01 { class: node; tooltip: "172.16.0.200 | TS 100.112.213.18" }
}

lenzburg.pdm -> lenzburg.cluster: "API-Polls mit Token -- Remote lenzburg" { class: verwaltung; style.stroke-dash: 3 }
lenzburg.pdm -> lenzburg.pbs: "API-Polls mit Token -- Remote pbs" { class: verwaltung; style.stroke-dash: 3 }
lenzburg.pdm -> dottikon.nana: "Remote pve-01-nana -- via Tailscale-Peer-IP" { class: verwaltung; style.stroke-dash: 3 }
lenzburg.pdm -> luzern.pvelu: "Remote pve-lu-01 -- via Tailscale-Peer-IP" { class: verwaltung; style.stroke-dash: 3 }
lenzburg.cluster -> lenzburg.pbs: "vzdump-Push 02:00 und 03:00 -- alle Gäste ausser der PBS-VM" { class: backup }
lenzburg.cluster -> lenzburg.nas: "vzdump-Push 20:00 -- nur die PBS-VM als Voll-Archiv" { class: backup }
```

**Lesehilfe:**

1. Verwaltung ist immer PDM-initiiert: API-Polls mit eigenem Token pro Remote ([Datacenter Manager](./referenz.md#datacenter-manager-pdm)), vier Remotes lenzburg, pbs, pve-01-nana und pve-lu-01 ([Konfigurierte Remotes](./referenz.md#konfigurierte-remotes)).
2. Die externen Nodes erreicht PDM bewusst nur über die Tailscale-Peer-IPs, ohne `accept-routes` ([PDM erreicht externe Remotes nur via Tailscale](./betrieb.md#externe-standalone-nodes)).
3. Backups initiiert der jeweilige PVE-Host per vzdump-Push zum PBS -- nachts gestaffelt um 02:00 und 03:00, damit nicht alle Gäste gleichzeitig snapshotten ([Backup](../../storage/backup/)).
4. Die PBS-VM läuft selbst als HA-VM auf dem Cluster und sichert sich nicht über den eigenen Datastore: Sie geht um 20:00 als klassisches vzdump-Archiv auf die Synology-NFS. Die PBS-VM lässt sich damit auch dann wiederherstellen, wenn der PBS selbst weg ist.
5. Auf den externen Standalone-Nodes ist derselbe PBS-Datastore als Backup-Ziel definiert (PBS-Storage lokal auf der Node), aktuelle Sicherungen der externen Gäste enthält der Datastore aber keine -- Ist-Zustand und Betrieb: [Externe Standalone-Nodes](./betrieb.md#externe-standalone-nodes).
6. Fällt der Standort Lenzburg aus, laufen die Standalone-Nodes autonom weiter (kein Quorum-Bezug) -- sie verlieren aber Verwaltung (PDM) und Backup-Ziel (PBS).

::: info Zwei Sichten auf die Standorte
Diese Map zeigt die **Verwaltungs- und Backup-Sicht** (PDM verwaltet, PBS sichert). Die **Netz- und
Tailscale-Sicht** derselben Standorte (Gateways, Subnetze, Schlüssel-Devices als Gesamtmap) führt die
[Netzwerk-Übersicht](../../netz/netzwerk/#gesamtubersicht); Standort-Details die [Standorte](../../netz/netzwerk/standorte.md)-Seite.
:::

## Thunderbolt Netzwerk

Zwei Thunderbolt 4 Kabel verbinden pve01 und pve02 für High-Speed VM-Migration und DRBD-Replikation. Ein Linux Bond (`bond-tb`, active-backup) aggregiert beide TB-Interfaces und löst damit das Problem der nicht-deterministischen Interface-Benennung nach Reboots. Die Bridge `vmbr-tb` nutzt den Bond als einzigen Port. Bandbreite ca. 20 Gbps; IPs im Subnetz 10.99.1.0/24 siehe [Hosts und IPs](../../_referenz/hosts-und-ips.md#thunderbolt-netzwerk).

## HA Konfiguration

Der Proxmox-HA-Manager verwaltet vier Ressourcen mit definiertem Soll-Zustand:

- **vm:1000** (homeassistant) -- `started`
- **vm:2000** (checkmk) -- `started`
- **vm:99999** (pbs-backup-server) -- `started`
- **ct:100** -- `stopped`

Vier Mechanik-Bausteine bestimmen das Verhalten:

- **Fencing:** Watchdog-basiert über `softdog` (Kernel-Software-Watchdog, kein IPMI), gesteuert vom CRM-Watchdog.
- **shutdown_policy:** `conditional` -- geplantes Herunterfahren migriert die HA-VMs vorab statt sie neu zu starten.
- **Migration:** `secure` (SSH-verschlüsselt) über 10.99.1.0/24 (Thunderbolt Bridge).
- **Storage-Replikation:** `pvesr`-Jobs replizieren die Disks der HA-Gäste zwischen den Compute-Nodes (Konfiguration in `/etc/pve/replication.cfg` auf dem Cluster) -- die Voraussetzung dafür, dass HA mit lokalem ZFS überhaupt funktioniert.

**Leitfrage:** Woher weiss der Cluster, dass ein ausgefallener Node wirklich tot ist -- und mit welchem Disk-Stand startet eine HA-VM auf dem anderen Node, obwohl ihre Disk lokal liegt?

```d2
direction: right

classes: {
  node: { style: { border-radius: 8 } }
  container: { style: { border-radius: 8; stroke-dash: 4 } }
  data: { style: { border-radius: 8 } }
  ausfall: { style: { stroke: "#8f6418"; font-color: "#8f6418" } }
  migration: { style: { stroke: "#3b6ea5"; font-color: "#3b6ea5" } }
  hintergrund: { style: { stroke: "#6b7280"; font-color: "#6b7280" } }
}

cluster: "PVE-Cluster -- Corosync über das Management-Netz, Quorum 2 von 3" {
  class: container
  label.near: top-center

  crm: HA-Manager (CRM) {
    class: node
    tooltip: "Master-Rolle wird über das Cluster gewählt und wandert -- entscheidet über Recovery und Migration"
  }

  pve02: "pve02 -- Beispiel: trägt die HA-VM" {
    class: container
    label.near: top-center

    lrm: LRM { class: node; tooltip: "Local Resource Manager -- führt CRM-Aufträge lokal aus" }
    wd: softdog-Watchdog { class: node; tooltip: "muss vom quoraten Node laufend bedient werden" }
    vm: HA-VM { class: node }
    zfs: rpool (ZFS) { class: data }
  }

  pve01: "pve01 -- Recovery-Ziel" {
    class: container
    label.near: top-center

    lrm: LRM { class: node }
    zfs: rpool (ZFS-Replika) { class: data }
  }

  pve00: "pve00 -- dritte Quorum-Stimme" {
    class: node
    tooltip: "kleinster Host -- stellt das Quorum, kein Replikations-Ziel der HA-VMs"
  }
}

cluster.pve02.zfs -> cluster.pve01.zfs: "A. pvesr-Replikation -- HA-VMs alle 15 min, PBS-VM alle 4 h" { class: hintergrund; style.stroke-dash: 3 }
cluster.pve02.wd -> cluster.pve02.vm: "1. Quorum verloren -- softdog resettet den Node nach rund 60 s" { class: ausfall }
cluster.crm -> cluster.pve01.lrm: "2. nach der Fencing-Frist -- Recovery-Auftrag für die HA-VM" { class: ausfall }
cluster.pve01.lrm -> cluster.pve01.zfs: "3. startet die VM auf dem Stand der letzten Replika" { class: ausfall }
cluster.crm -> cluster.pve02.lrm: "4. geplanter Shutdown -- Migrations-Auftrag statt Neustart" { class: migration }
cluster.pve02.lrm -> cluster.pve01.lrm: "5. Live-Migration -- RAM verschlüsselt über Thunderbolt, Disk-Basis ist die Replika" { class: migration }
```

**Lesehilfe:**

1. Corosync verbindet die drei Nodes über das Management-Netz; handeln darf nur, wer die Quorum-Mehrheit von 2 von 3 Stimmen sieht -- ohne Mehrheit blockieren alle Schreiboperationen ([Quorum-Pflicht](./betrieb.md#abhangigkeiten)).
2. Die HA-VMs liegen auf lokalem ZFS (`rpool`), nicht auf Shared Storage. HA-fähig macht sie erst die pvesr-Replikation auf den jeweils anderen Compute-Node -- homeassistant und checkmk alle 15 Minuten, die PBS-VM alle 4 Stunden.
3. Ungeplanter Ausfall: Der isolierte Node kann seinen softdog-Watchdog nicht mehr bedienen und resettet sich nach rund 60 s selbst (Self-Fencing). Erst nach Ablauf dieser Frist lässt der CRM die VM anderswo starten -- die Wartezeit ist der Beweis, dass die VM nirgends doppelt läuft.
4. Der Neustart erfolgt auf dem Stand der letzten Replika: Änderungen seit dem letzten Sync-Lauf gehen verloren. Das ist der bewusste Preis für HA ohne Shared Storage.
5. Geplanter Reboot: `shutdown_policy conditional` migriert die HA-VMs vorab live -- der RAM fliesst verschlüsselt (`migration: secure`) über das [Thunderbolt-Netz](#thunderbolt-netzwerk), als Disk-Basis dient die vorhandene Replika ([Automatisierung](./betrieb.md#automatisierung)).
6. `ct:100` zeigt die zweite Seite des Soll-Zustands: Der HA-Manager hält Ressourcen auch aktiv gestoppt.

## Storage

| Typ | Beschreibung |
|-----|--------------|
| Local ZFS (`rpool`) | Schneller Speicher für OS und VM-Disks auf jedem Node; die Disks der HA-Gäste repliziert `pvesr` auf den Partner-Node |
| NFS (Synology) | Geteilter Speicher für Backups und ISOs |
| PBS | Proxmox Backup Server (VM-ID 99999, HA-verwaltet) für inkrementelle Backups |
| Linstor/DRBD | Replizierter Block-Storage über Thunderbolt für CSI-Volumes (Nomad) |

## Referenz-Details

Die referenz-artigen Detail-Parameter und Tabellen sind in der [Proxmox Referenz](./referenz.md) ausgelagert:

- [iGPU Passthrough](./referenz.md#igpu-passthrough) -- PCI-Zuordnung, VFIO-Blacklist und VAAPI/QSV-Treiber
- [VM Disk-Konfiguration](./referenz.md#vm-disk-konfiguration) -- virtio-blk-Flags (aio, cache, discard, iothread)
- [ZFS Performance Tuning](./referenz.md#zfs-performance-tuning) -- ARC-Grösse und ZFS-Modulparameter
- [Authentifizierung (SSO)](./referenz.md#authentifizierung-sso) -- Authentik-OIDC-Felder und Web-Zugang
- [Datacenter Manager (PDM)](./referenz.md#datacenter-manager-pdm) -- Remotes, API-Token und Konfigurationsdateien

Die Umstellung einer VM-Disk von scsi auf virtio-blk als Betriebsprozedur: [Betrieb -- VM-Disk auf virtio-blk umstellen](./betrieb.md#vm-disk-auf-virtio-blk-umstellen).

## Verwandte Seiten

- [Referenz](./referenz.md) -- iGPU-Passthrough, VM-Disk-/ZFS-Tuning, SSO/OIDC-Felder und PDM-Konfiguration
- [Betrieb](./betrieb.md) -- HA-Prüfungen, Wartung, bekannte Probleme
- [Netzwerk](../../netz/netzwerk/) -- VLANs, Subnets, Hardware
- [Backup](../../storage/backup/) -- Backup-Strategie und PBS
- [Hardware-Inventar](../../_referenz/hardware-inventar.md) -- Physische Hardware-Details
- [Linstor Storage](../../storage/linstor/) -- DRBD-replizierter Block-Storage
- [Nomad](../../plattform/nomad/) -- Container-Orchestrierung auf den VMs
- [Consul](../../plattform/consul/) -- Service Discovery und KV Store
- [Vault](../../plattform/vault/) -- Secrets Management
