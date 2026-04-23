---
title: Kontrolliertes Herunterfahren
description: Smart Shutdown für Nomad-Clients mit Linstor/DRBD Storage
tags:
  - runbook
  - nomad
  - linstor
  - shutdown
---

# Kontrolliertes Herunterfahren (Nomad & Linstor)

Dieses Runbook beschreibt den unterbrechungsfreien Shutdown-Prozess für Nomad-Clients mit Linstor/DRBD Storage.

## Problemstellung

Beim Standard-Shutdown beendet systemd Dienste oft parallel. Wenn der Nomad-Agent oder das Netzwerk beendet werden, bevor die Storage-Volumes (DRBD/Linstor) ausgehängt sind, entstehen "Stale Locks" und Filesystem-Fehler (Read-Only). Das betrifft insbesondere die Client-Nodes 05 und 06, auf denen Linstor CSI Volumes für PostgreSQL, Grafana und Loki gemountet sind.

## Ablauf (v10.2)

```d2
direction: down

A: Shutdown/Reboot angefordert { style.border-radius: 8 }
B: "systemd stoppt nomad.service\nExecStop feuert nomad-smart-shutdown.sh" { style.border-radius: 8 }
G: "Guard prüft system-state" { style.border-radius: 8 }
C: "Nomad Node Drain\n(deadline 5m, ignore-system)" { style.border-radius: 8 }
D: "DRBD-Evict linstor_db\n(nur bei UpToDate-Peer, --delay 30)" { style.border-radius: 8 }
E: "Mount-Wait auf CSI-Volumes\n(max 60s)" { style.border-radius: 8 }
F: "systemd sendet SIGTERM an Nomad\nshutdown.target läuft weiter" { style.border-radius: 8 }
H: "Node offline -> Reboot" { style.border-radius: 8 }
I: "nomad-boot-enable.service\nSentinel-File-Check" { style.border-radius: 8 }
J: "nomad node eligibility -enable -self" { style.border-radius: 8 }
K: "Node nimmt wieder Allocations an" { style.border-radius: 8 }

A -> B -> G
G -> C: "stopping/shutdown/maintenance"
G -> F: "running (skip -- systemctl restart)"
C -> D -> E -> F -> H -> I -> J -> K
```

## Lösung (Version v10.2, Refactor 2026-04-23/24)

Die Shutdown-Orchestrierung läuft **nicht mehr** über eine separate `nomad-shutdown-drain.service` Unit (v9/v10.1 Design), sondern als `ExecStop`-Drop-in direkt auf `nomad.service`. Grund: Das separate-Unit-Design mit `Conflicts=shutdown.target` hat beim echten Reboot-Test auf client-04 nicht gefeuert (bekanntes systemd-Timing-Issue mit `DefaultDependencies=no`).

### 1. `nomad.service` Drop-in (`20-shutdown-drain.conf`)

Ergänzt `ExecStop=/usr/local/bin/nomad-smart-shutdown.sh stop`. Feuert zuverlässig bei jedem Nomad-Stop (restart, stop, reboot, halt, shutdown). Der Guard im Skript entscheidet per `systemctl is-system-running`:

- `stopping` / `shutdown` / `maintenance` → vollständige Drain-+-Evict-+-Mount-Wait-Sequenz
- `running` → Skip (unterdrückt unerwünschtes Drain bei `systemctl restart nomad` für Config-Reload)

Das Skript drain-t via `nomad node drain -enable -self -yes -deadline 5m -ignore-system`. System-Jobs (ZOT, Alloy, CSI-Plugin, filebrowser) laufen bis zum tatsächlichen Nomad-Stop weiter, damit Unmounts sauber gehen.

### 2. DRBD-Evict Preflight

`drbd-reactorctl evict --delay 30 linstor_db` läuft **nur**, wenn mindestens ein Peer `UpToDate` ist. Split-Brain-Schutz beim Cluster-weiten Shutdown. Ohne UpToDate-Peer wird der Evict übersprungen (Log-Eintrag `ERROR: No UpToDate peer`).

### 3. Mount-Wait-Loop

Nach Drain + Evict wartet das Skript bis zu 60 Sekunden, bis alle `linstor`/`drbd` Mounts unmounted sind. Schutz gegen [linstor-csi Issue #204](https://github.com/piraeusdatastore/linstor-csi/issues/204) (hängende Unmounts). Blockiert der Mount länger, wird `exit 1` geliefert und systemd reizt `TimeoutStopSec=360s` aus.

### 4. `nomad-boot-enable.service` (Boot-Restore)

Nach dem Hochfahren aktiviert diese Unit den Node wieder als schedulable:

- **Trigger:** `After=nomad.service Wants=nomad.service`, `WantedBy=multi-user.target`. Bewusst **kein** `PartOf=nomad.service` -- sonst würde jeder `systemctl restart nomad` die Unit erneut triggern (das war der Vorfall-Vektor am 22.04.2026).
- **EnvironmentFile:** `/etc/nomad-boot-enable/token.env` mit `-` Prefix (graceful fail bei fehlendem Token).
- **Sentinel-File:** `/var/lib/nomad/drain-manual` überspringt das Re-Enable, falls der Admin den Node bewusst gedraint hat und nur neu bootet.
- **Aktion:** `nomad node eligibility -enable -self` mit Retry-Loop (30 × 3 s).

### 5. `needrestart`-Blacklist

`/etc/needrestart/conf.d/nomad.conf` schützt gegen apt-daily-upgrade-Trigger: wenn libcap2/python3/systemd-Upgrades via daemon-reexec Units neu evaluieren, wird `nomad.service` nicht angefasst. Grund: genau diese Kaskade hat am 22.04.2026 den Ausfall ausgelöst.

## Deployment

Primärer Pfad: Ansible-Rolle `roles/nomad/tasks/smart_shutdown.yml` im `homelab-hashicorp-stack`-Submodule. Wird automatisch für Clients ausgeführt (`when: nomad_node_role == 'client'`). Files unter `roles/nomad/files/`:

- `nomad-smart-shutdown.sh` -- das Steuerungs-Skript
- `nomad-boot-enable.service` -- die Boot-Unit
- `nomad.service.d-20-shutdown-drain.conf` -- der ExecStop-Drop-in
- `needrestart-nomad.conf` -- die apt-Schutz-Config

Zusätzlich als manuelle Fallback-Installer: `scripts/install_smart_shutdown_v10_1.sh` (Haupt-Skript + client.hcl-Patch) und `scripts/install_smart_shutdown_v10_2.sh` (ExecStop-Drop-in-Patch).

## Logs prüfen

```
sudo tail -30 /var/log/nomad-shutdown.log
sudo journalctl -u nomad.service --boot=-1 | grep nomad-smart-shutdown
```

Beim echten Reboot sollte folgende Sequenz im Log erscheinen:

```
=== SHUTDOWN START (v10.2) [system-state=stopping] ===
Action: Initiating self-drain (deadline 5m, ignore system jobs)...
  [drain] Drain complete for node ...
SUCCESS: Drain complete.
Action: Evicting linstor_db (UpToDate peer available)...
  [evict] ...
Action: Waiting for CSI mounts to clear...
SUCCESS: All CSI volumes clean.
=== SHUTDOWN COMPLETE (v10.2) ===
```

Beim `systemctl restart nomad` dagegen nur:

```
SKIP: system-state='running' -- not a shutdown/reboot, skipping drain/evict.
```

## Admin-Workflow: Manuelle Wartung

Wenn ein Node für Wartung (Kernel-Upgrade, Hardware-Tausch) gedraint werden soll und der Drain über einen Reboot hinweg erhalten bleiben muss:

```bash
sudo touch /var/lib/nomad/drain-manual
nomad node drain -enable -self -yes
# ... Wartung, ggf. Reboots ...
sudo rm /var/lib/nomad/drain-manual
nomad node eligibility -enable -self
```

Solange die Sentinel-Datei existiert, setzt `nomad-boot-enable.service` die Eligibility nicht automatisch zurück.

## Verifikation nach Neustart

1. `nomad node status` -- Node ist `ready, eligible`
2. `drbdadm status` -- alle Ressourcen `UpToDate` (kein `Outdated`/`Inconsistent`)
3. `sudo systemctl is-active nomad-boot-enable.service` -- `active (exited)`
4. Services auf dem Node laufen wieder (alloc-Liste gegenchecken)

## Historische Iterationen

::: info Designs v9 → v10.2
- **v9** (bis 14.04.2026): kombinierte `nomad-smart-shutdown.service` mit `drain_on_shutdown` in `client.hcl`. Token hardcoded im Skript.
- **v10.0** (14.04.2026): Token in EnvironmentFile, Token-Check im Skript. Lücke: `nomad-boot-enable.service` hatte kein `EnvironmentFile=` -- Ausfall am 22.04.2026 durch apt-daily-upgrade → `daemon-reexec` → nomad restart → boot-enable-Fail ("NOMAD_TOKEN nicht gesetzt") → Node ineligible.
- **v10.1** (23.04.2026): `drain_on_shutdown` aus `client.hcl`, tgross-Pfad (`leave_on_interrupt=true + leave_on_terminate=false + KillSignal=SIGINT`). Scheiterte weil `drain_on_shutdown`-Flag das dominiert und bei jedem Agent-Stop Drain triggert. Verworfen.
- **v10.1b** (23.04.2026): Separate `nomad-shutdown-drain.service` mit `Conflicts=shutdown.target`. Reboot-Test auf client-04 (24.04.2026) zeigte: ExecStop feuerte nicht. systemd-Timing-Issue mit `DefaultDependencies=no`.
- **v10.2** (24.04.2026, aktueller Stand): ExecStop-Drop-in direkt auf `nomad.service`. Live-verifiziert im Reboot-Test. Ausgerollt auf allen Homelab- und DCLab-Clients.
:::

## Verwandte Seiten

- [Cluster-Neustart](./cluster-restart.md) -- Vollständiger Neustart des gesamten HashiCorp Stacks
- [Linstor/DRBD](../linstor-storage/index.md) -- Storage-Cluster und DRBD-Ressourcen
- [HashiCorp Stack](../nomad/index.md) -- Nomad Node Lifecycle und Drain-Konzept
- [Batch Jobs](./batch-jobs.md) -- Täglicher Reboot-Job der den Smart Shutdown nutzt
- [Nomad Betrieb](../nomad/betrieb.md) -- Automatisierung und Policies im Nomad-Cluster
