---
title: "Monitoring: CheckMK Discovery-Policy"
description: Service-Klassifikation pro Host-Typ und Discovery-Filter (ignored_services-Rules), damit der CheckMK-Free-Tier-Limit von 750 Services nicht durch Bloat erreicht wird
tags:
  - monitoring
  - checkmk
  - discovery
  - policy
---

# Monitoring: CheckMK Discovery-Policy

Diese Seite hält fest, welche Service-Klassen pro Host-Typ in CheckMK aktiv überwacht werden und welche Klassen bewusst per `ignored_services`-Rule aus der Discovery ausgeschlossen sind. Quelle: Bloat-Audit 2026-05-02 nach erstmaliger Annäherung an die Free-Tier-Grenze.

::: info SSOT
Pattern und Begründung pro Service-Klasse stehen hier. Live-Stand der konkreten Rules (mit IDs, Folder, Match-Order) liegt in CheckMK WATO unter Setup → Services → Disabled services. Die WATO-Rules sind authoritativ -- diese Seite erklärt das Konzept.
:::

::: warning Architektur-Limitation: Free-Tier 750-Service-Limit
CheckMK CCE Free-Tier limitiert auf 750 monitored Services pro Site. Bei Überschreitung blockiert «Activate changes» und `cmk -U` failt mit «Trial period ended». Das macht Discovery-Bloat zu einem operativen Risiko, nicht nur zu einer Aufräumaufgabe. Solange Single-Site-Architektur, müssen sd*-/md*-Disk-IO-Inflation und veth/tap-SNMP-Interfaces strukturell ausgeschlossen werden.
:::

## 1. Service-Klassifikation pro Host-Typ

### Synology NAS (SNMP V3, no-agent)

Behalten:

- `Disks Disk N`, `Disks Cache device N` -- Health-Status pro physischer Disk (Synology-Plugin)
- `Raid Volume X`, `Raid Storage Pool X` -- RAID-Zustand
- `Filesystem /volume*` -- Volume-Auslastung mit 95%-Schwelle (siehe Memory `feedback_nas_storage_threshold_95`)
- `Memory`, `CPU load`, `CPU utilization`, `Uptime`
- `Fan CPU`, `Fan System`
- `Update`, `Status`, `Info`, `SNMP Info`

Ausgeschlossen via `ignored_services`:

- `Disk IO sd*` und `Disk IO md*` -- UCD-DiskIO-Counter pro Block-Device und pro Partition. Health steht bereits in «Disks Disk N», IO-Counter ist Performance-Detail ohne Alert-Wert. Auf der früheren DS2419+ entstanden sonst 56+ redundante Services pro NAS, auf der DS1517+ 24+ -- die aktuelle DS1825+ (Homelab) liegt dazwischen
- `Disk IO loop*`, `Disk IO ram*`, `Disk IO dm-*`, `Disk IO nvme*`, `Disk IO sata*`, `Disk IO synoboot` -- interne Synology-Devices, kein operativer Wert
- `Filesystem /dev`, `/run`, `/sys`, `/proc`, `/tmp`, `/var`, `/etc` -- DSM-interne RAM-Filesystems
- `Filesystem /volume*/@*` -- Snapshot-Mount-Points (z.B. `/volume2/family/#snapshot`)
- `Filesystem /volumeUSB*` -- temporäre USB-Mounts

### Proxmox VE Nodes (Linux-Agent + `proxmox_ve` Special-Agent)

Behalten:

- `Proxmox VE Node`, `Proxmox VE Memory Usage` -- Special-Agent
- `PVE Cluster State` -- Quorum-Sicht
- `Filesystem /`, `Filesystem /var/lib/vz`, andere echte Mounts
- `CPU load`, `Memory`, `Uptime`
- `Systemd Service Summary`, `Systemd Socket Summary`
- `mk_smartmon` für NVMe (separater Plugin-Pfad)
- `zfsget` für ZFS-Pools (Standard-Plugin)
- Physische Interfaces (Bond-Members, eno*/ens*/bond*)

Ausgeschlossen via `ignored_services`:

- `Interface NN` (numerisch, alle SNMP-IF-MIB-Indizes) -- Bridge-Members, veth, tap, fwbr, fwln, tun -- entstehen je LXC/VM. Bei einem PVE-Host mit 12 LXC können das 30+ Interfaces sein. Pattern: `^Interface [0-9]+$`
- `Mount options of /etc/pve` -- pmxcfs-FUSE wechselt Optionen je nach Quorum-State, generiert Flapping
- `Mount options of /sys/firmware/efi/efivars` -- EFI-Mount, statisch
- `Filesystem /etc/pve` -- pmxcfs-FUSE, kein echter Speicher
- `Filesystem /sys/firmware/efi/efivars` -- EFI-Variablen-Mount
- `Temperature Zone N` -- ACPI-Zonen unzuverlässig auf Proxmox
- `NFS mount /mnt/pve/<storage>` falls die NFS-Quelle nicht überwacht werden soll

### Linux-VMs / LXC (Standard-Linux-Agent)

Behalten:

- `Check_MK`, `Check_MK Discovery` -- Self-Monitoring der Agent-Connection
- `CPU load`, `CPU utilization`, `Memory`, `Uptime`
- `Filesystem /`, `Filesystem /var`, andere echte Mounts
- `Disk IO SUMMARY` -- aggregierter IO-Counter (nicht pro Device)
- `Systemd Service Summary`, `Systemd Socket Summary`, `Systemd Timesyncd`
- `mk_apt`, `mk_logwatch`, `mk_docker` -- Standard-Plugins für Updates, Logs, Container

Ausgeschlossen via `ignored_services`:

- `Mount options of` -- generiert Flapping bei Remount, hat keinen Alert-Wert
- `NTP Time` -- Systemd-Timesyncd ist Single-Source, NTP-Pool-Detail-Service ist Duplikat
- `Temperature Zone N` -- VMs haben keine echten Sensoren
- `^Postfix` -- Postfix nicht aktiv im Cluster (Loopback-only)
- `Number of threads`, `Kernel Performance`, `TCP Connections` -- für die meisten Service-VMs ohne Alert-Wert
- `Docker disk usage - buildcache/containers/volumes` -- doppelt durch `df` auf `/var/lib/docker`
- `vault-unseal`-Service -- manueller Prozess nach Reboot, kein Alert-Wert (Memory `reference_vault_unseal_token_on_disk` -- Service ist absichtlich ManualStart)

### SNMP-Network-Devices (UDM Pro, UniFi Switches)

Behalten:

- `Interface eno*/eth*` -- physische Ports nach Auflösung des IF-MIB-Index
- `Status`, `Info`, `SNMP Info`
- Hersteller-spezifische Plugins (`unifi_*` ab CheckMK 2.3)
- `CPU load`, `Memory`, `Uptime`

Ausgeschlossen via `ignored_services`:

- `Interface NN` -- numerische IF-MIB-Indizes ohne Hersteller-Auflösung. Zu unspezifisch, redundant mit den symbolisch benannten Ports

## 2. Cross-Cutting Discovery-Filter

Diese Pattern-Filter greifen auf alle Hosts (host_name leer in der Rule):

- `^Mount options of` -- generiert Flapping bei Remount
- `^Temperature Zone` (auf VM-Hosts) -- keine echten Sensoren
- `^Postfix` -- nicht aktiv im Cluster
- `^NTP Time$` -- Single-Source via Systemd-Timesyncd
- `^Interface [0-9]+$` -- alle numerischen SNMP-Interfaces (greift auf PVE und SNMP-Devices)

## 3. Pflege-Konvention

Bei jedem neuen Host oder Plugin-Aktivierung:

1. Discovery-Run auf den Host ausführen (WATO oder Bulk-Discovery)
2. Service-Liste prüfen -- gibt es Klassen, die nicht zur Host-Typ-Klassifikation oben passen?
3. Wenn ja: Pattern in eine bestehende `ignored_services`-Rule aufnehmen, sonst neue Rule mit aussagekräftiger Description
4. Rule-Description-Konvention: «\<Host-Typ\> \<Service-Klasse\> trim YYYY-MM-DD: \<Begründung in einem Satz\>»
5. Activate Changes ausführen, Naemon-Service-Count vor/nach prüfen

Bei Approach an die 750er-Grenze:

1. Top-Hosts identifizieren (Service-Count pro Host absteigend)
2. Pro Top-Host die Service-Verteilung pro Klasse prüfen (Klassifikation oben anwenden)
3. Bloat-Klasse via Pattern-Rule ausschliessen, **nicht** durch Host-Löschen
4. Wenn alles relevant ist: Edition-Upgrade auf CCE-Premium nötig (kein Free-Tier-Pfad mehr)

## Verwandte Seiten

- [Monitoring: Strategie](strategie.md) -- Stack-Aufgabenteilung CheckMK vs Telegraf vs Loki vs Uptime-Kuma
- [Monitoring: Coverage](coverage.md) -- Item-SSOT mit allen Coverage-Klassen
- [Monitoring: Keep](keep.md) -- Severity-Mapping CheckMK → Keep
