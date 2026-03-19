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
