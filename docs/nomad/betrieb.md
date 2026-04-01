---
title: Nomad Betrieb
description: Job Deployment, Node Drain und Troubleshooting
tags:
  - nomad
  - betrieb
  - operations
---

# Nomad Betrieb

## Job Deployment

Nomad Jobs werden gegen den Cluster deployed. Da ACLs aktiv sind, wird für jede Interaktion mit der Nomad API ein Token benötigt.

| Eigenschaft | Wert |
|-------------|------|
| API-Endpunkt | `http://10.0.2.104:4646` (jeder Server nutzbar) |
| ACL | Aktiv -- Token erforderlich |
| Job-Verzeichnis | `/nfs/nomad/jobs/` |
| Token-Speicherort | [Credentials](../_referenz/credentials.md) |

Deployment erfolgt mit `nomad job run <jobfile>.nomad` unter Angabe von `NOMAD_ADDR` und `NOMAD_TOKEN`. Alle drei Server sind gleichwertig (Raft-Cluster) und als API-Endpunkt nutzbar.

::: info Nomad Policies
Die Policy `operator` erlaubt Jobs deployen, Logs lesen und Allocs verwalten. Für den regulären Betrieb reicht dieser Token.
:::

## Node Drain

Vor Wartungsarbeiten an einem Worker-Node (z.B. Proxmox-Host-Update) muss der Node drainiert werden. Dabei migriert Nomad alle laufenden Allocations auf andere Nodes.

Ablauf:

1. Node in Drain-Modus setzen mit `nomad node drain -enable <node-id>`
2. Warten bis alle Allocations migriert sind (Nomad UI oder `nomad node status`)
3. Wartung durchführen
4. Drain-Modus deaktivieren mit `nomad node drain -disable <node-id>`
5. Nomad plant neue Allocations automatisch auf den verfügbaren Node

::: warning Kapazität
Bei 3 Worker-Nodes und aktivem Drain eines Nodes laufen alle Container auf 2 Nodes. Prüfe vorab, ob die verbleibende Kapazität (CPU, RAM) ausreicht.
:::

## Garbage Collection

Nomad hält abgeschlossene Allocations und Evaluations für eine konfigurierbare Zeit vor. Bei vielen Batch-Jobs kann das zu Speicherverbrauch führen. Eine manuelle Garbage Collection kann über die API oder `nomad system gc` ausgelöst werden.

## Preemption

Service- und Batch-Preemption ist seit 01.04.2026 aktiviert. Nomad kann niedrigprioritäre Jobs verdrängen, um Platz für höherprioritäre zu schaffen.

**Anlass:** Am 20.03.2026 fiel ein Node aus und wurde 10 Tage nicht bemerkt. Postgres (Priorität 100) konnte nicht platziert werden, während niedrigprioritäre Jobs wie Handbrake (Priorität 60) die CPU-Kapazität belegten.

**Verhalten:**
- Mindest-Delta: 10 Prioritätspunkte (Prio 100 kann Prio 90 oder tiefer verdrängen)
- Verdrängte Jobs werden automatisch auf anderen Nodes neu platziert (sofern `reschedule` konfiguriert)
- Verdrängte Allocations haben `DesiredStatus = evict`
- Prüfen: `nomad operator scheduler get-config`

## Restart/Reschedule Policies

Alle CSI-Jobs haben `restart` und `reschedule` Stanzas für automatische Recovery:

- **restart**: Lokaler Neustart des Tasks bei Crashes (3 Versuche in 5 Minuten)
- **reschedule**: Platzierung auf einem anderen Node wenn lokale Restarts erschöpft sind
- **max_client_disconnect**: Wartet 5 Minuten bei kurzen Netzwerk-Ausfällen bevor rescheduled wird

::: warning Postgres-Sonderbehandlung
PostgreSQL hat eine begrenzte `reschedule`-Policy (max 3 Versuche in 30 Minuten, `mode = "fail"`). Bei wiederholtem Failure muss manuell eingegriffen werden -- endloses Failover zwischen Nodes mit DRBD `single-node-writer` kann zu Datenkorruption führen. DRBD ist die eigentliche Fencing-Schicht, nicht Nomad.
:::

## Troubleshooting

### Job startet nicht

1. `nomad job status <job>` prüfen -- zeigt den aktuellen Zustand und letzte Events
2. Evaluation prüfen: Gibt es Placement-Fehler (z.B. "insufficient resources")?
3. Allocation prüfen: `nomad alloc status <alloc-id>` zeigt Task-Events und Exit-Codes
4. Logs lesen: `nomad alloc logs <alloc-id> <task>` für stdout/stderr

### Container startet, ist aber nicht erreichbar

1. Consul prüfen: Ist der Service registriert? Health Check Status?
2. Port Mapping prüfen: Stimmt der dynamische Port mit dem Consul-Eintrag überein?
3. Traefik prüfen: Hat Traefik den Service aus dem Consul Catalog geladen?
4. DNS prüfen: Löst `<service>.service.consul` korrekt auf?

### Allocation bleibt in "pending"

1. `nomad job status <job>` -- Evaluation-Fehler prüfen
2. Häufigste Ursache: Nicht genügend Ressourcen auf den Worker-Nodes
3. `nomad node status` auf allen Clients prüfen -- verfügbare Kapazität anzeigen
4. Bei Volume-Constraints: Ist der NFS-Mount vorhanden? Ist das Linstor-Volume verfügbar?

**CSI Boot Race Condition:** Nach einem Node-Reboot können CSI-abhängige Jobs pending bleiben, weil das CSI Plugin beim Evaluation-Zeitpunkt noch nicht healthy ist. Nomad erstellt eine "blocked eval", die normalerweise nach 30-60s aufgelöst wird wenn das Plugin healthy wird. Falls das nicht passiert:

1. CSI Plugin Status prüfen: `nomad plugin status linstor.csi.linbit.com`
2. Blocked Evals prüfen: `nomad eval list -status=blocked`
3. Manuell re-evaluieren: `nomad job eval <job-name>`
4. Timer-Log prüfen: `journalctl -u nomad-csi-reeval` (läuft auf client-05/06)

Auf client-05/06 läuft ein `nomad-csi-reeval.timer`, der nach jedem Boot automatisch blockierte Jobs re-evaluiert. Details: [Linstor Betrieb](../linstor-storage/betrieb.md#csi-boot-race-condition)

### Node nicht erreichbar

1. SSH auf den betroffenen Node -- läuft der Nomad-Agent?
2. `systemctl status nomad` prüfen
3. Netzwerk prüfen: Ist der Node für die Server erreichbar?
4. Bei persistentem Problem: Node in der Nomad UI als "ineligible" markieren und Wartung planen

## Verwandte Seiten

- [Nomad Übersicht](index.md) -- Cluster-Architektur und Rolle im Stack
- [Nomad Referenz](referenz.md) -- Verzeichnisstruktur und Job-Konfigurationsmuster
- [Vault Betrieb](../vault/betrieb.md) -- Falls Secrets-Probleme die Ursache sind
- [Consul](../consul/) -- Service Discovery und Health Check Probleme
- [Proxmox Cluster](../proxmox/index.md) -- Host- und VM-Übersicht
