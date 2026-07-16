---
title: CheckMK Discovery-Policy
description: Service-Klassifikation pro Host-Typ und Discovery-Filter (ignored_services-Rules), damit der CheckMK-Free-Tier-Limit von 750 Services nicht durch Bloat erreicht wird
tags:
  - monitoring
  - checkmk
  - discovery
  - policy
---

# CheckMK Discovery-Policy

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
- `^Postfix` -- kein vollwertiger MTA im Cluster: auf den Proxmox-Hosts, dem PBS und dem CheckMK-Host läuft Postfix ausschliesslich als loopback-only Satellite-Relay (`inet_interfaces = loopback-only`, Weiterleitung an `smtp.service.consul`), auf allen übrigen Hosts gar nicht -- der Check bringt keinen Alert-Wert
- `Number of threads`, `Kernel Performance`, `TCP Connections` -- für die meisten Service-VMs ohne Alert-Wert
- `Docker disk usage - buildcache/containers/volumes` -- doppelt durch `df` auf `/var/lib/docker`
- `vault-unseal`-Service -- `Type=oneshot` mit `RemainAfterExit=yes`: die Unit ist enabled und unsealed Vault beim Boot automatisch (Token-on-Disk, Memory `reference_vault_unseal_token_on_disk`), sie ist danach dauerhaft `active (exited)`. Ein Systemd-Service-Check bildet einen solchen Einmal-Job nicht sinnvoll ab

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
- `^Postfix` -- nur loopback-only Satellite-Relay auf Proxmox-Hosts, PBS und CheckMK, kein MTA mit Alert-Wert
- `^NTP Time$` -- Single-Source via Systemd-Timesyncd
- `^Interface [0-9]+$` -- alle numerischen SNMP-Interfaces (greift auf PVE und SNMP-Devices)

## 3. Host-spezifische Schwellwert- und Ausnahme-Regeln

Über die Discovery-Filter hinaus weichen einzelne Checks bewusst von den CheckMK-Defaults ab. Die konkreten WATO-Rules (IDs, Folder, Match-Order) sind in Setup authoritativ -- hier steht nur, welche Regel warum existiert.

- **Proxmox-VM-Memory-Check deaktiviert wo Gast-Agent** -- Der `proxmox_ve`-Special-Agent liefert pro Gast einen `Proxmox VE Memory Usage`-Check aus Hypervisor-Sicht. Für jeden Gast, der einen eigenen Agent-`Memory`-Check trägt, ist dieser Special-Agent-Check per `ignored_services` deaktiviert (checkmk, vm-traefik-01/02, datacenter-manager sowie homeassistant über seinen Ersatzcheck). Die Gast-Innensicht ist die autoritative Memory-Quelle, der Hypervisor-Wert nur Fallback für noch agentenlose Gäste -- Begründung (Ballooning, QEMU-Overhead) in [Monitoring: Strategie](../coverage/strategie.md#_5-trade-off-analyse-und-risiken). Die `pbs-backup-server`-Ausnahme läuft über eine eigene, ältere Rule und bleibt unberührt. Auf Host-Ebene (pve00/01/02) bleibt der Proxmox-Memory-Check als Allokations-Wächter mit nahe-100%-Schwelle aktiv
- **Systemd Timesyncd -- `last_ntp_message` entschärft** -- Der behaltene `Systemd Timesyncd`-Check ist die Zeitsync-Quelle (der separate `NTP Time`-Service ist als Duplikat ausgeschlossen, siehe oben). Eine globale Rule hebt die `last_ntp_message`-Schwelle auf 90 min (WARN) / 180 min (CRIT), weil `systemd-timesyncd` das Poll-Intervall bei stabilem Takt über eine Stunde dehnt und die Default-Schwelle (1 h / 2 h) reine Artefakt-Alerts bei perfektem Offset erzeugte. Der Offset selbst bleibt auf Default und ist damit der scharfe Drift-Indikator
- **synology-nas -- CPU-Schwellen für Wartungsfenster** -- Zwei host-spezifische Rules heben die CPU-Schwellen der `synology-nas` an: `CPU load` auf 6.0 / 10.0 pro Core und `CPU utilization` auf 95% / 98% über einen 15-Minuten-Schnitt. Grund sind die nächtlichen Backup- und Scrub-Spitzen (ca. 02:15--05:15), die knapp über den Defaults liegen und selbstheilend sind. Die Rules stehen am Ordner-Anfang (First-Match vor der globalen Regel)
- **checkmk-VM -- Swap-Wacht** -- Der Agent-`Memory`-Check bringt per Default keine Swap-Schwelle mit. Nur für den Host `checkmk` überwacht eine `levels_swap`-Rule die Swap-Auslastung (WARN 70% / CRIT 85%), weil die CheckMK-VM knapp dimensioniert ist und der Swap-Druck sonst unsichtbar bliebe

## 4. Pflege-Konvention

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

- [Monitoring: Strategie](../coverage/strategie.md) -- Stack-Aufgabenteilung CheckMK vs Telegraf vs Loki vs Uptime-Kuma
- [Monitoring: Coverage](../coverage/index.md) -- Item-SSOT mit allen Coverage-Klassen
- [Monitoring: Keep](../keep/index.md) -- Severity-Mapping CheckMK → Keep
