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

## Ablauf

```d2
direction: down

A: Shutdown/Reboot angefordert { style.border-radius: 8 }
B: nomad-shutdown-drain.service { style.border-radius: 8 }
C: Nomad Node Drain aktivieren (Allocations migrieren) { style.border-radius: 8 }
D: Warten bis Drain abgeschlossen { style.border-radius: 8 }
E: Linstor-Volumes werden ausgehängt { style.border-radius: 8 }
F: systemd fährt restliche Dienste herunter { style.border-radius: 8 }
G: Node offline { style.border-radius: 8 }
H: Node startet neu { style.border-radius: 8 }
I: nomad-boot-enable.service { style.border-radius: 8 }
J: Nomad Node Drain deaktivieren { style.border-radius: 8 }
K: Node nimmt wieder Allocations an { style.border-radius: 8 }

A -> B -> C -> D -> E -> F -> G -> H -> I -> J -> K
```

## Lösung (Version v9.0)

Die Lösung basiert auf zwei spezialisierten systemd-Units, die sich in den Shutdown- bzw. Boot-Prozess einhängen.

### 1. Nomad Shutdown Drain (`nomad-shutdown-drain.service`)

Diese Unit wird beim Shutdown/Reboot ausgeführt, solange Nomad und das Netzwerk noch aktiv sind. Sie aktiviert den Node Drain, der alle laufenden Allocations ordentlich beendet und auf andere Nodes migriert. Erst danach werden die Linstor-Volumes sicher ausgehängt.

- **Typ:** `oneshot`
- **Trigger:** `WantedBy=shutdown.target reboot.target halt.target`
- **Aktion:** `nomad node drain -enable -self -ignore-system`
- **Wichtig:** Die `-ignore-system` Flag sorgt dafür, dass System-Jobs (z.B. Zot Registry, Alloy) nicht gedrained werden -- sie laufen bis zum tatsächlichen Shutdown weiter

### 2. Nomad Boot Enable (`nomad-boot-enable.service`)

Nach dem Hochfahren wird der Drain automatisch wieder deaktiviert, damit der Node neue Allocations annimmt.

- **Typ:** `oneshot`
- **Trigger:** `After=nomad.service`
- **Aktion:** `nomad node drain -disable -self`

## Skript-Speicherort

Das zentrale Steuerungsskript liegt auf den Nomad-Client-Nodes unter `/usr/local/bin/nomad-smart-shutdown.sh`.

## Logs prüfen

Der Verlauf des letzten Shutdowns/Boots wird unter `/var/log/nomad-shutdown.log` protokolliert. Bei Problemen nach einem Neustart dort prüfen, ob der Drain korrekt durchlief und alle Volumes sauber ausgehängt wurden.

## Verifikation nach Neustart

1. Prüfen ob der Node als `ready` in Nomad erscheint (`nomad node status`)
2. Prüfen ob DRBD-Ressourcen synchron sind (kein `Outdated` Status)
3. Prüfen ob alle Services die auf dem Node laufen sollten, korrekt allokiert wurden

## Verwandte Seiten

- [Cluster-Neustart](./cluster-restart.md) -- Vollständiger Neustart des gesamten HashiCorp Stacks
- [Linstor/DRBD](../linstor-storage/index.md) -- Storage-Cluster und DRBD-Ressourcen
- [HashiCorp Stack](../nomad/index.md) -- Nomad Node Lifecycle und Drain-Konzept
- [Batch Jobs](./batch-jobs.md) -- Täglicher Reboot-Job der den Smart Shutdown nutzt
