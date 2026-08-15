---
title: System-Updates (VMs und Hypervisor)
description: Konsolidierte Ansible-Playbooks für apt-Updates auf Linux-VMs und Proxmox-Hypervisor mit Pre-Update-Snapshots, HA-Maintenance und Quorum-Schutz, dazu die needrestart-Policy für die täglichen unattended-upgrades
tags:
  - querschnitt
  - ansible
  - proxmox
  - updates
  - maintenance
---

# System-Updates (VMs und Hypervisor)

Zwei Ansible-Playbooks decken die laufenden System-Updates im Homelab ab:

- `vm-system-update-consolidated.yml` patcht die Linux-VMs (Nomad-Server, Nomad-Worker, Infrastructure-VMs) inkl. Pre-Update-qm-Snapshot pro VM und Reboot-Handling.
- `pve-system-update.yml` patcht die Proxmox-Hypervisor (pve00, pve01, pve02) selbst -- Rolling, mit ZFS-Snapshot vom Root-Dataset, HA-Maintenance-Mode und Cluster-Health-Verifikation vor und nach jedem Reboot.

Beide Playbooks liegen unter `infra/homelab-hashicorp-stack/ansible/playbooks/` im Homelab-Repo. Inventory: `infra/homelab-hashicorp-stack/ansible/inventory/hosts.yml`.

Unabhängig von diesen beiden gesteuerten Läufen zieht jede Ubuntu-VM täglich selbständig Sicherheitsupdates über `unattended-upgrades` (systemd-Timer `apt-daily-upgrade`). Welche Dienste dabei automatisch neu starten dürfen, regelt die needrestart-Policy weiter unten.

## VM-Update-Playbook

### Welche VMs werden erfasst

Die Hostgroups `nomad_servers`, `nomad_workers`, `infrastructure` und `applications` werden vom Playbook gepatched. `manual_updates` (homeassistant) ist explizit ausgeschlossen -- HAOS hat ein eigenes Update-Schema via Web-UI.

### Ablauf pro VM

1. **Discovery (Phase 0):** Das Playbook fragt alle drei pve-Nodes via SSH ab und baut eine VM-zu-Node-Map. Migrationsresistent: VMs werden auf dem aktuellen Node gefunden, nicht auf dem im Inventory hinterlegten Fallback.
2. **Update-Check pro VM:** apt im check_mode -- nur VMs mit verfügbaren Updates werden weiter prozessiert.
3. **Pre-Update-Snapshot:** `qm snapshot <vm-id> pre-update-<timestamp>` auf dem korrekten Hypervisor-Node.
4. **Update:** apt upgrade aller Pakete inkl. Kernel.
5. **Reboot wenn nötig:** Via `/var/run/reboot-required`.
6. **Post-Update-Cleanup:** apt autoremove, alte Logs, optional Snapshot-Retention.

### Smart-Shutdown-Integration

Auf Nomad-Workers greift bei jedem Reboot der [Smart Shutdown](smart-shutdown.md) Mechanismus: nomad node drain, DRBD-Evict, CSI-Mount-Wait laufen automatisch via `ExecStop`-Drop-in auf `nomad.service`. Das Update-Playbook braucht deshalb keinen expliziten Drain-Block.

## Dienst-Neustarts nach Paket-Updates (needrestart)

Nach jedem apt-Lauf prüft needrestart, welche laufenden Dienste noch alte Bibliotheken im Speicher halten, und startet sie neu. Auf den beiden Storage-Nodes vm-nomad-client-05 und -06 ist dieses Verhalten vollständig festgelegt: Restart-Modus `a` (automatisch, ohne Rückfrage) plus die Blacklist der DRBD-/LINSTOR-Dienstkette.

### Warum überhaupt konfiguriert

Der Distro-Default ist `i` (interaktiv). Aus `apt-daily-upgrade` heraus wartet dieser Prompt aber auf niemanden -- der Prozess hält dann die apt-Locks, und der Host bekommt keine Sicherheitsupdates mehr. Im DCLab ist genau das am 29.07.2026 passiert und blieb 16 Tage lang unbemerkt.

Der zweite, weniger offensichtliche Punkt: "nicht konfiguriert" heisst auf Ubuntu nicht "es passiert nichts". Ohne gesetzten Restart-Modus fällt needrestart in den Ubuntu-Modus und startet betroffene Dienste im nicht-interaktiven Kontext ohnehin automatisch durch -- nur ohne Schutzliste. Der Ausfall vom 28.07.2026 war genau das: needrestart stoppte nach einem libc6-Upgrade den drbd-reactor auf vm-nomad-client-05, ohne ihn wieder zu starten, und der LINSTOR-Controller fehlte drei Stunden.

Der explizite Modus `a` ersetzt also kein harmloses Verhalten, sondern macht ein bereits bestehendes berechenbar.

### Welche Dienste geschützt sind

Auf den Nomad-Workern steht `nomad.service` auf der Blacklist -- ein Restart würde die Allocations des Nodes wegwerfen. Auf den beiden Storage-Nodes kommt die vollständige Promoter-Kette dazu: drbd-reactor, `drbd-promote@*` sowie linstor-controller, -satellite, -unlock und -consul-register. Die Kette hängt zusammen; ein Fremd-Restart einzelner Glieder bricht sie, und wenn eine Unit der Sammel-Transaktion nicht starten kann, blockiert der gesamte systemctl-Aufruf samt apt-Lock.

Auf den Nomad-Servern schützt eine eigene Blacklist `vault.service`. Ein Vault-Restart lässt den Node versiegelt zurück: `vault-unseal.service` ist `Type=oneshot` mit `RemainAfterExit` und läuft nach einem Paket-Restart nicht nach. Beim regulären VM-Boot dagegen läuft die Kette vollständig durch.

Ist-Zustand ausserhalb der Storage-Nodes: Dort ist nur die jeweilige Dienst-Blacklist gesetzt, kein expliziter Restart-Modus -- es gilt also weiterhin der Ubuntu-Modus.

::: warning Geblacklistete Dienste bleiben auf alten Bibliotheken
Ein geschützter Dienst läuft nach einem Bibliotheks-Update so lange mit der alten Bibliothek weiter, bis die VM neu startet. Die Blacklist verhindert den Neustart also nicht, sie verschiebt ihn ins geplante Wartungsfenster. Für alle übrigen Dienste wirkt der Patch sofort.
:::

### Gestaffelte Patch-Fenster der Storage-Nodes

Der Vendor-Default für `apt-daily-upgrade` ist 06:00 mit 60 Minuten Streuung -- damit hätte der Zufall entschieden, ob die beiden Hälften derselben DRBD-Redundanz gleichzeitig patchen. Für die Storage-Nodes gilt deshalb ein fester Versatz: vm-nomad-client-05 um 04:00, vm-nomad-client-06 um 05:30, je mit 15 Minuten Streuung. Im schlechtesten Fall bleiben damit 75 Minuten Abstand.

### Wo es im Code steht

Rolle `ansible/roles/needrestart`, ausgerollt mit `playbooks/deploy-needrestart.yml`. Sie setzt nur den Restart-Modus; die Dienst-Blacklists bleiben bei den Rollen, zu denen sie gehören: `roles/drbd-reactor` liefert die DRBD-/LINSTOR-Kette, `roles/nomad` die Nomad-Zeile. needrestart summiert die Einträge aller Dateien in `conf.d`. Die gestaffelten Patch-Fenster stehen als Gruppen-Variable in `ansible/inventory/group_vars/drbd_storage.yml`.

Auf den Hosts landet die Policy als `/etc/needrestart/conf.d/zz-restart-auto.conf`. Der `zz-`-Präfix ist nötig, weil needrestart die Dateien in `conf.d` alphabetisch lädt und die ältere `nomad.conf` die Blacklist zuweist statt sie zu ergänzen -- eine früher geladene Zuweisung würde spätere Einträge sonst verwerfen. Der Nomad-Sonderfall ist unter [Smart Shutdown](smart-shutdown.md) beschrieben.

Ob die Policy auf einem Host greift, zeigt `needrestart -m u -b -r l`: Es meldet dann `Disabling Ubuntu mode, explicit restart mode configured`. `-m u` entspricht dem Aufruf des apt-Hooks, `-b` und `-r l` halten den Lauf im reinen Lesemodus.

## PVE-Hypervisor-Update-Playbook

### Cluster-Topologie Homelab

Der Homelab pve-Cluster `Proxmox-Rack-01` hat drei Nodes (pve00, pve01, pve02). Quorum 2 von 3 -- der Reboot eines Nodes ist quorumfähig.

### Sicherheits-Mechanismen vor jedem pve-Reboot

- **Sanity-Check:** Mindestens zwei pve-Nodes müssen im Play sein. `--limit pve01` wird hart abgelehnt, weil HA-Maintenance einen delegate-Ziel-Node braucht.
- **pvecm + ha-manager + ZFS-Pool-Health Pre-Flight:** alle drei müssen quorumfähig / armed / healthy sein.

### Ablauf pro pve-Node

Das Playbook läuft mit `serial: 1` -- immer nur ein Node gleichzeitig:

1. **Backup:** /etc/pve als gzip-Tarball auf dem Node selbst, plus ZFS-Snapshot von `rpool/ROOT/pve-1`.
2. **HA-Maintenance enable:** Setzt den aktuellen Node in Maintenance-Mode -- HA-managed VMs migrieren auf einen der anderen Nodes.
3. **Wait for HA migration:** Pollt `pvesh get /cluster/ha/resources` bis kein Service mit `state=started` mehr auf diesem Node liegt.
4. **apt dist-upgrade non-interactive:** Mit `DEBIAN_FRONTEND=noninteractive`, `dpkg_options: 'force-confdef,force-confold'` und `NEEDRESTART_MODE=a`. Kein interaktiver Prompt blockiert das Playbook.
5. **Reboot wenn nötig.**
6. **Wait for pvecm Quorum nach Reboot.**
7. **Verify pve-cluster, pveproxy, pvedaemon, corosync.**
8. **Aktiv warten bis ha-manager keine Services mehr in Transition-State (migrate, request_stop, fence, error) hat** -- ersetzt früheres statisches `pause: 30`.

Der ganze Flow ab HA-Maintenance ist in einem `block/rescue/always`-Pattern eingewickelt:

- **Block:** der normale Update-Fluss
- **Rescue:** bei Failure wird eine Diagnose-Meldung mit Recovery-Hinweisen ausgegeben (Prüfbefehle, Rollback-Pfad, Backup-Pfad)
- **Always:** `node-maintenance disable` wird in jedem Fall versucht (idempotent, ignoriert eigene Fehler) -- so bleibt nie ein Node im Wartungs-Mode hängen wenn das Playbook abbricht

## Rollback-Pfade

- **Pro VM:** `qm rollback <vmid> pre-update-<timestamp>` auf dem Hypervisor wo die VM liegt. Snapshot-Name wird im Playbook-Output und in der Snapshot-Description festgehalten.
- **Pro pve-Node:** `zfs rollback rpool/ROOT/pve-1@pve-pre-update-<timestamp> && reboot`. Achtung: ZFS-Rollback löscht alle neueren Snapshots auf dem Dataset.
- **/etc/pve Recovery:** Tarball liegt unter `/root/pve-etc-<timestamp>.tar.gz` auf dem Node selbst.

## Verwandte Seiten

- [Smart Shutdown](smart-shutdown.md) -- graceful Drain bei VM-Reboots
- [Cluster Restart](cluster-restart.md) -- Vollständiger Cluster-Restart
- [Linstor Storage](../storage/linstor/index.md) -- DRBD-Replikation und Storage-Backend
