---
title: System-Updates (VMs und Hypervisor)
description: Konsolidierte Ansible-Playbooks fuer apt-Updates auf Linux-VMs und Proxmox-Hypervisor mit Pre-Update-Snapshots, HA-Maintenance und Quorum-Schutz
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

## VM-Update-Playbook

### Welche VMs werden erfasst

Die Hostgroups `nomad_servers`, `nomad_workers`, `infrastructure` und `applications` werden vom Playbook gepatched. `manual_updates` (homeassistant) ist explizit ausgeschlossen -- HAOS hat ein eigenes Update-Schema via Web-UI.

### Ablauf pro VM

1. **Discovery (Phase 0):** Das Playbook fragt alle drei pve-Nodes via SSH ab und baut eine VM-zu-Node-Map. Migrationsresistent: VMs werden auf dem aktuellen Node gefunden, nicht auf dem im Inventory hinterlegten Fallback.
2. **Update-Check pro VM:** apt im check_mode -- nur VMs mit verfuegbaren Updates werden weiter prozessiert.
3. **Pre-Update-Snapshot:** `qm snapshot <vm-id> pre-update-<timestamp>` auf dem korrekten Hypervisor-Node.
4. **Update:** apt upgrade aller Pakete inkl. Kernel.
5. **Reboot wenn noetig:** Via `/var/run/reboot-required`.
6. **Post-Update-Cleanup:** apt autoremove, alte Logs, optional Snapshot-Retention.

### Smart-Shutdown-Integration

Auf Nomad-Workers greift bei jedem Reboot der [Smart Shutdown](smart-shutdown.md) Mechanismus: nomad node drain, DRBD-Evict, CSI-Mount-Wait laufen automatisch via `ExecStop`-Drop-in auf `nomad.service`. Das Update-Playbook braucht deshalb keinen expliziten Drain-Block.

## PVE-Hypervisor-Update-Playbook

### Cluster-Topologie Homelab

Der Homelab pve-Cluster `Proxmox-Rack-01` hat drei Nodes (pve00, pve01, pve02). Quorum 2 von 3 -- der Reboot eines Nodes ist quorat-sicher.

### Sicherheits-Mechanismen vor jedem pve-Reboot

- **Sanity-Check:** Mindestens zwei pve-Nodes muessen im Play sein. `--limit pve01` wird hart abgelehnt, weil HA-Maintenance einen delegate-Ziel-Node braucht.
- **pvecm + ha-manager + ZFS-Pool-Health Pre-Flight:** alle drei muessen quorat / armed / healthy sein.

### Ablauf pro pve-Node

Das Playbook laeuft mit `serial: 1` -- immer nur ein Node gleichzeitig:

1. **Backup:** /etc/pve als gzip-Tarball auf dem Node selbst, plus ZFS-Snapshot von `rpool/ROOT/pve-1`.
2. **HA-Maintenance enable:** Setzt den aktuellen Node in Maintenance-Mode -- HA-managed VMs migrieren auf einen der anderen Nodes.
3. **Wait for HA migration:** Pollt `pvesh get /cluster/ha/resources` bis kein Service mit `state=started` mehr auf diesem Node liegt.
4. **apt dist-upgrade non-interactive:** Mit `DEBIAN_FRONTEND=noninteractive`, `dpkg_options: 'force-confdef,force-confold'` und `NEEDRESTART_MODE=a`. Kein interaktiver Prompt blockiert das Playbook.
5. **Reboot wenn noetig.**
6. **Wait for pvecm Quorum nach Reboot.**
7. **Verify pve-cluster, pveproxy, pvedaemon, corosync.**
8. **Aktiv warten bis ha-manager keine Services mehr in Transition-State (migrate, request_stop, fence, error) hat** -- ersetzt frueheres statisches `pause: 30`.

Der ganze Flow ab HA-Maintenance ist in einem `block/rescue/always`-Pattern eingewickelt:

- **Block:** der normale Update-Fluss
- **Rescue:** bei Failure wird eine Diagnose-Meldung mit Recovery-Hinweisen ausgegeben (Pruefbefehle, Rollback-Pfad, Backup-Pfad)
- **Always:** `node-maintenance disable` wird in jedem Fall versucht (idempotent, ignoriert eigene Fehler) -- so bleibt nie ein Node im Wartungs-Mode haengen wenn das Playbook abbricht

## Rollback-Pfade

- **Pro VM:** `qm rollback <vmid> pre-update-<timestamp>` auf dem Hypervisor wo die VM liegt. Snapshot-Name wird im Playbook-Output und in der Snapshot-Description festgehalten.
- **Pro pve-Node:** `zfs rollback rpool/ROOT/pve-1@pve-pre-update-<timestamp> && reboot`. Achtung: ZFS-Rollback loescht alle neueren Snapshots auf dem Dataset.
- **/etc/pve Recovery:** Tarball liegt unter `/root/pve-etc-<timestamp>.tar.gz` auf dem Node selbst.

## Verwandte Dokumentation

- [Smart Shutdown](smart-shutdown.md): graceful Drain bei VM-Reboots
- [Cluster Restart](cluster-restart.md): Vollstaendiger Cluster-Restart
- [Linstor Storage](../linstor-storage/index.md): DRBD-Replikation und Storage-Backend
